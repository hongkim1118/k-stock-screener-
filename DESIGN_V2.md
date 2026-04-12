# K-Stock Screener — Claude Code 개발 설계서

## 프로젝트 정보
- **버전**: 2.0
- **작성일**: 2026.04.12
- **목적**: 코스피 시가총액 상위 200종목 대상 기술적 분석 자동 스크리닝 웹앱
- **개발도구**: Claude Code (터미널 기반 에이전트 코딩)

---

## 1. 프로젝트 구조

```
k-stock-screener/
├── backend/
│   ├── main.py                  # FastAPI 서버 진입점
│   ├── requirements.txt
│   ├── core/
│   │   ├── __init__.py
│   │   ├── data_fetcher.py      # pykrx 기반 데이터 수집
│   │   ├── indicators.py        # 기술적 지표 계산 (MA, BB, CCI)
│   │   └── screener.py          # 스크리닝 엔진 (조건 판별 + 조합)
│   ├── api/
│   │   ├── __init__.py
│   │   └── routes.py            # REST API 라우트
│   ├── db/
│   │   ├── __init__.py
│   │   ├── database.py          # SQLite 연결
│   │   └── models.py            # 테이블 정의
│   └── scheduler/
│       └── daily_job.py         # 매일 자동 실행
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── index.css
│       ├── types/
│       │   └── stock.ts         # 타입 정의
│       ├── services/
│       │   └── api.ts           # API 호출
│       ├── hooks/
│       │   ├── useScreening.ts  # 스크리닝 데이터
│       │   └── useWatchlist.ts  # 관심종목
│       └── components/
│           ├── Dashboard.tsx        # 메인 대시보드
│           ├── MarketSummary.tsx     # 상단 지표 카드 4개
│           ├── ScreeningTabs.tsx     # 탭 네비게이션
│           ├── ResultTable.tsx       # 종목 테이블
│           ├── SearchHistory.tsx     # 검색 이력
│           ├── Watchlist.tsx         # 관심종목
│           └── StockDetailModal.tsx  # 종목 상세 (차트)
└── data/
    └── kstock.db                # SQLite DB 파일
```

---

## 2. 스크리닝 조건 정의

### 조건 1 — 기본 필터 (필수)
코스피 시가총액 상위 200종목. 매일 장 마감 후 갱신.

### 조건 2 — 이동평균선 정배열 전환
| 항목 | 값 |
|------|-----|
| 사용 이동평균선 | MA5, MA20, MA60, MA112, MA224 (단순이동평균, SMA) |
| 정배열 정의 | MA5 > MA20 > MA60 > MA112 > MA224 |
| 역배열 정의 | MA224 > MA112 > MA60 > MA20 > MA5 |
| 전환 판별 | (a) 최근 5일 이내 MA5가 MA20을 상향 돌파 (b) MA20이 MA60 대비 97% 이상 접근 또는 돌파 (c) 과거 시점에서 역배열 상태 확인 |

### 조건 3 — 볼린저밴드 하단
| 항목 | 값 |
|------|-----|
| 기간 | 20일 |
| 표준편차 배수 | 2σ |
| 판별 기준 | BB%B ≤ 0.10 (하단밴드 부근 또는 아래) |
| BB%B 공식 | (종가 - 하단밴드) / (상단밴드 - 하단밴드) |

### 조건 4 — CCI 매수 전환
| 항목 | 값 |
|------|-----|
| CCI 기간 | 20일 |
| 과매도 기준 | CCI < -100 |
| 매수 전환 판별 | 최근 3일 이내 CCI가 -100 이하였다가 현재 -100 이상으로 전환 |

### 조건 조합 (탭 4개)

```
탭 1: 조건 1 & 2          → 정배열 전환 종목
탭 2: 조건 1 & 2 & 3      → 정배열 전환 + BB 하단
탭 3: 조건 1 & 2 & 4      → 정배열 전환 + CCI 전환 (BB 제외)
탭 4: 조건 1 & 2 & 3 & 4  → 전체 조건 충족
```

---

## 3. 백엔드 상세 설계

### 3.1 requirements.txt

```
fastapi==0.115.0
uvicorn[standard]==0.30.0
pykrx==1.0.45
pandas==2.2.0
numpy==1.26.0
sqlalchemy==2.0.30
apscheduler==3.10.4
pydantic==2.7.0
python-dateutil==2.9.0
```

### 3.2 데이터 수집 — backend/core/data_fetcher.py

```python
"""
pykrx 기반 KOSPI 데이터 수집 모듈
- 시가총액 상위 200종목 목록 조회
- 개별 종목 일봉(OHLCV) 데이터 수집
- API 호출 제한 대응: 요청 간 0.5초 딜레이
"""
import time
from datetime import datetime, timedelta
from pykrx import stock
import pandas as pd


def get_latest_trading_date() -> str:
    """가장 최근 거래일 반환 (YYYYMMDD 형식)"""
    today = datetime.now()
    # 주말이면 금요일로 조정
    if today.weekday() == 5:  # 토요일
        today -= timedelta(days=1)
    elif today.weekday() == 6:  # 일요일
        today -= timedelta(days=2)
    return today.strftime("%Y%m%d")


def fetch_top200(date: str = None) -> pd.DataFrame:
    """
    코스피 시가총액 상위 200종목 조회
    
    Returns:
        DataFrame with columns: [ticker, name, market_cap, rank]
    """
    if date is None:
        date = get_latest_trading_date()
    
    # 시가총액 조회
    cap = stock.get_market_cap_by_ticker(date, market="KOSPI")
    
    if cap.empty:
        # 공휴일 등으로 데이터 없으면 전일 시도
        prev = (datetime.strptime(date, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")
        cap = stock.get_market_cap_by_ticker(prev, market="KOSPI")
    
    # 상위 200 추출
    top200 = cap.sort_values("시가총액", ascending=False).head(200)
    
    result = []
    for ticker in top200.index:
        name = stock.get_market_ticker_name(ticker)
        result.append({
            "ticker": ticker,
            "name": name,
            "market_cap": int(top200.loc[ticker, "시가총액"]),
            "rank": len(result) + 1
        })
    
    return pd.DataFrame(result)


def fetch_ohlcv(ticker: str, start_date: str, end_date: str) -> pd.DataFrame:
    """
    개별 종목 일봉 OHLCV 데이터 수집
    
    Args:
        ticker: 종목코드 (예: "005930")
        start_date: 시작일 (YYYYMMDD)
        end_date: 종료일 (YYYYMMDD)
    
    Returns:
        DataFrame with columns: [Open, High, Low, Close, Volume]
        index: DatetimeIndex
    """
    df = stock.get_market_ohlcv_by_date(start_date, end_date, ticker)
    
    if df.empty:
        return df
    
    df.columns = ["Open", "High", "Low", "Close", "Volume"]
    return df


def fetch_all_top200_ohlcv(top200_tickers: list, days: int = 300) -> dict:
    """
    상위 200종목의 일봉 데이터를 일괄 수집
    MA224 계산을 위해 최소 300거래일 필요
    
    Args:
        top200_tickers: 종목코드 리스트
        days: 수집할 거래일 수 (기본 300일, 약 14개월)
    
    Returns:
        dict: {종목코드: DataFrame}
    """
    end_date = get_latest_trading_date()
    # 거래일 기준 days일 전 (캘린더 기준 약 1.5배)
    start_dt = datetime.strptime(end_date, "%Y%m%d") - timedelta(days=int(days * 1.5))
    start_date = start_dt.strftime("%Y%m%d")
    
    all_data = {}
    total = len(top200_tickers)
    
    for i, ticker in enumerate(top200_tickers):
        try:
            df = fetch_ohlcv(ticker, start_date, end_date)
            if not df.empty and len(df) >= 224:
                all_data[ticker] = df
            print(f"  [{i+1}/{total}] {ticker} - {len(df)}일 수집 완료")
        except Exception as e:
            print(f"  [{i+1}/{total}] {ticker} - 오류: {e}")
        
        # pykrx API 호출 제한 대응
        time.sleep(0.3)
    
    return all_data
```

### 3.3 기술적 지표 계산 — backend/core/indicators.py

```python
"""
기술적 지표 계산 모듈
- SMA (단순이동평균): 5, 20, 60, 112, 224일
- 볼린저밴드: 20일, 2σ
- CCI (상품채널지수): 20일
"""
import pandas as pd
import numpy as np


def add_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    """
    단순이동평균(SMA) 계산
    
    SMA = 최근 N일 종가의 산술평균
    예) MA5 = (오늘 종가 + 어제 종가 + ... + 4일전 종가) / 5
    """
    for period in [5, 20, 60, 112, 224]:
        df[f"MA{period}"] = df["Close"].rolling(window=period).mean()
    return df


def add_bollinger_bands(df: pd.DataFrame, period: int = 20, std_mult: float = 2.0) -> pd.DataFrame:
    """
    볼린저밴드 계산
    
    - 중심선(BB_Mid): 20일 SMA
    - 상단(BB_Upper): 중심선 + (20일 표준편차 × 2)
    - 하단(BB_Lower): 중심선 - (20일 표준편차 × 2)
    - %B(BB_PctB): (종가 - 하단) / (상단 - 하단)
      → 0 = 하단밴드 위치, 1 = 상단밴드 위치
      → 0 이하 = 하단밴드 아래(과매도)
    """
    df["BB_Mid"] = df["Close"].rolling(window=period).mean()
    bb_std = df["Close"].rolling(window=period).std()
    df["BB_Upper"] = df["BB_Mid"] + (bb_std * std_mult)
    df["BB_Lower"] = df["BB_Mid"] - (bb_std * std_mult)
    
    band_width = df["BB_Upper"] - df["BB_Lower"]
    df["BB_PctB"] = np.where(
        band_width > 0,
        (df["Close"] - df["BB_Lower"]) / band_width,
        0.5  # 밴드 폭이 0이면 중립
    )
    return df


def add_cci(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    """
    CCI(Commodity Channel Index, 상품채널지수) 계산
    
    공식:
      TP(Typical Price) = (고가 + 저가 + 종가) / 3
      CCI = (TP - TP의 SMA) / (0.015 × TP의 평균절대편차)
    
    해석:
      CCI > +100  → 과매수 구간
      CCI < -100  → 과매도 구간
      -100 상향 돌파 → 매수 전환 신호
    """
    tp = (df["High"] + df["Low"] + df["Close"]) / 3
    tp_sma = tp.rolling(window=period).mean()
    tp_mad = tp.rolling(window=period).apply(
        lambda x: np.mean(np.abs(x - np.mean(x))), raw=True
    )
    
    df["CCI"] = np.where(
        tp_mad > 0,
        (tp - tp_sma) / (0.015 * tp_mad),
        0
    )
    return df


def calculate_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """모든 기술적 지표를 한 번에 계산"""
    df = add_moving_averages(df)
    df = add_bollinger_bands(df)
    df = add_cci(df)
    return df
```

### 3.4 스크리닝 엔진 — backend/core/screener.py

```python
"""
스크리닝 엔진
- 4가지 조건 개별 판별
- 4가지 조합 생성 (탭 1~4)
- 결과 리포트 생성
"""
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Optional
from .indicators import calculate_all_indicators
from .data_fetcher import fetch_top200, fetch_all_top200_ohlcv


# ──────────────────────────────────────
# 조건 판별 함수
# ──────────────────────────────────────

def check_condition2(df: pd.DataFrame, lookback: int = 5) -> bool:
    """
    조건 2: 이동평균선 역배열 → 정배열 전환
    
    판별 기준:
    (a) 최근 lookback일 이내에 MA5가 MA20을 상향 돌파
    (b) MA20이 MA60 대비 97% 이상 접근 또는 돌파
    (c) 과거 시점(lookback+1일 전)에서 역배열 상태였음
    
    Returns: True면 조건 충족
    """
    if len(df) < 225:
        return False
    
    required_cols = ["MA5", "MA20", "MA60", "MA112", "MA224"]
    if any(col not in df.columns for col in required_cols):
        return False
    
    latest = df.iloc[-1]
    past = df.iloc[-(lookback + 1)]
    
    # NaN 체크
    if any(pd.isna(latest[c]) for c in required_cols):
        return False
    if any(pd.isna(past[c]) for c in required_cols):
        return False
    
    # (a) MA5 > MA20 골든크로스 발생 (최근 전환)
    cond_a = (latest["MA5"] > latest["MA20"]) and (past["MA5"] <= past["MA20"])
    
    # (a') 또는, lookback 기간 내 어느 시점에서 크로스 발생
    if not cond_a:
        recent = df.iloc[-(lookback + 1):]
        ma5_above = recent["MA5"] > recent["MA20"]
        if ma5_above.iloc[-1] and not ma5_above.iloc[0]:
            cond_a = True
    
    # (b) MA20이 MA60에 접근 중 (비율 >= 0.97) 또는 이미 돌파
    if latest["MA60"] > 0:
        ma20_ratio = latest["MA20"] / latest["MA60"]
        cond_b = ma20_ratio >= 0.97
    else:
        cond_b = False
    
    # (c) 과거 역배열 확인 (장기선이 단기선 위)
    cond_c = (past["MA224"] > past["MA112"]) and (past["MA60"] > past["MA20"])
    
    return cond_a and cond_b and cond_c


def check_condition3(df: pd.DataFrame, threshold: float = 0.10) -> bool:
    """
    조건 3: 볼린저밴드 하단 부근
    
    BB%B ≤ threshold (기본 0.10)
    → 주가가 하단밴드 근처이거나 아래에 위치
    
    Returns: True면 조건 충족
    """
    if "BB_PctB" not in df.columns or len(df) < 20:
        return False
    
    latest_pctb = df.iloc[-1]["BB_PctB"]
    if pd.isna(latest_pctb):
        return False
    
    return latest_pctb <= threshold


def check_condition4(df: pd.DataFrame, lookback: int = 3) -> bool:
    """
    조건 4: CCI 과매도 → 매수 전환
    
    판별: 최근 lookback일 이내 CCI < -100 이었다가,
          현재 CCI >= -100으로 전환
    
    Returns: True면 조건 충족
    """
    if "CCI" not in df.columns or len(df) < lookback + 1:
        return False
    
    recent = df.tail(lookback + 1)
    
    if recent["CCI"].isna().any():
        return False
    
    was_oversold = (recent["CCI"].iloc[:-1] < -100).any()
    now_above = recent["CCI"].iloc[-1] >= -100
    
    return was_oversold and now_above


# ──────────────────────────────────────
# 신호 판정
# ──────────────────────────────────────

def determine_signal(cond2: bool, cond3: bool, cond4: bool) -> str:
    """
    종합 신호 판정
    - 매수: 3개 이상 충족, 또는 조건2+4 동시 충족
    - 관망: 2개 충족
    - 주의: 1개만 충족
    """
    count = sum([cond2, cond3, cond4])
    if count >= 3:
        return "매수"
    elif cond2 and cond4:
        return "매수"
    elif count == 2:
        return "관망"
    elif cond2:
        return "관망"
    else:
        return "주의"


# ──────────────────────────────────────
# 메인 스크리닝 실행
# ──────────────────────────────────────

def run_full_screening(date: str = None) -> dict:
    """
    전체 스크리닝 프로세스 실행
    
    Returns:
        {
            "date": "2026-04-10",
            "kospi_index": 5859.0,
            "total_screened": 200,
            "results": {
                "cond_1_2": [...],       # 탭1: 조건1&2
                "cond_1_2_3": [...],     # 탭2: 조건1&2&3
                "cond_1_2_4": [...],     # 탭3: 조건1&2&4 (BB 제외)
                "cond_1_2_3_4": [...],   # 탭4: 전체충족
            },
            "counts": {
                "cond_1_2": 12,
                "cond_1_2_3": 4,
                "cond_1_2_4": 3,
                "cond_1_2_3_4": 1
            }
        }
    """
    print("=" * 50)
    print("K-Stock Screener 스크리닝 시작")
    print("=" * 50)
    
    # 1단계: 시총 상위 200종목 조회
    print("\n[1/4] 시가총액 상위 200종목 조회 중...")
    top200_df = fetch_top200(date)
    tickers = top200_df["ticker"].tolist()
    names = dict(zip(top200_df["ticker"], top200_df["name"]))
    caps = dict(zip(top200_df["ticker"], top200_df["market_cap"]))
    print(f"  → {len(tickers)}종목 조회 완료")
    
    # 2단계: 일봉 데이터 수집
    print("\n[2/4] 일봉 데이터 수집 중 (약 3~5분 소요)...")
    all_data = fetch_all_top200_ohlcv(tickers, days=300)
    print(f"  → {len(all_data)}종목 데이터 수집 완료")
    
    # 3단계: 기술적 지표 계산
    print("\n[3/4] 기술적 지표 계산 중...")
    for ticker in all_data:
        all_data[ticker] = calculate_all_indicators(all_data[ticker])
    print("  → 계산 완료")
    
    # 4단계: 조건별 스크리닝
    print("\n[4/4] 조건별 스크리닝 실행 중...")
    results = {
        "cond_1_2": [],
        "cond_1_2_3": [],
        "cond_1_2_4": [],
        "cond_1_2_3_4": [],
    }
    
    for ticker in tickers:
        df = all_data.get(ticker)
        if df is None or len(df) < 225:
            continue
        
        c2 = check_condition2(df)
        c3 = check_condition3(df)
        c4 = check_condition4(df)
        
        if not c2:
            continue  # 조건2 미충족이면 모든 탭에서 제외
        
        latest = df.iloc[-1]
        prev_close = df.iloc[-2]["Close"] if len(df) >= 2 else latest["Close"]
        change_pct = ((latest["Close"] - prev_close) / prev_close * 100) if prev_close > 0 else 0
        
        signal = determine_signal(c2, c3, c4)
        
        stock_info = {
            "ticker": ticker,
            "name": names.get(ticker, ticker),
            "close": int(latest["Close"]),
            "change_pct": round(change_pct, 2),
            "ma5": round(latest.get("MA5", 0), 0),
            "ma20": round(latest.get("MA20", 0), 0),
            "ma60": round(latest.get("MA60", 0), 0),
            "ma112": round(latest.get("MA112", 0), 0),
            "ma224": round(latest.get("MA224", 0), 0),
            "bb_pctb": round(latest.get("BB_PctB", 0), 2),
            "cci": round(latest.get("CCI", 0), 1),
            "volume": int(latest["Volume"]),
            "market_cap": caps.get(ticker, 0),
            "signal": signal,
            "cond2": c2,
            "cond3": c3,
            "cond4": c4,
        }
        
        # 탭1: 조건 1&2 (정배열 전환)
        results["cond_1_2"].append(stock_info)
        
        # 탭2: 조건 1&2&3 (정배열 + BB하단)
        if c3:
            results["cond_1_2_3"].append(stock_info)
        
        # 탭3: 조건 1&2&4 (정배열 + CCI전환, BB 제외)
        if c4:
            results["cond_1_2_4"].append(stock_info)
        
        # 탭4: 조건 1&2&3&4 (전체 충족)
        if c3 and c4:
            results["cond_1_2_3_4"].append(stock_info)
    
    # 각 탭 결과를 시가총액 순으로 정렬
    for key in results:
        results[key].sort(key=lambda x: x["market_cap"], reverse=True)
    
    screening_date = date or get_latest_trading_date()
    formatted_date = f"{screening_date[:4]}-{screening_date[4:6]}-{screening_date[6:]}"
    
    report = {
        "date": formatted_date,
        "total_screened": len(tickers),
        "results": results,
        "counts": {k: len(v) for k, v in results.items()},
    }
    
    print(f"\n{'=' * 50}")
    print(f"스크리닝 완료: {formatted_date}")
    print(f"  조건 1&2:       {report['counts']['cond_1_2']}종목")
    print(f"  조건 1&2&3:     {report['counts']['cond_1_2_3']}종목")
    print(f"  조건 1&2&4:     {report['counts']['cond_1_2_4']}종목")
    print(f"  조건 1&2&3&4:   {report['counts']['cond_1_2_3_4']}종목")
    print(f"{'=' * 50}")
    
    return report
```

### 3.5 REST API — backend/api/routes.py

```python
"""
REST API 엔드포인트
"""
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json
from datetime import datetime

app = FastAPI(title="K-Stock Screener API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── 스크리닝 ───

@app.get("/api/screening/latest")
async def get_latest_screening():
    """최신 스크리닝 결과 조회"""
    # DB에서 가장 최근 결과 조회
    pass

@app.post("/api/screening/run")
async def run_screening():
    """스크리닝 수동 실행"""
    from ..core.screener import run_full_screening
    result = run_full_screening()
    # DB에 저장
    return result

@app.get("/api/screening/history")
async def get_screening_history(
    limit: int = Query(default=30, ge=1, le=100)
):
    """스크리닝 이력 조회 (최근 N일)"""
    pass

@app.get("/api/screening/{date}")
async def get_screening_by_date(date: str):
    """특정 날짜 스크리닝 결과 조회 (YYYY-MM-DD)"""
    pass


# ─── 관심종목 ───

class WatchlistItem(BaseModel):
    ticker: str
    name: str
    group_name: str = "기본"
    memo: str = ""

@app.get("/api/watchlist")
async def get_watchlist():
    """관심종목 목록 조회"""
    pass

@app.post("/api/watchlist")
async def add_to_watchlist(item: WatchlistItem):
    """관심종목 추가"""
    pass

@app.delete("/api/watchlist/{ticker}")
async def remove_from_watchlist(ticker: str):
    """관심종목 삭제"""
    pass

@app.put("/api/watchlist/{ticker}")
async def update_watchlist_item(ticker: str, item: WatchlistItem):
    """관심종목 수정"""
    pass


# ─── 개별 종목 ───

@app.get("/api/stock/{ticker}")
async def get_stock_detail(ticker: str, days: int = 60):
    """개별 종목 상세 (일봉 + 지표)"""
    pass

@app.get("/api/market/top200")
async def get_top200():
    """현재 시총 상위 200종목"""
    pass
```

### 3.6 데이터베이스 — backend/db/database.py

```python
"""SQLite 데이터베이스 설정"""
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "sqlite:///./data/kstock.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()


class ScreeningResult(Base):
    __tablename__ = "screening_results"
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String, nullable=False, index=True)
    ticker = Column(String, nullable=False)
    name = Column(String)
    close_price = Column(Integer)
    change_pct = Column(Float)
    ma5 = Column(Float)
    ma20 = Column(Float)
    ma60 = Column(Float)
    ma112 = Column(Float)
    ma224 = Column(Float)
    bb_pctb = Column(Float)
    cci = Column(Float)
    volume = Column(Integer)
    market_cap = Column(Integer)
    signal = Column(String)         # "매수", "관망", "주의"
    cond2_met = Column(Boolean, default=False)
    cond3_met = Column(Boolean, default=False)
    cond4_met = Column(Boolean, default=False)


class ScreeningSummary(Base):
    __tablename__ = "screening_summary"
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(String, nullable=False, unique=True, index=True)
    total_screened = Column(Integer)
    cond_1_2_count = Column(Integer)
    cond_1_2_3_count = Column(Integer)
    cond_1_2_4_count = Column(Integer)
    cond_1_2_3_4_count = Column(Integer)


class Watchlist(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    added_date = Column(String, nullable=False)
    group_name = Column(String, default="기본")
    memo = Column(Text, default="")
    sort_order = Column(Integer, default=0)


def init_db():
    Base.metadata.create_all(bind=engine)
```

### 3.7 FastAPI 진입점 — backend/main.py

```python
"""FastAPI 서버 진입점"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db.database import init_db
from .api.routes import app

import uvicorn

# DB 초기화
init_db()

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
```

---

## 4. 프론트엔드 상세 설계

### 4.1 TypeScript 타입 — frontend/src/types/stock.ts

```typescript
export interface StockItem {
  ticker: string;
  name: string;
  close: number;
  change_pct: number;
  ma5: number;
  ma20: number;
  ma60: number;
  ma112: number;
  ma224: number;
  bb_pctb: number;
  cci: number;
  volume: number;
  market_cap: number;
  signal: "매수" | "관망" | "주의";
  cond2: boolean;
  cond3: boolean;
  cond4: boolean;
}

export interface ScreeningResult {
  date: string;
  total_screened: number;
  results: {
    cond_1_2: StockItem[];
    cond_1_2_3: StockItem[];
    cond_1_2_4: StockItem[];
    cond_1_2_3_4: StockItem[];
  };
  counts: {
    cond_1_2: number;
    cond_1_2_3: number;
    cond_1_2_4: number;
    cond_1_2_3_4: number;
  };
}

export interface ScreeningHistoryItem {
  date: string;
  cond_1_2: number;
  cond_1_2_3: number;
  cond_1_2_4: number;
  cond_1_2_3_4: number;
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  group_name: string;
  memo: string;
  added_date: string;
  current_signal?: string;
}

export type TabKey = "cond_1_2" | "cond_1_2_3" | "cond_1_2_4" | "cond_1_2_3_4";

export interface TabConfig {
  key: TabKey;
  label: string;
  description: string;
}

export const TABS: TabConfig[] = [
  {
    key: "cond_1_2",
    label: "조건 1&2",
    description: "정배열 전환"
  },
  {
    key: "cond_1_2_3",
    label: "조건 1&2&3",
    description: "정배열 + BB하단"
  },
  {
    key: "cond_1_2_4",
    label: "조건 1&2&4",
    description: "정배열 + CCI (BB제외)"
  },
  {
    key: "cond_1_2_3_4",
    label: "조건 1&2&3&4",
    description: "전체 조건 충족"
  },
];
```

### 4.2 UI 레이아웃 명세 (화면 그대로 구현)

```
┌──────────────────────────────────────────────────────────────────┐
│  [KS] K-Stock Screener                    [2026.04.10] [실행]    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │KOSPI 지수 │ │스크리닝   │ │조건 1&2  │ │전체 조건  │            │
│  │  5,859   │ │대상      │ │충족      │ │충족      │            │
│  │ +1.40%   │ │  200     │ │  12      │ │   1      │            │
│  │          │ │시총 상위  │ │정배열전환 │ │1&2&3&4   │            │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ [조건1&2(12)] [조건1&2&3(4)] [조건1&2&4(3)] [전체(1)]    │    │
│  │  ← 클릭하면 탭 전환, 활성탭은 파란색 밑줄+굵은글씨       │    │
│  ├──────────────────────────────────────────────────────────┤    │
│  │                                                          │    │
│  │  종목    | 종가    | 등락률 | MA5   | MA20  | BB%B | CCI │    │
│  │  ────────────────────────────────────────────────────── │    │
│  │  LG에너지 | 412,000| +3.33%| 405.2K| 398.1K| 0.08|-92.4│    │
│  │  솔루션   |        |       |       |       |     |     │    │
│  │  373220   |        | 녹색  |       |       |     | [매수]│    │
│  │  ────────────────────────────────────────────────────── │    │
│  │  KB금융   | 98,200 | +2.46%| 96.8K | 94.5K | 0.15|-78.3│    │
│  │  105560   |        | 녹색  |       |       |     | [관망]│    │
│  │  ...                                                     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────── 검색 이력 ─────────────────────────────┐    │
│  │  2026.04.10   1&2: 12  1&2&3: 4  1&2&4: 3  전체: 1     │    │
│  │  2026.04.09   1&2: 8   1&2&3: 2  1&2&4: 2  전체: 0     │    │
│  │  2026.04.08   1&2: 15  1&2&3: 5  1&2&4: 4  전체: 2     │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│  ┌────────────────── 관심종목 ──────────────────────────────┐    │
│  │  KB금융(105560)      98,200    [1&2&3]                   │    │
│  │  한화에어로(012450)   510,000   [미충족]                   │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 4.3 주요 컴포넌트 동작 명세

#### MarketSummary.tsx — 상단 지표 카드 4개
```
- 4열 그리드 (모바일에서는 2×2)
- 카드 배경: 회색(secondary), 모서리 둥글게
- KOSPI 지수: 큰 숫자 + 등락률(녹색/빨간색)
- 스크리닝 대상: "200" + "시총 상위"
- 조건1&2 충족: 종목 수(파란색) + "정배열 전환"
- 전체 조건 충족: 종목 수(녹색) + "1&2&3&4"
```

#### ScreeningTabs.tsx — 탭 네비게이션 (4개 탭)
```
탭 구성:
  탭1: "조건 1&2 (N)"         → cond_1_2
  탭2: "조건 1&2&3 (N)"       → cond_1_2_3
  탭3: "조건 1&2&4 (N)"       → cond_1_2_4     ← 새로 추가 (BB 제외)
  탭4: "조건 1&2&3&4 (N)"     → cond_1_2_3_4

동작:
  - 클릭하면 해당 탭 활성화 (파란색 글씨 + 하단 파란색 2px 밑줄)
  - 비활성 탭: 회색 글씨, 밑줄 없음
  - 탭 전환 시 아래 ResultTable 데이터 교체
  - (N)은 해당 조합의 종목 수
```

#### ResultTable.tsx — 스크리닝 결과 테이블
```
컬럼 구성:
  종목    | 종가    | 등락률  | MA5   | MA20  | BB%B | CCI  | 신호 | ⭐

종목 셀:
  - 첫 줄: 종목명 (굵은글씨)
  - 둘째 줄: 종목코드 (회색, 작은글씨)

등락률 셀:
  - 양수: 녹색(success) "+3.33%"
  - 음수: 빨간색(danger) "-0.40%"
  - 0: 기본색 "0.00%"

신호 셀:
  - "매수": 녹색 배경 배지
  - "관망": 노란색 배경 배지
  - "주의": 파란색 배경 배지

⭐ 셀:
  - 미등록: ☆ (빈 별, 회색)
  - 등록됨: ★ (채워진 별, 노란색)
  - 클릭 시 관심종목 토글

정렬:
  - 기본: 시가총액 순 (내림차순)
  - 헤더 클릭 시 해당 컬럼 기준 정렬 토글
```

#### SearchHistory.tsx — 검색 이력
```
- 날짜별 카드 형태로 누적 (최신 → 과거 순)
- 각 카드: 날짜 + 4개 조합별 종목 수 표시
  "2026.04.10   1&2: 12  1&2&3: 4  1&2&4: 3  전체: 1"
- 카드 클릭: 해당 날짜의 상세 결과로 전환
- 최대 30일 이력 표시
```

#### Watchlist.tsx — 관심종목
```
- 종목명, 종목코드, 현재가, 현재 충족 조건 배지 표시
- ⭐ 클릭으로 추가/삭제
- "편집" 버튼: 그룹 분류, 메모 기능
- 충족 배지: [1&2], [1&2&3], [1&2&4], [전체], [미충족]
```

### 4.4 색상 및 스타일 규칙

```css
/* 테마 색상 */
--positive: #16a34a;     /* 상승, 매수 */
--negative: #dc2626;     /* 하락 */
--warning: #d97706;      /* 관망 */
--info: #2563eb;         /* 주의, 활성탭 */
--muted: #6b7280;        /* 비활성, 보조텍스트 */

/* 배지 */
.badge-buy    { background: #dcfce7; color: #166534; }
.badge-watch  { background: #fef3c7; color: #92400e; }
.badge-caution{ background: #dbeafe; color: #1e40af; }

/* 탭 */
.tab-active   { color: #2563eb; border-bottom: 2px solid #2563eb; font-weight: 600; }
.tab-inactive { color: #6b7280; border-bottom: 2px solid transparent; }

/* 테이블 */
.table-header { color: #6b7280; font-weight: 400; font-size: 12px; }
.table-row    { border-bottom: 1px solid #f3f4f6; }
```

---

## 5. Claude Code 개발 순서

아래 프롬프트를 Claude Code에 순서대로 입력하여 개발합니다.

### Phase 1: 프로젝트 초기화 + 백엔드 핵심 엔진

```
이 설계서(DESIGN_V2.md)를 읽고 K-Stock Screener 프로젝트를 시작해줘.

1단계로 프로젝트 디렉터리를 만들고, 백엔드 핵심 모듈을 구현해줘:
- backend/core/data_fetcher.py (pykrx 기반 데이터 수집)
- backend/core/indicators.py (MA, BB, CCI 계산)
- backend/core/screener.py (4가지 조건 판별 + 4개 탭 조합)
- backend/db/database.py (SQLite 스키마)

설계서의 코드를 기반으로 하되, 에러 처리를 보강해줘.
pykrx가 설치 안 되어 있으면 pip install 해줘.
테스트로 스크리닝을 1회 실행해서 결과를 확인해줘.
```

### Phase 2: FastAPI 서버

```
Phase 2: FastAPI REST API를 구현해줘.

- backend/main.py (서버 진입점)
- backend/api/routes.py (모든 엔드포인트)
- 스크리닝 결과 DB 저장/조회
- 관심종목 CRUD
- 검색 이력 조회
- CORS 설정 (프론트엔드 연동용)

uvicorn으로 서버를 띄우고, curl로 API를 테스트해줘.
```

### Phase 3: 프론트엔드 기본 구조

```
Phase 3: React + TypeScript + Tailwind CSS 프론트엔드를 만들어줘.

설계서 섹션 4의 UI 명세를 정확히 따라서:
- 상단: MarketSummary (4개 지표 카드)
- 중단: ScreeningTabs (4개 탭, 클릭으로 전환) + ResultTable
- 하단: SearchHistory + Watchlist

탭 4개 구성:
  탭1: 조건 1&2 (정배열 전환)
  탭2: 조건 1&2&3 (정배열 + BB하단)
  탭3: 조건 1&2&4 (정배열 + CCI, BB제외)
  탭4: 조건 1&2&3&4 (전체 충족)

모든 탭이 클릭 가능해야 하고, 탭 전환 시 테이블 데이터가 교체돼야 해.
우선 목업 데이터로 동작하게 만들고, API 연동은 Phase 4에서.
Vite로 dev server를 띄워서 확인해줘.
```

### Phase 4: API 연동 + 완성

```
Phase 4: 프론트엔드와 백엔드를 연동해줘.

- API 호출 서비스 (frontend/src/services/api.ts)
- React Query로 데이터 페칭
- 스크리닝 실행 버튼 → POST /api/screening/run
- 관심종목 ⭐ 클릭 → POST/DELETE /api/watchlist
- 검색 이력 → GET /api/screening/history
- 에러 상태, 로딩 상태 UI

실제 pykrx로 데이터를 가져와서 스크리닝 결과가 화면에 표시되는지 확인해줘.
```

### Phase 5: 차트 + 고도화 (선택)

```
Phase 5: 종목 상세 모달에 캔들스틱 차트를 추가해줘.

- lightweight-charts 또는 recharts 사용
- 종목명 클릭 → 모달 팝업
- 캔들스틱 차트 + MA5/MA20/MA60 오버레이
- 볼린저밴드 상단/하단 오버레이
- 하단 CCI 서브차트 (-100 기준선)
```

---

## 6. 핵심 주의사항

### 6.1 pykrx 사용 시 주의

```python
# 1. API 호출 간격: 최소 0.3초 딜레이 (차단 방지)
time.sleep(0.3)

# 2. 장 마감 후 데이터 확정: 16:30 이후 수집 권장

# 3. 주말/공휴일: 데이터 없음 → 가장 최근 거래일로 자동 조정

# 4. MA224 계산: 최소 224거래일(약 11개월) 과거 데이터 필요
#    → start_date를 약 14개월 전으로 설정
```

### 6.2 조건 2+3 동시 충족 가능성

정배열 전환(상승 초기)과 BB하단(저가)은 동시에 충족되기 어려울 수 있습니다.
`check_condition3`의 `threshold` 파라미터를 0.05~0.20 범위에서 조절할 수 있도록
설정 UI에 슬라이더를 추가하는 것을 권장합니다.

### 6.3 데이터 컬럼명 통일

```
pykrx 원본     →  내부 통일 컬럼명
────────────────────────────
시가           →  Open
고가           →  High
저가           →  Low
종가           →  Close
거래량         →  Volume
```

### 6.4 숫자 표시 포맷

```
종가/MA: 천 단위 콤마  예) 204,000
등락률: 소수점 2자리   예) +3.33%, -0.40%
BB%B: 소수점 2자리     예) 0.08
CCI: 소수점 1자리      예) -92.4
시총: 조 단위          예) 1,218.7조
거래량: 천 단위 콤마    예) 12,450,300
```

---

## 7. 향후 확장 로드맵

| 우선순위 | 기능 | 설명 |
|---------|------|------|
| 1 | 스케줄러 | APScheduler로 매일 16:30 자동 실행 |
| 2 | 알림 | 텔레그램/카카오톡 봇 연동 |
| 3 | 백테스팅 | 과거 6개월 데이터로 전략 수익률 검증 |
| 4 | 커스텀 조건 | MA 기간, BB threshold, CCI 기간 사용자 설정 |
| 5 | 리포트 | PDF/엑셀 일일 리포트 자동 생성 |
| 6 | 코스닥 확장 | 코스닥 시총 상위 종목까지 범위 확대 |
| 7 | AI 분석 | Claude API로 스크리닝 결과 자연어 분석 |

---

*K-Stock Screener 설계서 v2.0 — Claude Code 개발용*
*2026.04.12*
