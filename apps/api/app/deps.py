from __future__ import annotations

import uuid
from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyCookie
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User
from app.security import ROLE_HIRING_MANAGER, ROLE_HR_MANAGER, ROLE_SUPER_ADMIN, decode_access_token

session_cookie = APIKeyCookie(name=settings.session_cookie, auto_error=False)
DbSession = Annotated[Session, Depends(get_db)]


def get_current_user(
    request: Request,
    db: DbSession,
    token: Annotated[str | None, Depends(session_cookie)] = None,
) -> User:
    token = token or request.cookies.get(settings.session_cookie)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "NOT_AUTHENTICATED", "message": "Sign in to continue."},
        )
    try:
        payload = decode_access_token(token)
    except Exception as exc:  # noqa: BLE001 - all token failures are auth failures
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "SESSION_EXPIRED", "message": "Your session has expired. Sign in again."},
        ) from exc

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "SESSION_EXPIRED", "message": "Your session is invalid. Sign in again."},
        ) from exc

    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "ACCOUNT_INACTIVE", "message": "This account is not active."},
        )
    if int(payload.get("tv", 1)) != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "SESSION_REVOKED", "message": "Your session is no longer valid. Sign in again."},
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_roles(*allowed: str) -> Callable[[User], User]:
    def dependency(user: CurrentUser) -> User:
        if not user.role_keys.intersection(allowed):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "FORBIDDEN",
                    "message": "You do not have permission to perform this action.",
                },
            )
        return user

    return dependency


SuperAdmin = Annotated[User, Depends(require_roles(ROLE_SUPER_ADMIN))]
HrOrAdmin = Annotated[User, Depends(require_roles(ROLE_HR_MANAGER, ROLE_SUPER_ADMIN))]
Approver = Annotated[User, Depends(require_roles(ROLE_HIRING_MANAGER, ROLE_SUPER_ADMIN))]
AnyStaff = Annotated[
    User,
    Depends(require_roles(ROLE_SUPER_ADMIN, ROLE_HR_MANAGER, ROLE_HIRING_MANAGER)),
]


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and settings.trusted_proxy_count > 0:
        parts = [part.strip() for part in forwarded.split(",")]
        # Each trusted proxy appends the originating IP on the right, so the
        # rightmost TRUSTED_PROXY_COUNT values are trusted hop addresses. Skip
        # them to expose the genuine client IP (ignoring spoofed leftmost hops).
        index = len(parts) - settings.trusted_proxy_count - 1
        index = max(0, min(index, len(parts) - 1))
        client = parts[index] if parts else None
        if client:
            return client
    return request.client.host if request.client else None


def user_agent(request: Request) -> str | None:
    agent = request.headers.get("user-agent")
    return agent[:512] if agent else None
