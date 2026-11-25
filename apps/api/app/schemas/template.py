import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class TemplateBlockOut(ORMModel):
    id: uuid.UUID
    key: str
    name: str
    content: str
    description: str | None
    updated_at: datetime


class TemplateBlockCreate(BaseModel):
    key: str = Field(min_length=2, max_length=60, pattern=r"^[a-z][a-z0-9_]*$")
    name: str = Field(min_length=2, max_length=120)
    content: str = Field(min_length=1, max_length=20000)
    description: str | None = Field(default=None, max_length=255)


class TemplateBlockUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    content: str | None = Field(default=None, min_length=1, max_length=20000)
    description: str | None = Field(default=None, max_length=255)


class TemplateBase(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=255)
    html_content: str = Field(min_length=100, max_length=200_000)
    signatory_name: str | None = Field(default=None, max_length=160)
    signatory_title: str | None = Field(default=None, max_length=160)
    signatory_email: str | None = Field(default=None, max_length=255)
    is_active: bool = True

    @field_validator("html_content")
    @classmethod
    def reject_script(cls, value: str) -> str:
        lowered = value.lower()
        for forbidden in ("<script", "javascript:", "{{ cycler", "{{ joiner", "{{ namespace"):
            if forbidden in lowered:
                raise ValueError(f"Template contains a forbidden construct: {forbidden}")
        return value


class TemplateCreate(TemplateBase):
    is_default: bool = False


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=255)
    html_content: str | None = Field(default=None, min_length=100, max_length=200_000)
    signatory_name: str | None = Field(default=None, max_length=160)
    signatory_title: str | None = Field(default=None, max_length=160)
    signatory_email: str | None = Field(default=None, max_length=255)
    is_active: bool | None = None

    @field_validator("html_content")
    @classmethod
    def reject_script(cls, value: str | None) -> str | None:
        if value is None:
            return value
        lowered = value.lower()
        for forbidden in ("<script", "javascript:", "{{ cycler", "{{ joiner", "{{ namespace"):
            if forbidden in lowered:
                raise ValueError(f"Template contains a forbidden construct: {forbidden}")
        return value


class TemplateOut(ORMModel):
    id: uuid.UUID
    name: str
    description: str | None
    html_content: str
    version: int
    is_default: bool
    is_active: bool
    signatory_name: str | None
    signatory_title: str | None
    signatory_email: str | None
    created_at: datetime
    updated_at: datetime


class TemplatePreviewRequest(BaseModel):
    html_content: str = Field(min_length=100, max_length=200_000)


class TemplatePreviewResponse(BaseModel):
    html: str
