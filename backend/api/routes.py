"""REST API 라우트 — V2"""

import json
import os
import threading
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core.screener import run_full_screening
from backend.core.data_fetcher import fetch_stock_name
from backend.db.database import get_db, SessionLocal
from backend.db.models import ScreeningResult, ScreeningSummary, Watchlist
from pydantic import BaseModel

router = APIRouter(prefix="/api")

# 스크리닝 상태 관리
_screening_status = {"running": False, "progress": "", "last_result": None}
CACHE_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")


class WatchlistBody(BaseModel):
    ticker: str
    name: Optional[str] = None
    group_name: Optional[str] = "기본"
    memo: Optional[str] = ""


def _save_cache(report: dict):
    os.makedirs(CACHE_DIR, exist_ok=True)
    with open(os.path.join(CACHE_DIR, f"report_{report['date']}.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)


def _load_cache(date: str) -> Optional[dict]:
    path = os.path.join(CACHE_DIR, f"report_{date}.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _save_to_db(report: dict, db: Session):
    date = report["date"]
    # 결과 저장
    all_stocks = report["results"].get("cond_1_2", [])
    for s in all_stocks:
        existing = db.query(ScreeningResult).filter_by(date=date, ticker=s["ticker"]).first()
        data = dict(
            name=s["name"], close_price=s["close"], change_pct=s["change_pct"],
            ma5=s.get("ma5"), ma20=s.get("ma20"), ma60=s.get("ma60"),
            ma112=s.get("ma112"), ma224=s.get("ma224"),
            bb_pctb=s.get("bb_pctb"), cci=s.get("cci"),
            volume=s.get("volume"), market_cap=s.get("market_cap"),
            signal=s.get("signal"),
            cond2_met=s.get("cond2", False),
            cond3_met=s.get("cond3", False),
            cond4_met=s.get("cond4", False),
        )
        if existing:
            for k, v in data.items():
                setattr(existing, k, v)
        else:
            db.add(ScreeningResult(date=date, ticker=s["ticker"], **data))

    # 요약 저장
    counts = report.get("counts", {})
    existing_sum = db.query(ScreeningSummary).filter_by(date=date).first()
    sum_data = dict(
        total_screened=report["total_screened"],
        cond_1_2_count=counts.get("cond_1_2", 0),
        cond_1_2_3_count=counts.get("cond_1_2_3", 0),
        cond_1_2_4_count=counts.get("cond_1_2_4", 0),
        cond_1_2_3_4_count=counts.get("cond_1_2_3_4", 0),
    )
    if existing_sum:
        for k, v in sum_data.items():
            setattr(existing_sum, k, v)
    else:
        db.add(ScreeningSummary(date=date, **sum_data))
    db.commit()


# ── 스크리닝 ──

def _run_screening_thread():
    """백그라운드 스레드에서 스크리닝 실행"""
    _screening_status["running"] = True
    _screening_status["progress"] = "실행 중..."
    try:
        report = run_full_screening()
        _save_cache(report)
        db = SessionLocal()
        try:
            _save_to_db(report, db)
        finally:
            db.close()
        _screening_status["last_result"] = report
        _screening_status["progress"] = "완료"
    except Exception as e:
        _screening_status["progress"] = f"오류: {e}"
        print(f"스크리닝 오류: {e}")
    finally:
        _screening_status["running"] = False


@router.post("/screening/run")
def api_run_screening():
    if _screening_status["running"]:
        return {"status": "already_running", "message": "스크리닝이 이미 실행 중입니다."}
    thread = threading.Thread(target=_run_screening_thread, daemon=True)
    thread.start()
    return {"status": "started", "message": "스크리닝이 시작되었습니다."}


@router.get("/screening/status")
def api_screening_status():
    return {
        "running": _screening_status["running"],
        "progress": _screening_status["progress"],
        "has_result": _screening_status["last_result"] is not None,
    }


@router.get("/screening/latest")
def api_get_latest(db: Session = Depends(get_db)):
    # 메모리 캐시 우선
    if _screening_status["last_result"]:
        return _screening_status["last_result"]
    summary = db.query(ScreeningSummary).order_by(ScreeningSummary.date.desc()).first()
    if not summary:
        raise HTTPException(404, "스크리닝 결과 없음. 스크리닝 실행 버튼을 눌러주세요.")
    cached = _load_cache(summary.date)
    if cached:
        return cached
    raise HTTPException(404, "캐시 파일 없음")


@router.get("/screening/history")
def api_get_history(db: Session = Depends(get_db)):
    rows = db.query(ScreeningSummary).order_by(ScreeningSummary.date.desc()).limit(30).all()
    return [
        {
            "date": r.date, "total_screened": r.total_screened,
            "cond_1_2": r.cond_1_2_count, "cond_1_2_3": r.cond_1_2_3_count,
            "cond_1_2_4": r.cond_1_2_4_count, "cond_1_2_3_4": r.cond_1_2_3_4_count,
        }
        for r in rows
    ]


@router.get("/screening/{date}")
def api_get_by_date(date: str):
    cached = _load_cache(date)
    if cached:
        return cached
    raise HTTPException(404, f"{date} 결과 없음")


# ── 관심종목 ──

@router.get("/watchlist")
def api_get_watchlist(db: Session = Depends(get_db)):
    items = db.query(Watchlist).order_by(Watchlist.sort_order).all()
    return [
        {"id": w.id, "ticker": w.ticker, "name": w.name, "added_date": w.added_date,
         "group_name": w.group_name, "memo": w.memo, "sort_order": w.sort_order}
        for w in items
    ]


@router.post("/watchlist")
def api_add_watchlist(body: WatchlistBody, db: Session = Depends(get_db)):
    if db.query(Watchlist).filter_by(ticker=body.ticker).first():
        raise HTTPException(400, "이미 등록됨")
    name = body.name or fetch_stock_name(body.ticker)
    w = Watchlist(ticker=body.ticker, name=name, added_date=datetime.now().strftime("%Y-%m-%d"),
                  group_name=body.group_name or "기본", memo=body.memo or "")
    db.add(w)
    db.commit()
    db.refresh(w)
    return {"id": w.id, "ticker": w.ticker, "name": w.name}


@router.delete("/watchlist/{ticker}")
def api_del_watchlist(ticker: str, db: Session = Depends(get_db)):
    w = db.query(Watchlist).filter_by(ticker=ticker).first()
    if not w:
        raise HTTPException(404, "미등록 종목")
    db.delete(w)
    db.commit()
    return {"message": "삭제 완료"}
