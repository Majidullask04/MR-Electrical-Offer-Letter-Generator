from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel
from app.schemas.offer import TrainingIncrementPolicy


class CompanyOut(ORMModel):
    id: uuid.UUID
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
    gst_number: str | None
    cin_number: str | None
    logo_url: str | None
    primary_color: str
    accent_color: str
    signatory_name: str | None
    signatory_title: str | None
    signatory_email: str | None
    footer_note: str | None
    offer_prefix: str
    official_offer_prefix: str
    offer_number_format: str
    company_intro: str | None = None
    signature_image_data: str | None = None
    seal_image_data: str | None = None
    generator_config: dict | None = None
    default_validity_days: int
    default_probation_months: int
    default_work_location: str | None
    default_working_days: str | None
    default_working_hours: str | None
    default_terms: dict | None
    default_training_policy: TrainingIncrementPolicy = Field(default_factory=TrainingIncrementPolicy)
    updated_at: datetime


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    legal_name: str | None = Field(default=None, max_length=200)
    tagline: str | None = Field(default=None, max_length=255)
    website: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=50)
    address_line1: str | None = Field(default=None, max_length=255)
    address_line2: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    country: str | None = Field(default=None, max_length=80)
    udyam_number: str | None = Field(default=None, max_length=60)
    gst_number: str | None = Field(default=None, max_length=30)
    cin_number: str | None = Field(default=None, max_length=40)
    logo_url: str | None = Field(default=None, max_length=500)
    primary_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    accent_color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    signatory_name: str | None = Field(default=None, max_length=160)
    signatory_title: str | None = Field(default=None, max_length=160)
    signatory_email: str | None = Field(default=None, max_length=255)
    footer_note: str | None = Field(default=None, max_length=2000)
    offer_prefix: str | None = Field(default=None, max_length=20)
    official_offer_prefix: str | None = Field(default=None, min_length=2, max_length=20)
    offer_number_format: str | None = Field(default=None, min_length=5, max_length=80)
    company_intro: str | None = Field(default=None, max_length=4000)
    signature_image_data: str | None = Field(default=None, max_length=700_000)
    seal_image_data: str | None = Field(default=None, max_length=700_000)
    generator_config: dict | None = None
    default_validity_days: int | None = Field(default=None, ge=1, le=90)
    default_probation_months: int | None = Field(default=None, ge=0, le=12)
    default_work_location: str | None = Field(default=None, max_length=200)
    default_working_days: str | None = Field(default=None, max_length=120)
    default_working_hours: str | None = Field(default=None, max_length=120)
    default_terms: dict | None = None
    default_training_policy: TrainingIncrementPolicy | None = None

    @field_validator("gst_number", "udyam_number", "cin_number", "company_intro", "signature_image_data", "seal_image_data", mode="before")
    @classmethod
    def blank_to_none(cls, value):
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("signature_image_data", "seal_image_data")
    @classmethod
    def validate_image_data_uri(cls, value: str | None) -> str | None:
        if value is None:
            return None
        import base64

        allowed = (
            "data:image/png;base64,",
            "data:image/jpeg;base64,",
            "data:image/jpg;base64,",
            "data:image/webp;base64,",
        )
        prefix = next((item for item in allowed if value.startswith(item)), None)
        if not prefix:
            raise ValueError("Upload a PNG, JPG, or WebP image data URI.")
        try:
            raw = base64.b64decode(value[len(prefix) :], validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Uploaded image data is invalid.") from exc
        is_png = raw.startswith(b"\x89PNG\r\n\x1a\n")
        is_jpg = raw.startswith(b"\xff\xd8\xff")
        is_webp = raw.startswith(b"RIFF") and raw[8:12] == b"WEBP"
        if not (is_png or is_jpg or is_webp):
            raise ValueError("Uploaded image bytes do not match PNG, JPG, or WebP.")
        return value

    @field_validator("offer_number_format")
    @classmethod
    def validate_offer_format(cls, value: str | None) -> str | None:
        if value is None:
            return None
        try:
            rendered = value.format(prefix="MREW/OL", year=2026, seq=1)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("Format must support {prefix}, {year}, and {seq}.") from exc
        if not rendered or len(rendered) > 60:
            raise ValueError("Formatted Offer ID is empty or exceeds 60 characters.")
        return value
