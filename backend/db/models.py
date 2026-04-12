"""SQLAlchemy 모델 — V2"""
from sqlalchemy import Column, Integer, Text, Float, BigInteger, Boolean, UniqueConstraint
from backend.db.database import Base


class ScreeningResult(Base):
    __tablename__ = "screening_results"
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Text, nullable=False, index=True)
    ticker = Column(Text, nullable=False)
    name = Column(Text)
    close_price = Column(Integer)
    change_pct = Column(Float)
    ma5 = Column(Float)
    ma20 = Column(Float)
    ma60 = Column(Float)
    ma112 = Column(Float)
    ma224 = Column(Float)
    bb_pctb = Column(Float)
    cci = Column(Float)
    volume = Column(BigInteger)
    market_cap = Column(BigInteger)
    signal = Column(Text)
    cond2_met = Column(Boolean, default=False)
    cond3_met = Column(Boolean, default=False)
    cond4_met = Column(Boolean, default=False)
    __table_args__ = (UniqueConstraint("date", "ticker"),)


class ScreeningSummary(Base):
    __tablename__ = "screening_summary"
    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Text, nullable=False, unique=True, index=True)
    total_screened = Column(Integer)
    cond_1_2_count = Column(Integer)
    cond_1_2_3_count = Column(Integer)
    cond_1_2_4_count = Column(Integer)
    cond_1_2_3_4_count = Column(Integer)


class Watchlist(Base):
    __tablename__ = "watchlist"
    id = Column(Integer, primary_key=True, autoincrement=True)
    ticker = Column(Text, nullable=False, unique=True)
    name = Column(Text, nullable=False)
    added_date = Column(Text, nullable=False)
    group_name = Column(Text, default="기본")
    memo = Column(Text, default="")
    sort_order = Column(Integer, default=0)
