"""데이터 수집 모듈 (FinanceDataReader + pykrx 혼합)

원인: pykrx의 get_market_cap_by_ticker()가 최신 pandas와 호환되지 않아
      KeyError('종가', '시가총액', ...) 발생.
해결: 시총 상위 200종목은 FinanceDataReader.StockListing()으로 조회,
      일봉 OHLCV는 pykrx의 get_market_ohlcv_by_date()로 수집.
"""

import time
from datetime import datetime, timedelta

import pandas as pd
import FinanceDataReader as fdr
from pykrx import stock


def get_latest_business_date() -> str:
    """가장 최근 영업일을 YYYYMMDD 형식으로 반환"""
    today = datetime.now()
    while today.weekday() >= 5:
        today -= timedelta(days=1)
    return today.strftime("%Y%m%d")


def get_start_date(months_back: int = 14) -> str:
    """약 14개월 전 날짜 (224거래일 확보용)"""
    dt = datetime.now() - timedelta(days=months_back * 30)
    return dt.strftime("%Y%m%d")


def fetch_top200_tickers(date: str = None) -> pd.DataFrame:
    """KOSPI 시가총액 상위 200종목 조회 (FinanceDataReader 사용)"""
    kospi = fdr.StockListing("KOSPI")

    # Marcap(시가총액) 기준 정렬, 상위 200
    kospi = kospi[kospi["Marcap"] > 0].copy()
    kospi = kospi.sort_values("Marcap", ascending=False).head(200)

    # 기존 코드와의 호환성: index를 종목코드로, '시가총액' 컬럼 추가
    result = pd.DataFrame({
        "시가총액": kospi["Marcap"].values,
        "종목명": kospi["Name"].values,
        "종가": kospi["Close"].values,
    }, index=kospi["Code"].values)

    return result


def fetch_stock_ohlcv(
    ticker: str, start_date: str, end_date: str
) -> pd.DataFrame:
    """개별 종목 일봉 데이터 수집 (pykrx 사용 - 안정적)"""
    df = stock.get_market_ohlcv_by_date(start_date, end_date, ticker)
    if not df.empty:
        # pykrx 컬럼: 시가, 고가, 저가, 종가, 거래량 (+ 등락률)
        col_map = {}
        for c in df.columns:
            if "시가" in c:
                col_map[c] = "Open"
            elif "고가" in c:
                col_map[c] = "High"
            elif "저가" in c:
                col_map[c] = "Low"
            elif "종가" in c:
                col_map[c] = "Close"
            elif "거래량" in c:
                col_map[c] = "Volume"
        df = df.rename(columns=col_map)
        # 필요한 컬럼만 유지
        keep = [c for c in ["Open", "High", "Low", "Close", "Volume"] if c in df.columns]
        df = df[keep]
    return df


def fetch_stock_name(ticker: str) -> str:
    """종목코드로 종목명 조회"""
    try:
        name = stock.get_market_ticker_name(ticker)
        return name if name else ticker
    except Exception:
        return ticker


def fetch_all_stock_data(
    tickers: list, start_date: str = None, end_date: str = None, delay: float = 0.3
) -> dict:
    """200종목 일봉 데이터 일괄 수집 (딜레이 포함)"""
    if end_date is None:
        end_date = get_latest_business_date()
    if start_date is None:
        start_date = get_start_date()

    stock_data = {}
    for i, ticker in enumerate(tickers):
        try:
            df = fetch_stock_ohlcv(ticker, start_date, end_date)
            if not df.empty and len(df) > 0:
                stock_data[ticker] = df
            if delay > 0:
                time.sleep(delay)
        except Exception as e:
            print(f"[{i+1}/{len(tickers)}] {ticker} 수집 실패: {e}")
            continue

        if (i + 1) % 20 == 0:
            print(f"[{i+1}/{len(tickers)}] 수집 중...")

    return stock_data
