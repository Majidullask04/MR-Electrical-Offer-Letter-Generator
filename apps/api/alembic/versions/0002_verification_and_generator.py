"""Add verification registry, PDF integrity hashes, official numbering, and generator config.

Revision ID: 0002_verification_and_generator
Revises: 0001_initial
Create Date: 2026-11-25
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0002_verification_and_generator"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OFFER_STATUSES = (
    "DRAFT",
    "PENDING_APPROVAL",
    "APPROVED",
    "ISSUED",
    "VIEWED",
    "REISSUED",
    "ACCEPTED",
    "REJECTED",
    "EXPIRED",
    "WITHDRAWN",
    "SUPERSEDED",
)


def upgrade() -> None:
    op.execute("CREATE SEQUENCE IF NOT EXISTS official_offer_seq START WITH 1 INCREMENT BY 1 NO CYCLE")

    op.add_column(
        "company_profiles",
        sa.Column("official_offer_prefix", sa.String(length=20), server_default="MREW/OL", nullable=False),
    )
    op.add_column(
        "company_profiles",
        sa.Column(
            "offer_number_format",
            sa.String(length=80),
            server_default="{prefix}/{year}/{seq:06d}",
            nullable=False,
        ),
    )
    op.add_column("company_profiles", sa.Column("company_intro", sa.Text(), nullable=True))
    op.add_column("company_profiles", sa.Column("signature_image_data", sa.Text(), nullable=True))
    op.add_column("company_profiles", sa.Column("seal_image_data", sa.Text(), nullable=True))
    op.add_column(
        "company_profiles",
        sa.Column("generator_config", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )

    op.add_column("candidates", sa.Column("candidate_code", sa.String(length=40), nullable=True))
    op.create_index("ix_candidates_code", "candidates", ["candidate_code"], unique=False)
    op.alter_column("candidates", "email", existing_type=sa.String(length=255), nullable=True)
    op.alter_column("candidates", "phone", existing_type=sa.String(length=30), nullable=True)

    op.add_column("offers", sa.Column("official_offer_number", sa.String(length=60), nullable=True))
    op.create_unique_constraint(
        op.f("uq_offers_official_offer_number"), "offers", ["official_offer_number"]
    )
    op.execute("ALTER TABLE offers DROP CONSTRAINT IF EXISTS ck_offers_offer_status")
    op.create_check_constraint(
        "offer_status",
        "offers",
        sa.text(
            "status IN (" + ", ".join(f"'{value}'" for value in OFFER_STATUSES) + ")"
        ),
    )

    op.add_column("offer_revisions", sa.Column("official_offer_number", sa.String(length=60), nullable=True))
    op.add_column("offer_revisions", sa.Column("pdf_sha256", sa.String(length=64), nullable=True))
    op.add_column("offer_revisions", sa.Column("pdf_size_bytes", sa.Integer(), nullable=True))
    op.add_column("offer_revisions", sa.Column("qr_data_uri", sa.Text(), nullable=True))
    op.create_index("ix_offer_revisions_pdf_sha256", "offer_revisions", ["pdf_sha256"], unique=False)

    op.create_table(
        "offer_verifications",
        sa.Column("offer_id", sa.UUID(), nullable=False),
        sa.Column("revision_id", sa.UUID(), nullable=False),
        sa.Column("offer_number", sa.String(length=60), nullable=False),
        sa.Column("draft_reference", sa.String(length=40), nullable=False),
        sa.Column("verification_token_hash", sa.String(length=64), nullable=False),
        sa.Column("pdf_sha256", sa.String(length=64), nullable=False),
        sa.Column("pdf_size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="VALID", nullable=False),
        sa.Column("superseded_by_id", sa.UUID(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_reason", sa.Text(), nullable=True),
        sa.Column("revoked_by_id", sa.UUID(), nullable=True),
        sa.Column("verified_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["offer_id"], ["offers.id"],
            name=op.f("fk_offer_verifications_offer_id_offers"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["revision_id"], ["offer_revisions.id"],
            name=op.f("fk_offer_verifications_revision_id_offer_revisions"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["revoked_by_id"], ["users.id"],
            name=op.f("fk_offer_verifications_revoked_by_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["superseded_by_id"], ["offer_verifications.id"],
            name=op.f("fk_offer_verifications_superseded_by_id_offer_verifications"), ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offer_verifications")),
        sa.UniqueConstraint("revision_id", name=op.f("uq_offer_verifications_revision_id")),
        sa.UniqueConstraint(
            "verification_token_hash", name=op.f("uq_offer_verifications_verification_token_hash")
        ),
    )
    op.create_index("ix_offer_verifications_offer", "offer_verifications", ["offer_id"], unique=False)
    op.create_index("ix_offer_verifications_number", "offer_verifications", ["offer_number"], unique=False)
    op.create_index("ix_offer_verifications_draft_ref", "offer_verifications", ["draft_reference"], unique=False)
    op.create_index("ix_offer_verifications_pdf_sha256", "offer_verifications", ["pdf_sha256"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_offer_verifications_pdf_sha256", table_name="offer_verifications")
    op.drop_index("ix_offer_verifications_draft_ref", table_name="offer_verifications")
    op.drop_index("ix_offer_verifications_number", table_name="offer_verifications")
    op.drop_index("ix_offer_verifications_offer", table_name="offer_verifications")
    op.drop_table("offer_verifications")

    op.drop_index("ix_offer_revisions_pdf_sha256", table_name="offer_revisions")
    op.drop_column("offer_revisions", "qr_data_uri")
    op.drop_column("offer_revisions", "pdf_size_bytes")
    op.drop_column("offer_revisions", "pdf_sha256")
    op.drop_column("offer_revisions", "official_offer_number")

    op.drop_constraint(op.f("uq_offers_official_offer_number"), "offers", type_="unique")
    op.drop_column("offers", "official_offer_number")

    op.drop_index("ix_candidates_code", table_name="candidates")
    op.drop_column("candidates", "candidate_code")
    op.alter_column("candidates", "phone", existing_type=sa.String(length=30), nullable=False)
    op.alter_column("candidates", "email", existing_type=sa.String(length=255), nullable=False)

    op.drop_column("company_profiles", "generator_config")
    op.drop_column("company_profiles", "seal_image_data")
    op.drop_column("company_profiles", "signature_image_data")
    op.drop_column("company_profiles", "company_intro")
    op.drop_column("company_profiles", "offer_number_format")
    op.drop_column("company_profiles", "official_offer_prefix")
    op.execute("DROP SEQUENCE IF EXISTS official_offer_seq")
