"""Initial OfferLater schema.

Revision ID: 0001_initial
Revises:
Create Date: 2026-11-25

The offers <-> offer_revisions relationship is circular. Tables are therefore
created in dependency order and the two revision foreign keys are added by
ALTER TABLE after both tables exist.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_initial"
down_revision: str | None = None
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
)


def upgrade() -> None:
    op.execute("CREATE SEQUENCE offer_number_seq START WITH 1 INCREMENT BY 1 NO CYCLE")

    op.create_table(
        "company_profiles",
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("legal_name", sa.String(length=200), nullable=True),
        sa.Column("tagline", sa.String(length=255), nullable=True),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=50), nullable=True),
        sa.Column("address_line1", sa.String(length=255), nullable=True),
        sa.Column("address_line2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("country", sa.String(length=80), nullable=True),
        sa.Column("udyam_number", sa.String(length=60), nullable=True),
        sa.Column("gst_number", sa.String(length=30), nullable=True),
        sa.Column("cin_number", sa.String(length=40), nullable=True),
        sa.Column("logo_url", sa.String(length=500), nullable=True),
        sa.Column("primary_color", sa.String(length=9), nullable=False),
        sa.Column("accent_color", sa.String(length=9), nullable=False),
        sa.Column("signatory_name", sa.String(length=160), nullable=True),
        sa.Column("signatory_title", sa.String(length=160), nullable=True),
        sa.Column("signatory_email", sa.String(length=255), nullable=True),
        sa.Column("footer_note", sa.Text(), nullable=True),
        sa.Column("offer_prefix", sa.String(length=20), nullable=False),
        sa.Column("default_validity_days", sa.Integer(), nullable=False),
        sa.Column("default_probation_months", sa.Integer(), nullable=False),
        sa.Column("default_work_location", sa.String(length=200), nullable=True),
        sa.Column("default_working_days", sa.String(length=120), nullable=True),
        sa.Column("default_working_hours", sa.String(length=120), nullable=True),
        sa.Column("default_terms", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_company_profiles")),
    )

    op.create_table(
        "job_positions",
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("department", sa.String(length=120), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_job_positions")),
        sa.UniqueConstraint("title", name=op.f("uq_job_positions_title")),
    )

    op.create_table(
        "template_blocks",
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_template_blocks")),
        sa.UniqueConstraint("key", name=op.f("uq_template_blocks_key")),
    )

    op.create_table(
        "users",
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=160), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=True)

    op.create_table(
        "roles",
        sa.Column("key", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("key", name=op.f("uq_roles_key")),
    )

    op.create_table(
        "user_role_assignments",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"],
            name=op.f("fk_user_role_assignments_role_id_roles"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_user_role_assignments_user_id_users"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", "role_id", name=op.f("pk_user_role_assignments")),
    )

    op.create_table(
        "offer_templates",
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("html_content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("signatory_name", sa.String(length=160), nullable=True),
        sa.Column("signatory_title", sa.String(length=160), nullable=True),
        sa.Column("signatory_email", sa.String(length=255), nullable=True),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column("updated_by_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"],
            name=op.f("fk_offer_templates_created_by_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_id"], ["users.id"],
            name=op.f("fk_offer_templates_updated_by_id_users"), ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offer_templates")),
        sa.UniqueConstraint("name", name=op.f("uq_offer_templates_name")),
    )

    op.create_table(
        "candidates",
        sa.Column("full_name", sa.String(length=160), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=False),
        sa.Column("current_address", sa.Text(), nullable=True),
        sa.Column("applied_position", sa.String(length=160), nullable=False),
        sa.Column("department", sa.String(length=120), nullable=True),
        sa.Column("employment_type", sa.String(length=30), nullable=False),
        sa.Column("proposed_joining_date", sa.Date(), nullable=True),
        sa.Column("reporting_manager", sa.String(length=160), nullable=True),
        sa.Column("work_location", sa.String(length=200), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"],
            name=op.f("fk_candidates_created_by_id_users"), ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_candidates")),
        sa.UniqueConstraint("email", name=op.f("uq_candidates_email")),
    )
    op.create_index("ix_candidates_name", "candidates", ["full_name"], unique=False)
    op.create_index("ix_candidates_email_lower", "candidates", ["email"], unique=False)

    op.create_table(
        "offers",
        sa.Column(
            "offer_number",
            sa.String(length=40),
            server_default=sa.text(
                "'MEW-OL-' || to_char(CURRENT_DATE, 'YYYY') || '-' || "
                "lpad(nextval('offer_number_seq')::text, 4, '0')"
            ),
            nullable=False,
        ),
        sa.Column("candidate_id", sa.UUID(), nullable=False),
        sa.Column("template_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("validity_days", sa.Integer(), nullable=False),
        sa.Column("internal_notes", sa.Text(), nullable=True),
        sa.Column("draft_revision_number", sa.Integer(), nullable=False),
        sa.Column("current_revision_id", sa.UUID(), nullable=True),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column("approved_by_id", sa.UUID(), nullable=True),
        sa.Column("issued_by_id", sa.UUID(), nullable=True),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("responded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdrawn_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("withdrawal_reason", sa.Text(), nullable=True),
        sa.Column("response", sa.String(length=20), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("accepted_revision_id", sa.UUID(), nullable=True),
        sa.Column("secure_token_hash", sa.String(length=64), nullable=True),
        sa.Column("token_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("token_last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["approved_by_id"], ["users.id"],
            name=op.f("fk_offers_approved_by_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["candidate_id"], ["candidates.id"],
            name=op.f("fk_offers_candidate_id_candidates"), ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"],
            name=op.f("fk_offers_created_by_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["issued_by_id"], ["users.id"],
            name=op.f("fk_offers_issued_by_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["template_id"], ["offer_templates.id"],
            name=op.f("fk_offers_template_id_offer_templates"), ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offers")),
        sa.UniqueConstraint("offer_number", name=op.f("uq_offers_offer_number")),
        sa.UniqueConstraint("secure_token_hash", name=op.f("uq_offers_secure_token_hash")),
    )
    op.create_index("ix_offers_candidate", "offers", ["candidate_id"], unique=False)
    op.create_index("ix_offers_expires_at", "offers", ["expires_at"], unique=False)
    op.create_index("ix_offers_issued_at", "offers", ["issued_at"], unique=False)
    op.create_index("ix_offers_status", "offers", ["status"], unique=False)
    op.create_index("ix_offers_status_created", "offers", ["status", "created_at"], unique=False)

    op.create_table(
        "offer_revisions",
        sa.Column("offer_id", sa.UUID(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("rendered_html", sa.Text(), nullable=False),
        sa.Column("pdf_path", sa.String(length=500), nullable=True),
        sa.Column("created_by_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("issued_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["created_by_id"], ["users.id"],
            name=op.f("fk_offer_revisions_created_by_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["offer_id"], ["offers.id"],
            name=op.f("fk_offer_revisions_offer_id_offers"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offer_revisions")),
        sa.UniqueConstraint("offer_id", "revision_number", name="uq_offer_revision_number"),
    )
    op.create_index("ix_offer_revisions_offer", "offer_revisions", ["offer_id"], unique=False)

    op.create_foreign_key(
        "fk_offers_current_revision",
        "offers",
        "offer_revisions",
        ["current_revision_id"],
        ["id"],
    )
    op.create_foreign_key(
        op.f("fk_offers_accepted_revision_id_offer_revisions"),
        "offers",
        "offer_revisions",
        ["accepted_revision_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_check_constraint(
        "offer_status",
        "offers",
        sa.text(
            "status IN ("
            + ", ".join(f"'{value}'" for value in OFFER_STATUSES)
            + ")"
        ),
    )
    op.create_check_constraint(
        "offer_response",
        "offers",
        sa.text("response IS NULL OR response IN ('ACCEPTED', 'REJECTED')"),
    )

    op.create_table(
        "approval_records",
        sa.Column("offer_id", sa.UUID(), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("requested_by_id", sa.UUID(), nullable=True),
        sa.Column("approved_by_id", sa.UUID(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("comments", sa.Text(), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["approved_by_id"], ["users.id"],
            name=op.f("fk_approval_records_approved_by_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["offer_id"], ["offers.id"],
            name=op.f("fk_approval_records_offer_id_offers"), ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["requested_by_id"], ["users.id"],
            name=op.f("fk_approval_records_requested_by_id_users"), ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_approval_records")),
    )
    op.create_index("ix_approval_offer_revision", "approval_records", ["offer_id", "revision_number"], unique=False)
    op.create_check_constraint(
        "approval_status",
        "approval_records",
        sa.text("status IN ('PENDING', 'APPROVED', 'RETURNED')"),
    )

    op.create_table(
        "audit_logs",
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("actor_email", sa.String(length=255), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("entity_type", sa.String(length=60), nullable=False),
        sa.Column("entity_id", sa.String(length=60), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("user_agent", sa.String(length=512), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name=op.f("fk_audit_logs_user_id_users"), ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_logs")),
    )
    op.create_index(op.f("ix_audit_logs_action"), "audit_logs", ["action"], unique=False)

    op.create_table(
        "email_notifications",
        sa.Column("offer_id", sa.UUID(), nullable=True),
        sa.Column("recipient", sa.String(length=255), nullable=False),
        sa.Column("template_key", sa.String(length=60), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("html_body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["offer_id"], ["offers.id"],
            name=op.f("fk_email_notifications_offer_id_offers"), ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_notifications")),
    )

    op.create_table(
        "offer_events",
        sa.Column("offer_id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("from_status", sa.String(length=30), nullable=True),
        sa.Column("to_status", sa.String(length=30), nullable=True),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("actor_type", sa.String(length=20), nullable=False),
        sa.Column("actor_name", sa.String(length=160), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"],
            name=op.f("fk_offer_events_actor_id_users"), ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["offer_id"], ["offers.id"],
            name=op.f("fk_offer_events_offer_id_offers"), ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_offer_events")),
    )
    op.create_index("ix_offer_events_offer_created", "offer_events", ["offer_id", "created_at"], unique=False)
    op.create_check_constraint(
        "actor_type",
        "offer_events",
        sa.text("actor_type IN ('USER', 'CANDIDATE', 'SYSTEM')"),
    )


def downgrade() -> None:
    op.drop_table("offer_events")
    op.drop_table("email_notifications")
    op.drop_table("audit_logs")
    op.drop_table("approval_records")
    op.drop_constraint("fk_offers_accepted_revision_id_offer_revisions", "offers", type_="foreignkey")
    op.drop_constraint("fk_offers_current_revision", "offers", type_="foreignkey")
    op.drop_constraint("ck_offers_offer_response", "offers", type_="check")
    op.drop_constraint("ck_offers_offer_status", "offers", type_="check")
    op.drop_table("offer_revisions")
    op.drop_table("offers")
    op.drop_table("candidates")
    op.drop_table("offer_templates")
    op.drop_table("user_role_assignments")
    op.drop_table("roles")
    op.drop_table("users")
    op.drop_table("template_blocks")
    op.drop_table("job_positions")
    op.drop_table("company_profiles")
    op.execute("DROP SEQUENCE offer_number_seq")
