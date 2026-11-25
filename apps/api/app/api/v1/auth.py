import uuid
from datetime import UTC, datetime

import jwt
from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.deps import CurrentUser, DbSession
from app.models import Role, User
from app.rate_limit import limiter
from app.schemas.auth import LoginRequest, RoleOut, UserOut
from app.security import create_access_token, generate_csrf_token, hash_password, verify_password
from app.services.audit import record_audit

router = APIRouter(prefix="/auth", tags=["auth"])


def set_auth_cookies(response: Response, token: str) -> None:
    max_age = settings.session_ttl_minutes * 60
    response.set_cookie(
        key=settings.session_cookie,
        value=token,
        max_age=max_age,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        domain=settings.cookie_domain or None,
    )
    response.set_cookie(
        key=settings.csrf_cookie,
        value=generate_csrf_token(),
        max_age=max_age,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
        domain=settings.cookie_domain or None,
    )


def clear_auth_cookies(response: Response) -> None:
    for key in (settings.session_cookie, settings.csrf_cookie):
        response.delete_cookie(
            key=key,
            path="/",
            domain=settings.cookie_domain or None,
            secure=settings.cookie_secure,
            httponly=key == settings.session_cookie,
            samesite="lax",
        )


@router.post("/login", response_model=UserOut)
@limiter.limit("10/minute")
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    db: DbSession,
):
    user = db.scalars(
        select(User).where(func.lower(User.email) == payload.email.strip().lower())
    ).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_CREDENTIALS", "message": "Email or password is incorrect."},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "ACCOUNT_INACTIVE", "message": "This account has been deactivated."},
        )
    token, _ = create_access_token(user.id, user.role_keys, user.token_version)
    set_auth_cookies(response, token)
    user.last_login_at = datetime.now(UTC)
    record_audit(
        db,
        action="auth.login",
        entity_type="user",
        entity_id=user.id,
        user=user,
        request=request,
    )
    db.commit()
    db.refresh(user)
    return UserOut.from_user(user)


@router.post("/logout")
def logout(response: Response, db: DbSession, request: Request):
    token = request.cookies.get(settings.session_cookie)
    if token:
        try:
            payload = jwt.decode(
                token, settings.secret_key, algorithms=["HS256"], options={"verify_exp": False}
            )
            user = db.get(User, uuid.UUID(payload["sub"]))
            if user:
                user.token_version += 1
                record_audit(
                    db,
                    action="auth.logout",
                    entity_type="user",
                    entity_id=user.id,
                    user=user,
                    request=request,
                )
        except Exception:  # noqa: BLE001 - a stale or malformed session is still cleared
            pass
    clear_auth_cookies(response)
    db.commit()
    return {"message": "Signed out."}


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return UserOut.from_user(user)


@router.get("/roles", response_model=list[RoleOut])
def roles(db: DbSession, user: CurrentUser):
    if "SUPER_ADMIN" not in user.role_keys:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Only a super admin can view role definitions."},
        )
    return db.scalars(select(Role).order_by(Role.name)).all()


@router.post("/change-password")
def change_password(
    payload: dict,
    user: CurrentUser,
    db: DbSession,
    request: Request,
):
    current_password = str(payload.get("current_password", ""))
    new_password = str(payload.get("new_password", ""))
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_PASSWORD", "message": "Your current password is incorrect."},
        )
    if len(new_password) < 10:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "WEAK_PASSWORD", "message": "Use at least 10 characters for the new password."},
        )
    user.password_hash = hash_password(new_password)
    user.token_version += 1
    record_audit(
        db,
        action="auth.password_changed",
        entity_type="user",
        entity_id=user.id,
        user=user,
        request=request,
    )
    db.commit()
    return {"message": "Password updated."}
