import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models import EmploymentType, OfferStatus, ResponseType
from app.schemas.common import ORMModel


class EmploymentDetails(BaseModel):
    job_title: str = Field(min_length=2, max_length=160)
    department: str = Field(default="", max_length=120)
    employment_type: EmploymentType
    joining_date: date
    work_location: str = Field(min_length=2, max_length=200)
    reporting_manager: str = Field(min_length=2, max_length=160)
    employment_duration: str | None = Field(default=None, max_length=120)
    probation_months: int = Field(ge=0, le=12, default=3)
    working_days: str = Field(default="Monday to Saturday", max_length=120)
    working_hours: str = Field(default="9:00 AM to 6:00 PM", max_length=120)
    responsibilities: str | None = Field(default=None, max_length=4000)


class CompensationComponent(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(ge=0, le=1_000_000_000)
    period: Literal["MONTHLY", "ANNUAL"] = "MONTHLY"


class CompensationDetails(BaseModel):
    currency: str = Field(default="INR", min_length=3, max_length=3)
    annual_ctc: float = Field(ge=0, le=1_000_000_000)
    monthly_gross: float = Field(ge=0, le=100_000_000)
    stipend: float | None = Field(default=None, ge=0, le=100_000_000)
    earnings: list[CompensationComponent] = Field(default_factory=list, max_length=20)
    deductions: list[CompensationComponent] = Field(default_factory=list, max_length=20)
    payment_frequency: Literal["MONTHLY", "QUARTERLY", "ANNUALLY"] = "MONTHLY"
    payment_terms: str | None = Field(default=None, max_length=300)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value: str) -> str:
        return value.upper()


class TermsDetails(BaseModel):
    probation: str = Field(default="", max_length=5000)
    leave_policy: str = Field(default="", max_length=5000)
    working_hours: str = Field(default="", max_length=5000)
    confidentiality: str = Field(default="", max_length=5000)
    notice_period: str = Field(default="", max_length=5000)
    termination: str = Field(default="", max_length=5000)
    company_policies: str = Field(default="", max_length=5000)
    joining_requirements: str = Field(default="", max_length=5000)
    additional_clauses: str = Field(default="", max_length=5000)
    candidate_declaration: str = Field(default="", max_length=2000)


class TrainingIncrementPolicy(BaseModel):
    enabled: bool = True
    training_period_months: int = Field(default=1, ge=1, le=24)
    training_monthly_salary_inr: float = Field(default=14000, ge=0, le=100_000_000)
    food_provided: bool = False
    site_accommodation_free: bool = True
    post_training_salary_min_inr: float = Field(default=18000, ge=0, le=100_000_000)
    post_training_salary_max_inr: float = Field(default=25000, ge=0, le=100_000_000)
    post_training_duration_months: int = Field(default=6, ge=1, le=60)
    first_increment_after_months: int = Field(default=6, ge=1, le=60)
    first_increment_max_percent: float = Field(default=30, ge=0, le=100)
    increment_criteria: str = Field(default="Behaviour and performance", min_length=2, max_length=200)

    @field_validator("increment_criteria", mode="before")
    @classmethod
    def clean_criteria(cls, value: str | None) -> str:
        if not isinstance(value, str):
            return "Behaviour and performance"
        trimmed = value.strip()
        return trimmed or "Behaviour and performance"

    @model_validator(mode="after")
    def validate_salary_band(self) -> "TrainingIncrementPolicy":
        if self.post_training_salary_min_inr > self.post_training_salary_max_inr:
            raise ValueError("Post-training minimum salary cannot exceed maximum salary.")
        return self


class OfferData(BaseModel):
    employment: EmploymentDetails
    compensation: CompensationDetails
    terms: TermsDetails
    training_policy: TrainingIncrementPolicy = Field(default_factory=TrainingIncrementPolicy)

    @model_validator(mode="after")
    def sanity_check(self) -> "OfferData":
        has_base_comp = (
            self.compensation.monthly_gross > 0
            or self.compensation.annual_ctc > 0
            or bool(self.compensation.stipend and self.compensation.stipend > 0)
        )
        has_training_comp = self.training_policy.enabled and self.training_policy.training_monthly_salary_inr > 0
        if not has_base_comp and not has_training_comp:
            raise ValueError("Compensation must include a positive salary or stipend.")
        return self


class OfferCreate(BaseModel):
    candidate_id: uuid.UUID
    template_id: uuid.UUID | None = None
    validity_days: int = Field(default=14, ge=1, le=90)
    data: OfferData
    internal_notes: str | None = Field(default=None, max_length=4000)


class OfferUpdate(BaseModel):
    candidate_id: uuid.UUID | None = None
    template_id: uuid.UUID | None = None
    validity_days: int | None = Field(default=None, ge=1, le=90)
    data: OfferData | None = None
    internal_notes: str | None = Field(default=None, max_length=4000)


class ApprovalDecision(BaseModel):
    comments: str | None = Field(default=None, max_length=2000)


class ReturnDecision(BaseModel):
    comments: str = Field(min_length=3, max_length=2000)


class WithdrawRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class ReviseRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)


class OfferEventOut(BaseModel):
    id: uuid.UUID
    event_type: str
    from_status: str | None
    to_status: str | None
    actor_type: str
    actor_name: str | None
    note: str | None
    metadata: dict | None
    created_at: datetime


class ApprovalOut(BaseModel):
    id: uuid.UUID
    revision_number: int
    status: str
    requested_by_name: str | None
    approved_by_name: str | None
    comments: str | None
    requested_at: datetime
    decided_at: datetime | None


class RevisionOut(BaseModel):
    id: uuid.UUID
    revision_number: int
    official_offer_number: str | None = None
    pdf_sha256: str | None = None
    issued_at: datetime | None
    created_at: datetime
    created_by_name: str | None
    has_pdf: bool
    is_current: bool


class OfferSummary(BaseModel):
    id: uuid.UUID
    offer_number: str
    official_offer_number: str | None = None
    status: OfferStatus
    effective_status: str
    candidate_id: uuid.UUID
    candidate_name: str
    candidate_email: str | None = None
    job_title: str
    department: str | None
    employment_type: str | None
    annual_ctc: float
    monthly_salary: float
    created_at: datetime
    issued_at: datetime | None
    expires_at: datetime | None
    viewed_at: datetime | None
    responded_at: datetime | None
    created_by_name: str | None
    approved_by_name: str | None
    revision_number: int
    current_revision_id: uuid.UUID | None


class OfferDetail(OfferSummary):
    data: dict
    internal_notes: str | None
    withdrawal_reason: str | None
    rejection_reason: str | None
    response: ResponseType | None
    accepted_at: datetime | None
    rejected_at: datetime | None
    withdrawn_at: datetime | None
    token_created_at: datetime | None
    token_revoked_at: datetime | None
    has_active_link: bool
    template_id: uuid.UUID | None
    template_name: str | None
    validity_days: int
    pdf_sha256: str | None = None
    events: list[OfferEventOut]
    approvals: list[ApprovalOut]
    revisions: list[RevisionOut]


class OfferIssueResponse(BaseModel):
    offer: OfferDetail
    secure_link: str | None
    verification_url: str | None = None
    official_offer_number: str | None = None
    pdf_sha256: str | None = None
    email_status: str
    message: str


class OfferPreviewResponse(BaseModel):
    html: str
