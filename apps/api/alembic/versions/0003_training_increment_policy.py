"""Add structured training, compensation progression, and increment policy fields.

Revision ID: 0003_training_increment_policy
Revises: 0002_verification_and_generator
Create Date: 2026-11-25
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_training_increment_policy"
down_revision: str | None = "0002_verification_and_generator"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_TRAINING_POLICY = {
    "enabled": True,
    "training_period_months": 1,
    "training_monthly_salary_inr": 14000,
    "food_provided": False,
    "site_accommodation_free": True,
    "post_training_salary_min_inr": 18000,
    "post_training_salary_max_inr": 25000,
    "post_training_duration_months": 6,
    "first_increment_after_months": 6,
    "first_increment_max_percent": 30,
    "increment_criteria": "Behaviour and performance",
}


def upgrade() -> None:
    op.add_column(
        "company_profiles",
        sa.Column("default_training_policy", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "offers",
        sa.Column("training_policy", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    default_json = json.dumps(DEFAULT_TRAINING_POLICY).replace("'", "''")
    op.execute(
        f"UPDATE company_profiles SET default_training_policy = '{default_json}'::jsonb "
        "WHERE default_training_policy IS NULL"
    )


def downgrade() -> None:
    op.drop_column("offers", "training_policy")
    op.drop_column("company_profiles", "default_training_policy")
