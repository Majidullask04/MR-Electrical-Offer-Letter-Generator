import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import (
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class OfferStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    ISSUED = "ISSUED"
    VIEWED = "VIEWED"
    REISSUED = "REISSUED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    WITHDRAWN = "WITHDRAWN"
    SUPERSEDED = "SUPERSEDED"


class VerificationStatus(str, Enum):
    VALID = "VALID"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"
    SUPERSEDED = "SUPERSEDED"


class EmploymentType(str, Enum):
    FULL_TIME = "FULL_TIME"
    PART_TIME = "PART_TIME"
    CONTRACT = "CONTRACT"
    TEMPORARY = "TEMPORARY"
    INTERNSHIP = "INTERNSHIP"


class ResponseType(str, Enum):
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class ApprovalStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    RETURNED = "RETURNED"


class ActorType(str, Enum):
    USER = "USER"
    CANDIDATE = "CANDIDATE"
    SYSTEM = "SYSTEM"


class Offer(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "offers"

    offer_number: Mapped[str] = mapped_column(
        String(40),
        unique=True,
        nullable=False,
        server_default=text(
            "'MEW-OL-' || to_char(CURRENT_DATE, 'YYYY') || '-' || "
            "lpad(nextval('offer_number_seq')::text, 4, '0')"
        ),
    )
    official_offer_number: Mapped[str | None] = mapped_column(String(60), unique=True, nullable=True)
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("candidates.id", ondelete="RESTRICT"), nullable=False
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offer_templates.id", ondelete="SET NULL")
    )
    status: Mapped[OfferStatus] = mapped_column(
        SAEnum(OfferStatus, native_enum=False, length=30, create_constraint=True, name="offer_status"),
        default=OfferStatus.DRAFT,
        nullable=False,
    )
    data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    validity_days: Mapped[int] = mapped_column(Integer, default=14, nullable=False)
    internal_notes: Mapped[str | None] = mapped_column(Text)
    draft_revision_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    current_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("offer_revisions.id", use_alter=True, name="fk_offers_current_revision"),
        nullable=True,
    )
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    issued_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawn_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    withdrawal_reason: Mapped[str | None] = mapped_column(Text)
    response: Mapped[ResponseType | None] = mapped_column(
        SAEnum(ResponseType, native_enum=False, length=20, create_constraint=True, name="offer_response")
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text)
    accepted_revision_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offer_revisions.id", ondelete="SET NULL")
    )
    secure_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    token_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    token_last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    candidate: Mapped["Candidate"] = relationship(lazy="joined")
    template: Mapped["OfferTemplate | None"] = relationship(lazy="joined")
    created_by: Mapped["User | None"] = relationship(
        foreign_keys=[created_by_id], lazy="joined"
    )
    approved_by: Mapped["User | None"] = relationship(
        foreign_keys=[approved_by_id], lazy="joined"
    )
    issued_by: Mapped["User | None"] = relationship(
        foreign_keys=[issued_by_id], lazy="joined"
    )
    current_revision: Mapped["OfferRevision | None"] = relationship(
        foreign_keys=[current_revision_id], post_update=True, lazy="joined"
    )
    revisions: Mapped[list["OfferRevision"]] = relationship(
        foreign_keys="OfferRevision.offer_id",
        back_populates="offer",
        order_by="OfferRevision.revision_number",
    )
    events: Mapped[list["OfferEvent"]] = relationship(
        back_populates="offer", order_by="OfferEvent.created_at"
    )
    approvals: Mapped[list["ApprovalRecord"]] = relationship(
        back_populates="offer", order_by="ApprovalRecord.requested_at"
    )
    verifications: Mapped[list["OfferVerification"]] = relationship(
        back_populates="offer", order_by="OfferVerification.created_at"
    )

    __table_args__ = (
        Index("ix_offers_status", "status"),
        Index("ix_offers_candidate", "candidate_id"),
        Index("ix_offers_issued_at", "issued_at"),
        Index("ix_offers_expires_at", "expires_at"),
        Index("ix_offers_status_created", "status", "created_at"),
    )


class OfferRevision(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "offer_revisions"

    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="CASCADE"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    official_offer_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    snapshot: Mapped[dict] = mapped_column(JSONB, nullable=False)
    rendered_html: Mapped[str] = mapped_column(Text, nullable=False)
    pdf_path: Mapped[str | None] = mapped_column(String(500))
    pdf_sha256: Mapped[str | None] = mapped_column(String(64), index=True)
    pdf_size_bytes: Mapped[int | None] = mapped_column(Integer)
    qr_data_uri: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    offer: Mapped[Offer] = relationship(foreign_keys=[offer_id], back_populates="revisions")
    created_by: Mapped["User | None"] = relationship(
        foreign_keys=[created_by_id], lazy="joined"
    )

    __table_args__ = (
        UniqueConstraint("offer_id", "revision_number", name="uq_offer_revision_number"),
        Index("ix_offer_revisions_offer", "offer_id"),
    )


class OfferEvent(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "offer_events"

    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="CASCADE"), nullable=False
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    from_status: Mapped[str | None] = mapped_column(String(30))
    to_status: Mapped[str | None] = mapped_column(String(30))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    actor_type: Mapped[ActorType] = mapped_column(
        SAEnum(ActorType, native_enum=False, length=20, create_constraint=True, name="actor_type"),
        default=ActorType.USER,
        nullable=False,
    )
    actor_name: Mapped[str | None] = mapped_column(String(160))
    note: Mapped[str | None] = mapped_column(Text)
    event_metadata: Mapped[dict | None] = mapped_column("metadata", JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    offer: Mapped[Offer] = relationship(back_populates="events")
    actor: Mapped["User | None"] = relationship(foreign_keys=[actor_id], lazy="joined")

    __table_args__ = (Index("ix_offer_events_offer_created", "offer_id", "created_at"),)


class ApprovalRecord(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "approval_records"

    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="CASCADE"), nullable=False
    )
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    requested_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[ApprovalStatus] = mapped_column(
        SAEnum(ApprovalStatus, native_enum=False, length=20, create_constraint=True, name="approval_status"),
        default=ApprovalStatus.PENDING,
        nullable=False,
    )
    comments: Mapped[str | None] = mapped_column(Text)
    requested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    offer: Mapped[Offer] = relationship(back_populates="approvals")
    requested_by: Mapped["User | None"] = relationship(
        foreign_keys=[requested_by_id], lazy="joined"
    )
    approved_by: Mapped["User | None"] = relationship(
        foreign_keys=[approved_by_id], lazy="joined"
    )

    __table_args__ = (Index("ix_approval_offer_revision", "offer_id", "revision_number"),)


class OfferVerification(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "offer_verifications"

    offer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offers.id", ondelete="CASCADE"), nullable=False
    )
    revision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offer_revisions.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    offer_number: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    draft_reference: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    verification_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    pdf_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    pdf_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default=VerificationStatus.VALID.value, nullable=False)
    superseded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("offer_verifications.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(Text)
    revoked_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    verified_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    offer: Mapped[Offer] = relationship(back_populates="verifications")
    revision: Mapped[OfferRevision] = relationship(lazy="joined")

    __table_args__ = (
        Index("ix_offer_verifications_offer", "offer_id"),
    )
