import uuid
from datetime import date, datetime

from sqlalchemy import Date, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class CompanyProfile(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "company_profiles"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(200))
    tagline: Mapped[str | None] = mapped_column(String(255))
    website: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    address_line1: Mapped[str | None] = mapped_column(String(255))
    address_line2: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    state: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str | None] = mapped_column(String(80), default="India")
    udyam_number: Mapped[str | None] = mapped_column(String(60))
    gst_number: Mapped[str | None] = mapped_column(String(30))
    cin_number: Mapped[str | None] = mapped_column(String(40))
    logo_url: Mapped[str | None] = mapped_column(String(500))
    primary_color: Mapped[str] = mapped_column(String(9), default="#B35010")
    accent_color: Mapped[str] = mapped_column(String(9), default="#0E639C")
    signatory_name: Mapped[str | None] = mapped_column(String(160))
    signatory_title: Mapped[str | None] = mapped_column(String(160))
    signatory_email: Mapped[str | None] = mapped_column(String(255))
    footer_note: Mapped[str | None] = mapped_column(Text)
    offer_prefix: Mapped[str] = mapped_column(String(20), default="MEW-OL")
    official_offer_prefix: Mapped[str] = mapped_column(String(20), default="MREW/OL", nullable=False)
    offer_number_format: Mapped[str] = mapped_column(
        String(80), default="{prefix}/{year}/{seq:06d}", nullable=False
    )
    company_intro: Mapped[str | None] = mapped_column(Text)
    signature_image_data: Mapped[str | None] = mapped_column(Text)
    seal_image_data: Mapped[str | None] = mapped_column(Text)
    generator_config: Mapped[dict | None] = mapped_column(JSONB)
    default_validity_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    default_probation_months: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    default_work_location: Mapped[str | None] = mapped_column(String(200))
    default_working_days: Mapped[str | None] = mapped_column(String(120))
    default_working_hours: Mapped[str | None] = mapped_column(String(120))
    default_terms: Mapped[dict | None] = mapped_column(JSONB)
    default_training_policy: Mapped[dict | None] = mapped_column(JSONB)


class JobPosition(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "job_positions"

    title: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    department: Mapped[str | None] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)


class Candidate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "candidates"

    candidate_code: Mapped[str | None] = mapped_column(String(40), index=True)
    full_name: Mapped[str] = mapped_column(String(160), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    current_address: Mapped[str | None] = mapped_column(Text)
    applied_position: Mapped[str] = mapped_column(String(160), nullable=False)
    department: Mapped[str | None] = mapped_column(String(120))
    employment_type: Mapped[str] = mapped_column(String(30), default="FULL_TIME", nullable=False)
    proposed_joining_date: Mapped[date | None] = mapped_column(Date)
    reporting_manager: Mapped[str | None] = mapped_column(String(160))
    work_location: Mapped[str | None] = mapped_column(String(200))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id], lazy="joined")

    __table_args__ = (
        Index("ix_candidates_name", "full_name"),
        Index("ix_candidates_email_lower", email),
    )


class TemplateBlock(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "template_blocks"

    key: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))


class OfferTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "offer_templates"

    name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(String(255))
    html_content: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_default: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    signatory_name: Mapped[str | None] = mapped_column(String(160))
    signatory_title: Mapped[str | None] = mapped_column(String(160))
    signatory_email: Mapped[str | None] = mapped_column(String(255))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id], lazy="joined")
    updated_by: Mapped["User | None"] = relationship(foreign_keys=[updated_by_id], lazy="joined")
