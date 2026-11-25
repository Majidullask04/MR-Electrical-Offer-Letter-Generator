import uuid
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import EmploymentType
from app.schemas.common import ORMModel


class CandidateBase(BaseModel):
    candidate_code: str | None = Field(default=None, max_length=40)
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    current_address: str | None = Field(default=None, max_length=1000)
    applied_position: str = Field(min_length=2, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    proposed_joining_date: date | None = None
    reporting_manager: str | None = Field(default=None, max_length=160)
    work_location: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)

    @field_validator("email", "phone", "candidate_code", mode="before")
    @classmethod
    def blank_optional_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("email")
    @classmethod
    def lower_email(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else None

    @field_validator("full_name", "applied_position")
    @classmethod
    def strip_required(cls, value: str) -> str:
        return value.strip()


class CandidateCreate(CandidateBase):
    pass


class CandidateUpdate(BaseModel):
    candidate_code: str | None = Field(default=None, max_length=40)
    full_name: str | None = Field(min_length=2, max_length=160, default=None)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=7, max_length=30)
    current_address: str | None = Field(default=None, max_length=1000)
    applied_position: str | None = Field(default=None, min_length=2, max_length=160)
    department: str | None = Field(default=None, max_length=120)
    employment_type: EmploymentType | None = None
    proposed_joining_date: date | None = None
    reporting_manager: str | None = Field(default=None, max_length=160)
    work_location: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)
    is_active: bool | None = None

    @field_validator("email", "phone", "candidate_code", mode="before")
    @classmethod
    def blank_optional_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("email")
    @classmethod
    def lower_email(cls, value: str | None) -> str | None:
        return value.strip().lower() if value else value


class CandidateOut(ORMModel):
    id: uuid.UUID
    candidate_code: str | None = None
    full_name: str
    email: EmailStr | None = None
    phone: str | None = None
    current_address: str | None
    applied_position: str
    department: str | None
    employment_type: EmploymentType
    proposed_joining_date: date | None
    reporting_manager: str | None
    work_location: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class JobPositionOut(ORMModel):
    id: uuid.UUID
    title: str
    department: str | None
    is_active: bool


class JobPositionCreate(BaseModel):
    title: str = Field(min_length=2, max_length=160)
    department: str | None = Field(default=None, max_length=120)
