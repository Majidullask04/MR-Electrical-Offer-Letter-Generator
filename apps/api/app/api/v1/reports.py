from __future__ import annotations

import csv
import io
from datetime import UTC, date, datetime, time, timedelta

from fastapi import APIRouter, HTTPException, Query, status as http_status
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.deps import AnyStaff, DbSession
from app.models import Candidate, Offer, OfferStatus, ResponseType
from app.schemas.report import (
    DashboardOut,
    MonthlyPoint,
    OfferReportOut,
    PositionPoint,
    ReportFilters,
    StatusCounts,
    TimeToAccept,
)
from app.services import offers as offer_service
from app.services.documents import format_date

router = APIRouter(prefix="/reports", tags=["reports"])


def _filtered_offers(
    db,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    position: str | None = None,
    status: str | None = None,
) -> list[Offer]:
    filters = []
    if date_from:
        filters.append(Offer.created_at >= datetime.combine(date_from, time.min, tzinfo=UTC))
    if date_to:
        filters.append(Offer.created_at <= datetime.combine(date_to, time.max, tzinfo=UTC))
    if position:
        filters.append(Offer.data["employment"]["job_title"].astext.ilike(f"%{position}%"))
    if status:
        try:
            filters.append(Offer.status == OfferStatus(status.strip().upper()))
        except ValueError as exc:
            raise HTTPException(
                status_code=http_status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "INVALID_STATUS",
                    "message": "That offer status filter is not valid.",
                },
            ) from exc
    return list(
        db.scalars(
            select(Offer)
            .join(Candidate, Candidate.id == Offer.candidate_id)
            .where(*filters)
            .order_by(Offer.created_at.desc())
        ).unique()
    )


def _rates(offers: list[Offer]) -> tuple[float | None, float | None]:
    responded = [offer for offer in offers if offer.response in {ResponseType.ACCEPTED, ResponseType.REJECTED}]
    if not responded:
        return None, None
    accepted = sum(1 for offer in responded if offer.response == ResponseType.ACCEPTED)
    rejected = len(responded) - accepted
    return round(accepted / len(responded) * 100, 1), round(rejected / len(responded) * 100, 1)


def _average_accept_hours(offers: list[Offer]) -> tuple[float | None, int]:
    durations = [
        (offer.accepted_at - offer.issued_at).total_seconds() / 3600
        for offer in offers
        if offer.accepted_at and offer.issued_at
    ]
    if not durations:
        return None, 0
    return round(sum(durations) / len(durations), 1), len(durations)


def _csv_safe(value):
    """Neutralise spreadsheet formula injection in exported text cells."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value
    return value


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(
    db: DbSession,
    user: AnyStaff,
    date_from: date | None = None,
    date_to: date | None = None,
    position: str | None = None,
):
    offer_service.expire_stale_offers(db)
    offers = _filtered_offers(db, date_from=date_from, date_to=date_to, position=position)
    status_counts = {status: 0 for status in OfferStatus}
    for offer in offers:
        status_counts[offer.status] += 1
    counts = StatusCounts(
        total=len(offers),
        draft=status_counts[OfferStatus.DRAFT],
        pending_approval=status_counts[OfferStatus.PENDING_APPROVAL],
        approved=status_counts[OfferStatus.APPROVED],
        issued=status_counts[OfferStatus.ISSUED] + status_counts[OfferStatus.REISSUED],
        viewed=status_counts[OfferStatus.VIEWED],
        accepted=status_counts[OfferStatus.ACCEPTED],
        rejected=status_counts[OfferStatus.REJECTED],
        expired=status_counts[OfferStatus.EXPIRED],
        withdrawn=status_counts[OfferStatus.WITHDRAWN],
    )
    acceptance_rate, rejection_rate = _rates(offers)
    average_hours, sample_size = _average_accept_hours(offers)

    today = datetime.now(UTC).date()
    months: list[tuple[int, int]] = []
    cursor = date(today.year, today.month, 1)
    for _ in range(12):
        months.append((cursor.year, cursor.month))
        cursor = (cursor.replace(day=1) - timedelta(days=1)).replace(day=1)
    months.reverse()

    def month_key(value: datetime | None) -> tuple[int, int] | None:
        return (value.year, value.month) if value else None

    monthly = []
    for year, month in months:
        label = date(year, month, 1).strftime("%b %Y")
        monthly.append(
            MonthlyPoint(
                month=f"{year:04d}-{month:02d}",
                label=label,
                created=sum(1 for offer in offers if month_key(offer.created_at) == (year, month)),
                issued=sum(1 for offer in offers if month_key(offer.issued_at) == (year, month)),
                accepted=sum(1 for offer in offers if month_key(offer.accepted_at) == (year, month)),
            )
        )

    position_counts: dict[str, int] = {}
    for offer in offers:
        title = (offer.data or {}).get("employment", {}).get("job_title", "Unspecified")
        position_counts[title] = position_counts.get(title, 0) + 1
    positions = [
        PositionPoint(position=title, count=count)
        for title, count in sorted(position_counts.items(), key=lambda item: item[1], reverse=True)[:8]
    ]

    recent_offers = [offer_service.serialize_summary(offer) for offer in offers[:6]]
    pending_offers = [
        offer_service.serialize_summary(offer)
        for offer in offers
        if offer.status == OfferStatus.PENDING_APPROVAL
    ][:5]
    recent_candidates = list(
        db.scalars(select(Candidate).where(Candidate.is_active.is_(True)).order_by(Candidate.created_at.desc()).limit(5))
    )
    return {
        "counts": counts,
        "acceptance_rate": acceptance_rate,
        "rejection_rate": rejection_rate,
        "pending_approval_count": counts.pending_approval,
        "time_to_accept": TimeToAccept(average_hours=average_hours, sample_size=sample_size),
        "monthly": monthly,
        "positions": positions,
        "recent_offers": recent_offers,
        "recent_candidates": recent_candidates,
        "pending_offers": pending_offers,
        "range_from": date_from,
        "range_to": date_to,
    }


@router.get("/offers", response_model=OfferReportOut)
def offer_report(
    db: DbSession,
    user: AnyStaff,
    date_from: date | None = None,
    date_to: date | None = None,
    position: str | None = None,
    status: str | None = None,
):
    offers = _filtered_offers(db, date_from=date_from, date_to=date_to, position=position, status=status)
    acceptance_rate, rejection_rate = _rates(offers)
    average_hours, _ = _average_accept_hours(offers)
    rows = [offer_service.serialize_summary(offer) for offer in offers[:500]]
    return {
        "rows": rows,
        "total": len(offers),
        "acceptance_rate": acceptance_rate,
        "rejection_rate": rejection_rate,
        "average_time_to_accept_hours": average_hours,
        "filters": ReportFilters(
            date_from=date_from,
            date_to=date_to,
            status=status,
            position=position,
        ),
    }


@router.get("/offers/export")
def export_offers_csv(
    db: DbSession,
    user: AnyStaff,
    date_from: date | None = None,
    date_to: date | None = None,
    position: str | None = None,
    status: str | None = None,
):
    offers = _filtered_offers(db, date_from=date_from, date_to=date_to, position=position, status=status)
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(
        [
            "Offer reference",
            "Candidate",
            "Email",
            "Position",
            "Department",
            "Employment type",
            "Annual CTC (INR)",
            "Monthly gross (INR)",
            "Status",
            "Created",
            "Issued",
            "Expires",
            "Viewed",
            "Responded",
            "Revision",
            "Created by",
        ]
    )
    for offer in offers:
        data = offer.data or {}
        employment = data.get("employment", {})
        compensation = data.get("compensation", {})
        writer.writerow(
            [
                offer.offer_number,
                _csv_safe(offer.candidate.full_name),
                _csv_safe(offer.candidate.email),
                _csv_safe(employment.get("job_title", "")),
                _csv_safe(employment.get("department", "")),
                employment.get("employment_type", ""),
                compensation.get("annual_ctc", ""),
                compensation.get("monthly_gross", ""),
                offer.status.value,
                format_date(offer.created_at),
                format_date(offer.issued_at),
                format_date(offer.expires_at),
                format_date(offer.viewed_at),
                format_date(offer.responded_at),
                offer.current_revision.revision_number if offer.current_revision else 0,
                _csv_safe(offer.created_by.full_name if offer.created_by else ""),
            ]
        )
    content = buffer.getvalue().encode("utf-8-sig")
    filename = f"offerlater-offers-{datetime.now(UTC).strftime('%Y%m%d')}.csv"
    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )
