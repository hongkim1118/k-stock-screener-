"""Pydantic 스키마 정의"""

from typing import Optional, List
from pydantic import BaseModel


class StockResult(BaseModel):
    ticker: str
    name: str
    close: int
    change_pct: float
    ma5: Optional[float] = None
    ma20: Optional[float] = None
    ma60: Optional[float] = None
    ma112: Optional[float] = None
    ma224: Optional[float] = None
    bb_pctb: Optional[float] = None
    cci: Optional[float] = None
    volume: int
    market_cap: Optional[int] = None


class ScreeningResponse(BaseModel):
    date: str
    total_screened: int
    results: dict


class WatchlistItem(BaseModel):
    ticker: str
    name: Optional[str] = None
    group_name: Optional[str] = "기본"
    memo: Optional[str] = None


class WatchlistResponse(BaseModel):
    id: int
    ticker: str
    name: str
    added_date: str
    group_name: str
    memo: Optional[str] = None
    sort_order: int


class ScreeningSummaryResponse(BaseModel):
    date: str
    total_screened: int
    cond_1_2_count: int
    cond_1_2_3_count: int
    cond_1_2_3_4_count: int
