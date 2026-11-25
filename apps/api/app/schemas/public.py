import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.offer import CompensationDetails


class PublicCompany(BaseModel):
    name: str
    legal_name: str | None
    tagline: str | None
    website: str | None
    email: str | None
    phone: str | None
    address_line1: str | None
    address_line2: str | None
    city: str | None
    state: str | None
    postal_code: str | None
    country: str | None
    udyam_number: str | None
    logo_url: str | None
    primary_color: str
    accent_color: str
    signatory_name: str | None
    signatory_title: str | None


class PublicOfferOut(BaseModel):
    reference: str
    status: str
    company: PublicCompany
    candidate_name: str
    position: str
    department: str | None
    employment_type: str
    joining_date: date | None
    work_location: str | None
    reporting_manager: str | None
    working_days: str | None = None
    working_hours: str | None = None
    joining_instructions: str | None = None
    offer_date: datetime | None
    expires_at: datetime | None
    response: str | None
    responded_at: datetime | None
    compensation: CompensationDetails
    has_responded: bool
    is_expired: bool
    pdf_available: bool
    revision_number: int


class PublicAcceptRequest(BaseModel):
    consent: bool
    typed_name: str | None = Field(default=None, max_length=160)

    @field_validator("consent")
    @classmethod
    def must_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Please confirm that you have read and understood the offer.")
        return value


class PublicRejectRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=1000)
    consent: bool = False

    @field_validator("consent")
    @classmethod
    def must_consent(cls, value: bool) -> bool:
        if not value:
            raise ValueError("Please confirm that you want to decline this offer.")
        return value


class PublicActionResponse(BaseModel):
    status: str
    message: str
    responded_at: datetime


class PublicErrorOut(BaseModel):
    code: str
    message: str
    reference: str | None = None
    company_name: str | None = None
