from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import func, or_, select

from app.deps import AnyStaff, Approver, DbSession, HrOrAdmin, SuperAdmin
from app.models import Candidate, Offer, OfferStatus
from app.schemas.common import Page
from app.schemas.offer import (
    ApprovalDecision,
    OfferCreate,
    OfferDetail,
    OfferIssueResponse,
    OfferPreviewResponse,
    OfferSummary,
    OfferUpdate,
    ReturnDecision,
    ReviseRequest,
    WithdrawRequest,
)
from app.services import documents, offers as offer_service

router = APIRouter(prefix="/offers", tags=["offers"])


def _date_bounds(date_from: date | None, date_to: date | None):
    start = datetime.combine(date_from, time.min, tzinfo=UTC) if date_from else None
    end = datetime.combine(date_to, time.max, tzinfo=UTC) if date_to else None
    return start, end


@router.get("", response_model=Page[OfferSummary])
def list_offers(
    db: DbSession,
    user: AnyStaff,
    q: str | None = Query(default=None, max_length=120),
    status_filter: str | None = Query(default=None, alias="status"),
    position: str | None = Query(default=None, max_length=160),
    candidate_name: str | None = Query(default=None, max_length=160),
    candidate_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    offer_service.expire_stale_offers(db)
    filters = []
    if status_filter:
        try:
            statuses = [OfferStatus(value.strip().upper()) for value in status_filter.split(",") if value.strip()]
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"code": "INVALID_STATUS", "message": "That offer status filter is not valid."},
            ) from exc
        filters.append(Offer.status.in_(statuses))
    if candidate_id:
        filters.append(Offer.candidate_id == candidate_id)
    if candidate_name:
        filters.append(Candidate.full_name.ilike(f"%{candidate_name.strip()}%"))
    if position:
        filters.append(Offer.data["employment"]["job_title"].astext.ilike(f"%{position.strip()}%"))
    if q:
        term = f"%{q.strip()}%"
        filters.append(
            or_(
                Offer.offer_number.ilike(term),
                Offer.official_offer_number.ilike(term),
                Candidate.full_name.ilike(term),
                Candidate.email.ilike(term),
                Offer.data["employment"]["job_title"].astext.ilike(term),
            )
        )
    start, end = _date_bounds(date_from, date_to)
    if start:
        filters.append(Offer.created_at >= start)
    if end:
        filters.append(Offer.created_at <= end)

    total = (
        db.scalar(
            select(func.count())
            .select_from(Offer)
            .join(Candidate, Candidate.id == Offer.candidate_id)
            .where(*filters)
        )
        or 0
    )
    items = db.scalars(
        select(Offer)
        .join(Candidate, Candidate.id == Offer.candidate_id)
        .where(*filters)
        .order_by(Offer.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).unique().all()
    return {
        "items": [offer_service.serialize_summary(offer) for offer in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.post("", response_model=OfferDetail, status_code=status.HTTP_201_CREATED)
def create_offer(
    payload: OfferCreate,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    return offer_service.create_offer(db, payload, user, request)


@router.post("/preview", response_model=OfferPreviewResponse)
def preview_draft(payload: OfferCreate, db: DbSession, user: HrOrAdmin):
    snapshot = offer_service.build_preview_snapshot(db, payload)
    html_content = offer_service.render_snapshot_html(snapshot)
    return {"html": documents.sanitize_preview(html_content)}


@router.get("/{offer_id}", response_model=OfferDetail)
def get_offer(offer_id: uuid.UUID, db: DbSession, user: AnyStaff):
    offer_service.expire_stale_offers(db)
    offer = offer_service.get_offer(db, offer_id)
    return offer_service.serialize_detail(offer)


@router.patch("/{offer_id}", response_model=OfferDetail)
def update_offer(
    offer_id: uuid.UUID,
    payload: OfferUpdate,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    return offer_service.update_offer(db, offer_id, payload, user, request)


@router.post("/{offer_id}/submit", response_model=OfferDetail)
def submit_offer(
    offer_id: uuid.UUID,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    return offer_service.submit_offer(db, offer_id, user, request)


@router.post("/{offer_id}/approve", response_model=OfferDetail)
def approve_offer(
    offer_id: uuid.UUID,
    payload: ApprovalDecision,
    db: DbSession,
    user: Approver,
    request: Request,
):
    return offer_service.approve_offer(db, offer_id, user, payload.comments, request)


@router.post("/{offer_id}/return", response_model=OfferDetail)
def return_offer(
    offer_id: uuid.UUID,
    payload: ReturnDecision,
    db: DbSession,
    user: Approver,
    request: Request,
):
    return offer_service.return_offer(db, offer_id, user, payload.comments, request)


@router.post("/{offer_id}/issue", response_model=OfferIssueResponse)
def issue_offer(
    offer_id: uuid.UUID,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    return offer_service.issue_offer(db, offer_id, user, request)


@router.post("/{offer_id}/withdraw", response_model=OfferDetail)
def withdraw_offer(
    offer_id: uuid.UUID,
    payload: WithdrawRequest,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    return offer_service.withdraw_offer(db, offer_id, user, payload.reason, request)


@router.post("/{offer_id}/revoke", response_model=OfferDetail)
def revoke_offer(
    offer_id: uuid.UUID,
    payload: WithdrawRequest,
    db: DbSession,
    user: SuperAdmin,
    request: Request,
):
    return offer_service.withdraw_offer(db, offer_id, user, payload.reason, request)


@router.post("/{offer_id}/revise", response_model=OfferDetail)
def revise_offer(
    offer_id: uuid.UUID,
    payload: ReviseRequest,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    return offer_service.revise_offer(db, offer_id, user, payload.reason, request)


@router.post("/{offer_id}/link", response_model=OfferIssueResponse)
def regenerate_link(
    offer_id: uuid.UUID,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    return offer_service.regenerate_link(db, offer_id, user, request)


@router.get("/{offer_id}/preview")
def preview_offer(offer_id: uuid.UUID, db: DbSession, user: AnyStaff):
    html_content = documents.sanitize_preview(offer_service.preview_offer(db, offer_id))
    return Response(
        content=html_content,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Security-Policy": (
                "default-src 'none'; style-src 'unsafe-inline'; img-src data:; "
                "font-src data:; base-uri 'none'; form-action 'none'"
            ),
            "Cache-Control": "private, no-store",
            "X-Frame-Options": "SAMEORIGIN",
        },
    )


@router.get("/{offer_id}/pdf")
def download_offer_pdf(
    offer_id: uuid.UUID,
    db: DbSession,
    user: AnyStaff,
    download: bool = False,
):
    content, filename = offer_service.offer_pdf(db, offer_id)
    disposition = "attachment" if download else "inline"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'{disposition}; filename="{filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/{offer_id}/revisions/{revision_id}/pdf")
def download_revision_pdf(
    offer_id: uuid.UUID,
    revision_id: uuid.UUID,
    db: DbSession,
    user: AnyStaff,
):
    content, filename = offer_service.revision_pdf(db, offer_id, revision_id)
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
