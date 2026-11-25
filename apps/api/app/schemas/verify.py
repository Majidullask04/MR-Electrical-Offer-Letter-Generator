from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.models import EmploymentType
from app.schemas.offer import CompensationComponent, TrainingIncrementPolicy


class VerifyLookupRequest(BaseModel):
    offer_id: str = Field(min_length=3, max_length=60)
    candidate_email: str | None = Field(default=None, max_length=255)
    candidate_name: str | None = Field(default=None, max_length=160)
    joining_date: date | None = None

    @field_validator("offer_id", "candidate_email", "candidate_name", mode="before")
    @classmethod
    def strip_text(cls, value):
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return value


class VerifyRecordOut(BaseModel):
    offer_id: str
    draft_reference: str | None = None
    company_name: str
    candidate_name: str
    designation: str
    department: str | None = None
    issue_date: datetime | None = None
    joining_date: date | None = None
    expires_at: datetime | None = None
    lifecycle_status: str
    revision_number: int
    verification_status: str
    verified_at: datetime
    verified_count: int = 0
    revoked_reason: str | None = None


class VerifyResultOut(BaseModel):
    verdict: Literal[
        "VALID",
        "INVALID",
        "REVOKED",
        "EXPIRED",
        "MODIFIED_DOCUMENT",
        "SUPERSEDED",
    ]
    headline: str
    message: str
    pdf_integrity: Literal["NOT_CHECKED", "MATCHED", "MODIFIED", "UNMATCHED"] = "NOT_CHECKED"
    uploaded_sha256: str | None = None
    official_sha256: str | None = None
    record: VerifyRecordOut | None = None


class GeneratorOfferRequest(BaseModel):
    candidate_code: str | None = Field(default=None, max_length=40)
    full_name: str = Field(min_length=2, max_length=160)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=30)
    job_title: str = Field(min_length=2, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    joining_date: date
    work_location: str | None = Field(default=None, max_length=200)
    reporting_manager: str | None = Field(default=None, max_length=160)
    employment_duration: str | None = Field(default=None, max_length=120)
    probation_months: int | None = Field(default=None, ge=0, le=12)
    annual_ctc: float | None = Field(default=None, ge=0, le=1_000_000_000)
    monthly_salary: float | None = Field(default=None, ge=0, le=100_000_000)
    stipend: float | None = Field(default=None, ge=0, le=100_000_000)
    allowances: list[CompensationComponent] = Field(default_factory=list, max_length=20)
    payment_terms: str | None = Field(default=None, max_length=300)
    expiry_date: date | None = None
    validity_days: int | None = Field(default=None, ge=1, le=90)
    responsibilities: str | None = Field(default=None, max_length=4000)
    employment_terms: str | None = Field(default=None, max_length=5000)
    additional_instructions: str | None = Field(default=None, max_length=4000)
    template_id: uuid.UUID | None = None
    training_policy: TrainingIncrementPolicy | None = None
    issue_immediately: bool = False

    @field_validator("email", "phone", "candidate_code", "department", "work_location", "reporting_manager", "employment_duration", "payment_terms", "responsibilities", "employment_terms", "additional_instructions", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str):
            trimmed = value.strip()
            return trimmed or None
        return value
