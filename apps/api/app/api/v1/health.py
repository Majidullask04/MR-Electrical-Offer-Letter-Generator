from fastapi import APIRouter
from sqlalchemy import text

from app.database import SessionLocal

router = APIRouter(tags=["health"])


@router.get("/health")
def health():
    database = "ok"
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        database = "unavailable"
    return {"status": "ok" if database == "ok" else "degraded", "database": database}
