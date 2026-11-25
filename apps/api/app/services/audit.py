from __future__ import annotations

import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from app.deps import client_ip, user_agent
from app.models import AuditLog, User


def record_audit(
    db: Session,
    *,
    action: str,
    entity_type: str,
    entity_id: str | uuid.UUID | None = None,
    user: User | None = None,
    actor_email: str | None = None,
    metadata: dict | None = None,
    request: Request | None = None,
) -> AuditLog:
    """Persist an audit record. Never pass salaries or personal data in metadata."""
    entry = AuditLog(
        user_id=user.id if user else None,
        actor_email=user.email if user else actor_email,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        event_metadata=metadata or {},
        ip_address=client_ip(request) if request else None,
        user_agent=user_agent(request) if request else None,
    )
    db.add(entry)
    return entry
