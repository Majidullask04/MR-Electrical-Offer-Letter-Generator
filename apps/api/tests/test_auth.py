from __future__ import annotations

from tests.helpers import csrf, patch, post, unique_email


def test_login_sets_hardened_cookies(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "hr@mrelectricalworks.in", "password": "HrManager!2026"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["primary_role"] == "HR_MANAGER"
    assert "HR_MANAGER" in body["roles"]
    cookies = response.headers.get_list("set-cookie")
    session_cookie = next(item for item in cookies if item.startswith("ol_session="))
    csrf_cookie = next(item for item in cookies if item.startswith("ol_csrf="))
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "HttpOnly" not in csrf_cookie
    assert response.headers["x-request-id"]


def test_wrong_password_and_unknown_email_are_identical(client):
    wrong = client.post(
        "/api/v1/auth/login",
        json={"email": "hr@mrelectricalworks.in", "password": "wrong-password"},
    )
    unknown = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password"},
    )
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json()["code"] == unknown.json()["code"] == "INVALID_CREDENTIALS"


def test_me_requires_session_and_returns_user(client, hr_client):
    assert client.get("/api/v1/auth/me").status_code == 401
    response = hr_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "hr@mrelectricalworks.in"


def test_csrf_required_for_cookie_authenticated_writes(hr_client):
    payload = {
        "full_name": "CSRF Probe",
        "email": unique_email("csrf"),
        "phone": "+91 90000 33333",
        "applied_position": "Site Supervisor",
    }
    without = hr_client.post("/api/v1/candidates", json=payload)
    assert without.status_code == 403
    assert without.json()["code"] == "CSRF_FAILED"

    wrong_header = hr_client.post(
        "/api/v1/candidates",
        json=payload,
        headers={"X-CSRF-Token": "not-the-cookie"},
    )
    assert wrong_header.status_code == 403

    with_header = post(hr_client, "/api/v1/candidates", json=payload)
    assert with_header.status_code == 201


def test_login_exempt_from_csrf(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@mrelectricalworks.in", "password": "OfferLater!2026"},
    )
    assert response.status_code == 200


def test_validation_errors_are_structured(client):
    response = client.post("/api/v1/auth/login", json={"email": "not-an-email", "password": ""})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "VALIDATION_ERROR"
    assert body["fields"]


def test_role_endpoint_is_super_admin_only(admin_client, hr_client):
    assert hr_client.get("/api/v1/auth/roles").status_code == 403
    response = admin_client.get("/api/v1/auth/roles")
    assert response.status_code == 200
    assert {role["key"] for role in response.json()} == {
        "SUPER_ADMIN",
        "HR_MANAGER",
        "HIRING_MANAGER",
    }


def test_change_password_and_reactivation_flow(admin_client):
    email = unique_email("password")
    created = post(
        admin_client,
        "/api/v1/users",
        json={
            "full_name": "Password Tester",
            "email": email,
            "password": "InitialPass!2026",
            "role_key": "HR_MANAGER",
        },
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]

    from fastapi.testclient import TestClient

    from app.main import app

    with TestClient(app, raise_server_exceptions=False) as user_client:
        login = user_client.post(
            "/api/v1/auth/login", json={"email": email, "password": "InitialPass!2026"}
        )
        assert login.status_code == 200
        wrong = post(
            user_client,
            "/api/v1/auth/change-password",
            json={"current_password": "nope", "new_password": "ChangedPass!2026"},
        )
        assert wrong.status_code == 400
        changed = post(
            user_client,
            "/api/v1/auth/change-password",
            json={"current_password": "InitialPass!2026", "new_password": "ChangedPass!2026"},
        )
        assert changed.status_code == 200
        assert csrf(user_client)

    with TestClient(app, raise_server_exceptions=False) as user_client:
        old_login = user_client.post(
            "/api/v1/auth/login", json={"email": email, "password": "InitialPass!2026"}
        )
        assert old_login.status_code == 401
        new_login = user_client.post(
            "/api/v1/auth/login", json={"email": email, "password": "ChangedPass!2026"}
        )
        assert new_login.status_code == 200

    deactivated = patch(admin_client, f"/api/v1/users/{user_id}", json={"is_active": False})
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    with TestClient(app, raise_server_exceptions=False) as user_client:
        denied = user_client.post(
            "/api/v1/auth/login", json={"email": email, "password": "ChangedPass!2026"}
        )
        assert denied.status_code == 403


def test_last_super_admin_protections(admin_client):
    me = admin_client.get("/api/v1/auth/me").json()
    self_deactivate = patch(admin_client, f"/api/v1/users/{me['id']}", json={"is_active": False})
    assert self_deactivate.status_code == 409
    role_change = patch(
        admin_client, f"/api/v1/users/{me['id']}", json={"role_key": "HR_MANAGER"}
    )
    assert role_change.status_code == 409
    assert role_change.json()["code"] == "LAST_SUPER_ADMIN"


def test_logout_clears_session(hr_client):
    response = post(hr_client, "/api/v1/auth/logout")
    assert response.status_code == 200
    assert hr_client.get("/api/v1/auth/me").status_code == 401
