from __future__ import annotations

import uuid
from datetime import UTC, date, datetime, time

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select

from app.config import settings
from app.deps import DbSession, SuperAdmin
from app.models import AuditLog, EmailNotification, Offer
from app.schemas.common import Message, Page
from app.services import offers as offer_service

router = APIRouter(tags=["administration"])


@router.get("/audit-logs", response_model=Page[dict])
def _like_term(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def list_audit_logs(
    db: DbSession,
    user: SuperAdmin,
    action: str | None = None,
    entity_type: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
):
    filters = []
    if action:
        filters.append(AuditLog.action.ilike(_like_term(action), escape="\\"))
    if entity_type:
        filters.append(AuditLog.entity_type == entity_type)
    if date_from:
        filters.append(AuditLog.created_at >= datetime.combine(date_from, time.min, tzinfo=UTC))
    if date_to:
        filters.append(AuditLog.created_at <= datetime.combine(date_to, time.max, tzinfo=UTC))
    total = db.scalar(select(func.count()).select_from(AuditLog).where(*filters)) or 0
    rows = db.scalars(
        select(AuditLog)
        .where(*filters)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        {
            "id": row.id,
            "actor_email": row.actor_email,
            "action": row.action,
            "entity_type": row.entity_type,
            "entity_id": row.entity_id,
            "metadata": row.event_metadata,
            "ip_address": row.ip_address,
            "created_at": row.created_at,
        }
        for row in rows
    ]
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, (total + page_size - 1) // page_size),
    }


@router.get("/settings/outbox")
def list_outbox(
    db: DbSession,
    user: SuperAdmin,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
):
    statement = select(EmailNotification).order_by(EmailNotification.created_at.desc()).limit(limit)
    if status_filter:
        statement = statement.where(EmailNotification.status == status_filter)
    rows = db.scalars(statement).all()
    return [
        {
            "id": row.id,
            "recipient": row.recipient,
            "template_key": row.template_key,
            "subject": row.subject,
            "status": row.status,
            "provider": row.provider,
            "error": row.error,
            "sent_at": row.sent_at,
            "created_at": row.created_at,
            "offer_id": row.offer_id,
        }
        for row in rows
    ]


@router.get("/settings/outbox/{email_id}/html")
def outbox_email_html(
    email_id: uuid.UUID,
    db: DbSession,
    user: SuperAdmin,
):
    row = db.get(EmailNotification, email_id)
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "EMAIL_NOT_FOUND", "message": "That email record does not exist."},
        )
    return Response(
        content=row.html_body,
        media_type="text/html; charset=utf-8",
        headers={
            "Content-Security-Policy": (
                "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; "
                f"font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self' {settings.frontend_origin}"
            ),
            "Cache-Control": "private, no-store",
        },
    )


@router.post("/settings/jobs/run")
def run_jobs(
    db: DbSession,
    user: SuperAdmin,
    request: Request,
    job: str = Query(pattern="^(expire|remind)$"),
):
    if job == "expire":
        count = offer_service.expire_stale_offers(db)
        return {"message": f"{count} offer(s) marked expired."}
    count = offer_service.send_expiry_reminders(db)
    return {"message": f"{count} expiry reminder(s) queued."}


@router.get("/settings/summary")
def settings_summary(db: DbSession, user: SuperAdmin):
    offer_count = db.scalar(select(func.count()).select_from(Offer)) or 0
    email_count = db.scalar(select(func.count()).select_from(EmailNotification)) or 0
    audit_count = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    return {
        "offers": offer_count,
        "email_records": email_count,
        "audit_records": audit_count,
        "environment": settings.app_env,
    }
