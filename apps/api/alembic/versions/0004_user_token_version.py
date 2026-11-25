"""Add token_version to staff users for server-side JWT revocation.

Revision ID: 0004_user_token_version
Revises: 0003_training_increment_policy
Create Date: 2026-12-02
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004_user_token_version"
down_revision: str | None = "0003_training_increment_policy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("token_version", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("users", "token_version")
