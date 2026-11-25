import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.config import settings

password_hasher = PasswordHash.recommended()

ROLE_SUPER_ADMIN = "SUPER_ADMIN"
ROLE_HR_MANAGER = "HR_MANAGER"
ROLE_HIRING_MANAGER = "HIRING_MANAGER"
ALL_ROLES = (ROLE_SUPER_ADMIN, ROLE_HR_MANAGER, ROLE_HIRING_MANAGER)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_hasher.verify(password, password_hash)


def create_access_token(user_id: uuid.UUID, roles: set[str], token_version: int = 1) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(minutes=settings.session_ttl_minutes)
    payload = {
        "sub": str(user_id),
        "roles": sorted(roles),
        "tv": int(token_version or 1),
        "iss": "offerlater",
        "aud": "offerlater-web",
        "iat": datetime.now(UTC),
        "exp": expires_at,
        "jti": secrets.token_hex(16),
    }
    return jwt.encode(payload, settings.secret_key, algorithm="HS256"), expires_at


def decode_access_token(token: str) -> dict:
    return jwt.decode(
        token,
        settings.secret_key,
        algorithms=["HS256"],
        issuer="offerlater",
        audience="offerlater-web",
    )


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def tokens_match(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    return secrets.compare_digest(left, right)


def generate_offer_token() -> tuple[str, str]:
    """Return (raw token, sha256 hash). Only the hash is persisted."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_offer_token(raw)


def hash_offer_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def candidate_offer_url(raw_token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/offer/{raw_token}"


def generate_verification_token() -> tuple[str, str]:
    """Return (raw verification token, sha256 hash). Only the hash is stored."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_offer_token(raw)


def verification_url(raw_token: str) -> str:
    return f"{settings.frontend_url.rstrip('/')}/verify/{raw_token}"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
