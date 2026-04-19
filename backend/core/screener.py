"""스크리닝 엔진 V2 — 4개 탭 조합"""

from datetime import datetime
from typing import Optional

import pandas as pd

from backend.core.data_fetcher import (
    fetch_all_stock_data,
    fetch_top200_tickers,
    get_latest_business_date,
)
from backend.core.indicators import (
    calculate_all_indicators,
    check_condition2,
    check_condition3,
    check_condition4,
    determine_signal,
)


def run_full_screening(date: str = None, progress_cb=None) -> dict:
    """
    전체 스크리닝 실행.
    progress_cb: 진행률 업데이트 콜백 (str) -> None
    Returns: {date, total_screened, results{cond_1_2, cond_1_2_3, cond_1_2_4, cond_1_2_3_4}, counts{...}}
    """
    def _progress(msg: str):
        print(msg)
        if progress_cb:
            progress_cb(msg)

    print("=" * 50)
    print("K-Stock Screener V2 스크리닝 시작")
    print("=" * 50)

    # 1. 시총 상위 200종목
    _progress("[1/4] 시가총액 상위 200종목 조회 중...")
    top200_df = fetch_top200_tickers(date)
    tickers = top200_df.index.tolist()
    names = {}
    caps = {}
    for t in tickers:
        if "종목명" in top200_df.columns:
            names[t] = top200_df.loc[t, "종목명"]
        caps[t] = int(top200_df.loc[t, "시가총액"])
    print(f"  → {len(tickers)}종목 조회 완료")

    # 2. 일봉 데이터 수집
    _progress(f"[2/4] 일봉 데이터 수집 시작 (약 2~3분 소요, 총 {len(tickers)}종목)")
    all_data = fetch_all_stock_data(tickers, delay=0.3, progress_cb=progress_cb)
    print(f"  → {len(all_data)}종목 데이터 수집 완료")

    # 3. 기술적 지표 계산
    _progress("[3/4] 기술적 지표 계산 중...")
    for ticker in all_data:
        all_data[ticker] = calculate_all_indicators(all_data[ticker])
    print("  → 계산 완료")

    # 4. 조건별 스크리닝
    _progress("[4/4] 조건별 스크리닝 실행 중...")
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
            continue

        latest = df.iloc[-1]
        prev_close = df.iloc[-2]["Close"] if len(df) >= 2 else latest["Close"]
        change_pct = ((latest["Close"] - prev_close) / prev_close * 100) if prev_close > 0 else 0
        signal = determine_signal(c2, c3, c4)

        stock_info = {
            "ticker": ticker,
            "name": names.get(ticker, ticker),
            "close": int(latest["Close"]),
            "change_pct": round(float(change_pct), 2),
            "ma5": round(float(latest.get("MA5", 0)), 0) if not pd.isna(latest.get("MA5")) else None,
            "ma20": round(float(latest.get("MA20", 0)), 0) if not pd.isna(latest.get("MA20")) else None,
            "ma60": round(float(latest.get("MA60", 0)), 0) if not pd.isna(latest.get("MA60")) else None,
            "ma112": round(float(latest.get("MA112", 0)), 0) if not pd.isna(latest.get("MA112")) else None,
            "ma224": round(float(latest.get("MA224", 0)), 0) if not pd.isna(latest.get("MA224")) else None,
            "bb_pctb": round(float(latest.get("BB_PctB", 0)), 2) if not pd.isna(latest.get("BB_PctB")) else None,
            "cci": round(float(latest.get("CCI", 0)), 1) if not pd.isna(latest.get("CCI")) else None,
            "volume": int(latest["Volume"]),
            "market_cap": caps.get(ticker, 0),
            "signal": signal,
            "cond2": bool(c2),
            "cond3": bool(c3),
            "cond4": bool(c4),
        }

        results["cond_1_2"].append(stock_info)
        if c3:
            results["cond_1_2_3"].append(stock_info)
        if c4:
            results["cond_1_2_4"].append(stock_info)
        if c3 and c4:
            results["cond_1_2_3_4"].append(stock_info)

    # 시가총액 순 정렬
    for key in results:
        results[key].sort(key=lambda x: x["market_cap"], reverse=True)

    # 실제 수집된 데이터의 마지막 거래일을 기준일로 사용
    actual_trading_date = None
    for df in all_data.values():
        if not df.empty:
            last = df.index[-1]
            d = last.strftime("%Y-%m-%d") if hasattr(last, 'strftime') else str(last)[:10]
            if actual_trading_date is None or d > actual_trading_date:
                actual_trading_date = d
            break

    if actual_trading_date:
        formatted_date = actual_trading_date
    else:
        screening_date = date or get_latest_business_date()
        if len(screening_date) == 8:
            formatted_date = f"{screening_date[:4]}-{screening_date[4:6]}-{screening_date[6:]}"
        else:
            formatted_date = screening_date

    report = {
        "date": formatted_date,
        "total_screened": len(tickers),
        "results": results,
        "counts": {k: len(v) for k, v in results.items()},
    }

    print(f"\n{'=' * 50}")
    print(f"스크리닝 완료: {formatted_date}")
    for k, v in report["counts"].items():
        print(f"  {k}: {v}종목")
    print(f"{'=' * 50}")

    return report
