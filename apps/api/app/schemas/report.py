import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.schemas.candidate import CandidateOut
from app.schemas.offer import OfferSummary


class StatusCounts(BaseModel):
    total: int
    draft: int
    pending_approval: int
    approved: int
    issued: int
    viewed: int
    accepted: int
    rejected: int
    expired: int
    withdrawn: int


class MonthlyPoint(BaseModel):
    month: str
    label: str
    created: int
    issued: int
    accepted: int


class PositionPoint(BaseModel):
    position: str
    count: int


class TimeToAccept(BaseModel):
    average_hours: float | None
    sample_size: int


class DashboardOut(BaseModel):
    counts: StatusCounts
    acceptance_rate: float | None
    rejection_rate: float | None
    pending_approval_count: int
    time_to_accept: TimeToAccept
    monthly: list[MonthlyPoint]
    positions: list[PositionPoint]
    recent_offers: list[OfferSummary]
    recent_candidates: list[CandidateOut]
    pending_offers: list[OfferSummary]
    range_from: date | None
    range_to: date | None


class ReportFilters(BaseModel):
    date_from: date | None = None
    date_to: date | None = None
    status: str | None = None
    position: str | None = None


class OfferReportOut(BaseModel):
    rows: list[OfferSummary]
    total: int
    acceptance_rate: float | None
    rejection_rate: float | None
    average_time_to_accept_hours: float | None
    filters: ReportFilters
