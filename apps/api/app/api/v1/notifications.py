from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter
from sqlalchemy import select

from app.deps import AnyStaff, DbSession
from app.models import Offer, OfferStatus
from app.services import offers as offer_service

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
def notifications(db: DbSession, user: AnyStaff):
    offer_service.expire_stale_offers(db)
    now = datetime.now(UTC)
    items: list[dict] = []

    pending = db.scalars(
        select(Offer).where(Offer.status == OfferStatus.PENDING_APPROVAL).order_by(Offer.created_at.desc()).limit(5)
    ).all()
    for offer in pending:
        items.append(
            {
                "id": f"approval-{offer.id}",
                "type": "approval",
                "title": "Offer awaiting approval",
                "detail": f"{offer.candidate.full_name}, {offer.data.get('employment', {}).get('job_title', '')}",
                "href": f"/approvals",
                "created_at": offer.created_at,
                "tone": "attention",
            }
        )

    responses = db.scalars(
        select(Offer)
        .where(Offer.responded_at.is_not(None), Offer.responded_at >= now - timedelta(days=14))
        .order_by(Offer.responded_at.desc())
        .limit(5)
    ).all()
    for offer in responses:
        accepted = offer.response and offer.response.value == "ACCEPTED"
        items.append(
            {
                "id": f"response-{offer.id}",
                "type": "response",
                "title": "Offer accepted" if accepted else "Offer declined",
                "detail": f"{offer.candidate.full_name}, {offer.data.get('employment', {}).get('job_title', '')}",
                "href": f"/offers/{offer.id}",
                "created_at": offer.responded_at,
                "tone": "positive" if accepted else "neutral",
            }
        )

    expiring = db.scalars(
        select(Offer)
        .where(
            Offer.status.in_([OfferStatus.ISSUED, OfferStatus.VIEWED, OfferStatus.REISSUED]),
            Offer.expires_at.is_not(None),
            Offer.expires_at <= now + timedelta(days=3),
            Offer.expires_at > now,
        )
        .order_by(Offer.expires_at.asc())
        .limit(5)
    ).all()
    for offer in expiring:
        items.append(
            {
                "id": f"expiring-{offer.id}",
                "type": "expiry",
                "title": "Offer approaching expiry",
                "detail": f"{offer.candidate.full_name}, closes {offer.expires_at.strftime('%d %b %Y')}",
                "href": f"/offers/{offer.id}",
                "created_at": offer.expires_at,
                "tone": "attention",
            }
        )

    items.sort(key=lambda item: item["created_at"], reverse=True)
    attention = len(pending) + len(expiring)
    return {"items": items[:12], "attention_count": attention}
