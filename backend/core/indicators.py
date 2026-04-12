"""기술적 지표 계산 모듈 — V2
- SMA: 5, 20, 60, 112, 224일
- 볼린저밴드: 20일, 2σ
- CCI: 20일
"""
import pandas as pd
import numpy as np


def add_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    for period in [5, 20, 60, 112, 224]:
        df[f"MA{period}"] = df["Close"].rolling(window=period).mean()
    return df


def add_bollinger_bands(df: pd.DataFrame, period: int = 20, std_mult: float = 2.0) -> pd.DataFrame:
    df["BB_Mid"] = df["Close"].rolling(window=period).mean()
    bb_std = df["Close"].rolling(window=period).std()
    df["BB_Upper"] = df["BB_Mid"] + (bb_std * std_mult)
    df["BB_Lower"] = df["BB_Mid"] - (bb_std * std_mult)
    band_width = df["BB_Upper"] - df["BB_Lower"]
    df["BB_PctB"] = np.where(
        band_width > 0,
        (df["Close"] - df["BB_Lower"]) / band_width,
        0.5,
    )
    return df


def add_cci(df: pd.DataFrame, period: int = 20) -> pd.DataFrame:
    tp = (df["High"] + df["Low"] + df["Close"]) / 3
    tp_sma = tp.rolling(window=period).mean()
    tp_mad = tp.rolling(window=period).apply(
        lambda x: np.mean(np.abs(x - np.mean(x))), raw=True
    )
    df["CCI"] = np.where(tp_mad > 0, (tp - tp_sma) / (0.015 * tp_mad), 0)
    return df


def calculate_all_indicators(df: pd.DataFrame) -> pd.DataFrame:
    df = add_moving_averages(df)
    df = add_bollinger_bands(df)
    df = add_cci(df)
    return df


# ── 조건 판별 함수 ──

def check_condition2(df: pd.DataFrame, lookback: int = 5) -> bool:
    """조건 2: 이동평균선 역배열 → 정배열 전환"""
    if len(df) < 225:
        return False
    required = ["MA5", "MA20", "MA60", "MA112", "MA224"]
    latest = df.iloc[-1]
    past = df.iloc[-(lookback + 1)]
    if any(pd.isna(latest.get(c)) for c in required) or any(pd.isna(past.get(c)) for c in required):
        return False

    # (a) 골든크로스: MA5가 MA20을 상향 돌파
    cond_a = (latest["MA5"] > latest["MA20"]) and (past["MA5"] <= past["MA20"])
    if not cond_a:
        recent = df.iloc[-(lookback + 1):]
        ma5_above = recent["MA5"] > recent["MA20"]
        if ma5_above.iloc[-1] and not ma5_above.iloc[0]:
            cond_a = True

    # (b) MA20이 MA60에 접근 (97% 이상) 또는 돌파
    cond_b = (latest["MA20"] / latest["MA60"]) >= 0.97 if latest["MA60"] > 0 else False

    # (c) 과거 역배열 확인
    cond_c = (past["MA224"] > past["MA112"]) and (past["MA60"] > past["MA20"])

    return cond_a and cond_b and cond_c


def check_condition3(df: pd.DataFrame, threshold: float = 0.10) -> bool:
    """조건 3: BB%B ≤ threshold (하단밴드 부근)"""
    if "BB_PctB" not in df.columns or len(df) < 20:
        return False
    val = df.iloc[-1]["BB_PctB"]
    if pd.isna(val):
        return False
    return val <= threshold


def check_condition4(df: pd.DataFrame, lookback: int = 3) -> bool:
    """조건 4: CCI -100 이하 → -100 이상 전환"""
    if "CCI" not in df.columns or len(df) < lookback + 1:
        return False
    recent = df.tail(lookback + 1)
    if recent["CCI"].isna().any():
        return False
    was_oversold = (recent["CCI"].iloc[:-1] < -100).any()
    now_above = recent["CCI"].iloc[-1] >= -100
    return was_oversold and now_above


def determine_signal(c2: bool, c3: bool, c4: bool) -> str:
    """신호 판정: 매수/관망/주의"""
    count = sum([c2, c3, c4])
    if count >= 3:
        return "매수"
    if c2 and c4:
        return "매수"
    if count == 2:
        return "관망"
    if c2:
        return "관망"
    return "주의"
