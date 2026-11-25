from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from sqlalchemy import select

from app.config import Settings, settings
from app.deps import client_ip
from app.middleware import BodySizeLimitMiddleware, MAX_BODY_BYTES
from app.models import Offer, OfferStatus
from app.services.storage import (
    LocalStorageBackend,
    get_storage_backend,
    read_pdf,
    reset_storage_backend,
    save_pdf,
)
from tests.helpers import create_candidate, create_offer, move_to_issued, patch, post


# ---------------------------------------------------------------------------
# 1. Production config guard
# ---------------------------------------------------------------------------

def _production_env(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "super-secure-production-secret-key-32chars")
    monkeypatch.setenv("SEED_ADMIN_PASSWORD", "Strong!Admin#2026-NotDefault")
    monkeypatch.setenv("EMAIL_PROVIDER", "smtp")


def test_production_rejects_default_secret_key(monkeypatch):
    _production_env(monkeypatch)
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValueError, match="secret_key"):
        Settings()


def test_production_rejects_short_secret_key(monkeypatch):
    _production_env(monkeypatch)
    monkeypatch.setenv("SECRET_KEY", "short")
    with pytest.raises(ValueError, match="secret_key"):
        Settings()


def test_production_rejects_default_seed_admin_password(monkeypatch):
    _production_env(monkeypatch)
    monkeypatch.delenv("SEED_ADMIN_PASSWORD", raising=False)
    with pytest.raises(ValueError, match="seed_admin_password"):
        Settings()


def test_production_rejects_console_email_provider(monkeypatch):
    _production_env(monkeypatch)
    monkeypatch.setenv("EMAIL_PROVIDER", "console")
    with pytest.raises(ValueError, match="email_provider"):
        Settings()


def test_production_allows_hardened_config(monkeypatch):
    _production_env(monkeypatch)
    cfg = Settings()
    assert cfg.is_production


# ---------------------------------------------------------------------------
# 2. JWT token_version revocation
# ---------------------------------------------------------------------------

def _login_fresh(email: str, password: str):
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return client


def _create_staff(admin_client, email: str, role: str = "HR_MANAGER") -> tuple[str, str]:
    password = "StrongPassword!123"
    response = post(
        admin_client,
        "/api/v1/users",
        json={
            "full_name": "Token Tester",
            "email": email,
            "password": password,
            "role_key": role,
        },
    )
    assert response.status_code == 201, response.text
    return email, password


def test_logout_invalidates_previous_token(admin_client, db_session):
    from app.models import User

    email, password = _create_staff(admin_client, f"logout.{uuid.uuid4().hex[:8]}@example.com")
    client = _login_fresh(email, password)
    old_token = client.cookies.get(settings.session_cookie)
    assert old_token
    tv_before = jwt.decode(
        old_token, settings.secret_key, algorithms=["HS256"], options={"verify_exp": False}
    )["tv"]

    response = post(client, "/api/v1/auth/logout")
    assert response.status_code == 200, response.text

    # The stored token_version must have increased.
    db_session.expire_all()
    user = db_session.scalars(select(User).where(User.email == email)).one()
    assert user.token_version == int(tv_before) + 1

    # Re-apply the stolen (pre-logout) token; it must now be rejected.
    client.cookies.set(settings.session_cookie, old_token)
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401
    assert me.json()["code"] == "SESSION_REVOKED"


def test_change_password_invalidates_previous_token(admin_client):
    email, password = _create_staff(admin_client, f"pw.{uuid.uuid4().hex[:8]}@example.com")
    client = _login_fresh(email, password)
    old_token = client.cookies.get(settings.session_cookie)

    response = post(
        client,
        "/api/v1/auth/change-password",
        json={"current_password": password, "new_password": "AnotherStrong!4567"},
    )
    assert response.status_code == 200, response.text

    client.cookies.set(settings.session_cookie, old_token)
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401


def test_role_change_invalidates_target_users_token(admin_client):
    email, password = _create_staff(admin_client, f"role.{uuid.uuid4().hex[:8]}@example.com")
    client = _login_fresh(email, password)
    old_token = client.cookies.get(settings.session_cookie)

    # Find the user id and change the role as super admin.
    listing = admin_client.get("/api/v1/users")
    target = next(u for u in listing.json() if u["email"] == email)
    response = patch(
        admin_client,
        f"/api/v1/users/{target['id']}",
        json={"role_key": "HIRING_MANAGER"},
    )
    assert response.status_code == 200, response.text

    client.cookies.set(settings.session_cookie, old_token)
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401


def test_malformed_jwt_sub_returns_401(admin_client):
    from fastapi.testclient import TestClient

    from app.main import app

    now = datetime.now(UTC)
    token = jwt.encode(
        {
            "sub": "not-a-uuid",
            "roles": [],
            "iss": "offerlater",
            "aud": "offerlater-web",
            "iat": now,
            "exp": now + timedelta(minutes=30),
            "tv": 1,
        },
        settings.secret_key,
        algorithm="HS256",
    )
    client = TestClient(app, raise_server_exceptions=False)
    client.cookies.set(settings.session_cookie, token)
    me = client.get("/api/v1/auth/me")
    assert me.status_code == 401
    assert me.json()["code"] == "SESSION_EXPIRED"


# ---------------------------------------------------------------------------
# 3. Trusted proxy IP extraction
# ---------------------------------------------------------------------------

def _request(headers: dict[str, str], client_host: str = "10.0.0.5"):
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 1234),
        "query_string": b"",
    }
    return Request(scope)


def test_client_ip_skips_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_count", 1)
    request = _request({"x-forwarded-for": "203.0.113.9, 10.0.0.1"})
    assert client_ip(request) == "203.0.113.9"


def test_client_ip_ignores_spoofed_leftmost(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_count", 2)
    request = _request({"x-forwarded-for": "6.6.6.6, 203.0.113.9, 10.0.0.1"})
    # Two trusted hops occupy the rightmost slots; the genuine client is the outermost.
    assert client_ip(request) == "203.0.113.9"


def test_client_ip_falls_back_to_socket_host(monkeypatch):
    monkeypatch.setattr(settings, "trusted_proxy_count", 0)
    request = _request({"x-forwarded-for": "203.0.113.9, 10.0.0.1"})
    assert client_ip(request) == "10.0.0.5"


# ---------------------------------------------------------------------------
# 4. Body size limit middleware (Content-Length + chunked)
# ---------------------------------------------------------------------------

def _body_route_app():
    from starlette.applications import Starlette
    from starlette.responses import JSONResponse
    from starlette.routing import Route

    app = Starlette(routes=[Route("/echo", endpoint=lambda r: JSONResponse({"ok": True}), methods=["POST"])])
    app.add_middleware(BodySizeLimitMiddleware)
    return app


def test_content_length_over_limit_returns_413():
    from fastapi.testclient import TestClient

    with TestClient(_body_route_app(), raise_server_exceptions=False) as client:
        response = client.post("/echo", content=b"x" * (MAX_BODY_BYTES + 1))
        assert response.status_code == 413


def test_chunked_body_over_limit_returns_413():
    from starlette.requests import Request
    from starlette.responses import JSONResponse

    async def receive():
        return {"type": "http.request", "body": b"x" * (MAX_BODY_BYTES + 1), "more_body": False}

    async def call_next(request):
        # Consume the streamed body the way a real endpoint would.
        while True:
            message = await request.receive()
            if not message.get("more_body"):
                break
        return JSONResponse({"ok": True})

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/echo",
        "headers": [],
        "query_string": b"",
        "client": ("1.2.3.4", 1),
    }
    request = Request(scope)
    request._receive = receive

    middleware = BodySizeLimitMiddleware(lambda r: None)
    result = asyncio.run(middleware.dispatch(request, call_next))
    assert result.status_code == 413


# ---------------------------------------------------------------------------
# 5. Logout CSRF enforcement
# ---------------------------------------------------------------------------

def test_logout_requires_csrf_token(admin_client):
    response = admin_client.post("/api/v1/auth/logout")
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# 6. Escaped ILIKE + GET /offers non-mutation
# ---------------------------------------------------------------------------

def test_candidate_search_escapes_wildcards(admin_client):
    candidate1 = create_candidate(admin_client, full_name="John_Doe")
    candidate2 = create_candidate(admin_client, full_name="JohnDoe")

    response = admin_client.get("/api/v1/candidates", params={"q": "John_Doe"})
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()["items"]]
    assert candidate1["id"] in ids
    assert candidate2["id"] not in ids


def test_get_offers_does_not_mutate_expired(admin_client, hr_client, hiring_client, db_session):
    candidate = create_candidate(admin_client)
    offer = create_offer(admin_client, candidate["id"])
    offer_id = offer["id"]
    move_to_issued(hr_client, hiring_client, offer_id)

    row = db_session.get(Offer, uuid.UUID(offer_id))
    row.status = OfferStatus.ISSUED
    row.expires_at = datetime.now(UTC) - timedelta(hours=1)
    db_session.commit()

    response = admin_client.get("/api/v1/offers")
    assert response.status_code == 200
    item = next(x for x in response.json()["items"] if x["id"] == offer_id)
    assert item["effective_status"] == "EXPIRED"

    db_session.expire_all()
    row = db_session.get(Offer, uuid.UUID(offer_id))
    assert row.status == OfferStatus.ISSUED  # storage row untouched


# ---------------------------------------------------------------------------
# 7. Storage backend selection + local safe path
# ---------------------------------------------------------------------------

def test_storage_backend_defaults_to_local(monkeypatch):
    reset_storage_backend()
    assert get_storage_backend().name == "local"
    assert isinstance(get_storage_backend(), LocalStorageBackend)
    reset_storage_backend()


def test_local_storage_preserves_safe_path():
    reset_storage_backend()
    offer_id = uuid.uuid4()
    relative = save_pdf(offer_id, 1, b"%PDF-localtest")
    assert read_pdf(relative) == b"%PDF-localtest"
    with pytest.raises(Exception):
        read_pdf("../../etc/passwd")
    reset_storage_backend()
