from __future__ import annotations

from tests.helpers import create_candidate, create_offer, delete, patch, post, unique_email


def test_health_and_root(client):
    root = client.get("/")
    assert root.status_code == 200
    assert root.json()["name"] == "OfferLater"
    for path in ("/health", "/api/v1/health"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.json() == {"status": "ok", "database": "ok"}


def test_dashboard_and_reports(hr_client, hiring_client):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"])
    post(hr_client, f"/api/v1/offers/{offer['id']}/submit")

    dashboard = hr_client.get("/api/v1/reports/dashboard")
    assert dashboard.status_code == 200, dashboard.text
    body = dashboard.json()
    assert body["counts"]["total"] >= 1
    assert body["counts"]["pending_approval"] >= 1
    assert body["pending_approval_count"] >= 1
    assert len(body["monthly"]) == 12
    assert any(item["id"] == offer["id"] for item in body["pending_offers"])

    report = hr_client.get("/api/v1/reports/offers", params={"status": "PENDING_APPROVAL"})
    assert report.status_code == 200
    assert report.json()["total"] >= 1
    assert report.json()["filters"]["status"] == "PENDING_APPROVAL"

    invalid = hr_client.get("/api/v1/reports/offers", params={"status": "NOPE"})
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INVALID_STATUS"

    empty = hr_client.get("/api/v1/reports/offers", params={"date_from": "2099-01-01"})
    assert empty.status_code == 200
    assert empty.json()["total"] == 0

    csv_response = hr_client.get("/api/v1/reports/offers/export", params={"status": "DRAFT"})
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "attachment" in csv_response.headers["content-disposition"]
    assert "Offer reference" in csv_response.content.decode("utf-8-sig")

    assert hiring_client.get("/api/v1/reports/dashboard").status_code == 200


def test_csv_formula_injection_is_neutralised(hr_client):
    candidate = create_candidate(hr_client, full_name="=SUM(A1:A2)")
    create_offer(hr_client, candidate["id"])
    export = hr_client.get("/api/v1/reports/offers/export")
    assert export.status_code == 200
    text = export.content.decode("utf-8-sig")
    assert "'=SUM(A1:A2)" in text


def test_audit_log_rbac_and_outbox(admin_client, hr_client, hiring_client):
    assert hr_client.get("/api/v1/audit-logs").status_code == 403
    assert hiring_client.get("/api/v1/settings/outbox").status_code == 403

    candidate = create_candidate(hr_client)
    create_offer(hr_client, candidate["id"])
    logs = admin_client.get("/api/v1/audit-logs", params={"entity_type": "offer"})
    assert logs.status_code == 200
    assert logs.json()["total"] >= 1
    actions = {row["action"] for row in logs.json()["items"]}
    assert "offer.created" in actions
    actor = next(row for row in logs.json()["items"] if row["action"] == "offer.created")
    assert actor["actor_email"] == "hr@mrelectricalworks.in"

    outbox = admin_client.get("/api/v1/settings/outbox")
    assert outbox.status_code == 200
    assert isinstance(outbox.json(), list)
    if outbox.json():
        email_id = outbox.json()[0]["id"]
        html = admin_client.get(f"/api/v1/settings/outbox/{email_id}/html")
        assert html.status_code == 200
        assert "frame-ancestors" not in html.headers.get("content-security-policy", "").lower()
        assert "default-src 'none'" in html.headers["content-security-policy"]

    summary = admin_client.get("/api/v1/settings/summary")
    assert summary.status_code == 200
    assert summary.json()["offers"] >= 1
    assert summary.json()["environment"] == "test"

    bad_job = post(admin_client, "/api/v1/settings/jobs/run", params={"job": "unknown"})
    assert bad_job.status_code == 422


def test_company_settings_admin_only(admin_client, hr_client):
    current = admin_client.get("/api/v1/company")
    assert current.status_code == 200
    assert current.json()["email"] == "mrelectricalworks02@gmail.com"
    assert current.json()["default_terms"]["probation"]

    assert patch(
        hr_client, "/api/v1/company", json={"phone": "+91 00000 00000"}
    ).status_code == 403

    invalid_color = patch(admin_client, "/api/v1/company", json={"primary_color": "orange"})
    assert invalid_color.status_code == 422

    invalid_terms = patch(
        admin_client, "/api/v1/company", json={"default_terms": {"invented_clause": "text"}}
    )
    assert invalid_terms.status_code == 422
    assert invalid_terms.json()["code"] == "INVALID_TERMS"


def test_company_update_persists_and_is_audited(admin_client):
    updated = patch(
        admin_client,
        "/api/v1/company",
        json={"gst_number": "36ABCDE1234F1Z5", "default_validity_days": 21},
    )
    assert updated.status_code == 200
    assert updated.json()["gst_number"] == "36ABCDE1234F1Z5"
    assert updated.json()["default_validity_days"] == 21

    restore = patch(
        admin_client,
        "/api/v1/company",
        json={"gst_number": None, "default_validity_days": 14},
    )
    assert restore.status_code == 200
    assert restore.json()["gst_number"] is None

    logs = admin_client.get("/api/v1/audit-logs", params={"entity_type": "company_profile"})
    assert any(row["action"] == "company.updated" for row in logs.json()["items"])


def test_template_crud_and_preview_safety(admin_client, hr_client):
    listing = hr_client.get("/api/v1/templates")
    assert listing.status_code == 200
    assert len(listing.json()) >= 1
    template = listing.json()[0]
    assert template["is_default"] is True

    stranger = post(
        admin_client,
        "/api/v1/templates",
        json={"name": f"Unsafe {unique_email('tpl')}", "html_content": "<script>alert(1)</script>" + "x" * 120},
    )
    assert stranger.status_code == 422

    preview = post(
        admin_client,
        "/api/v1/templates/preview",
        json={
            "html_content": (
                "<html><body><h1>Preview</h1><script>alert('x')</script>"
                "<img src='x' onerror='alert(1)'>" + "x" * 100 + "</body></html>"
            )
        },
    )
    assert preview.status_code == 200
    html = preview.json()["html"]
    assert "<script" not in html.lower()
    assert "onerror" not in html.lower()
    assert "Preview" in html

    name = f"Copy template {unique_email('tpl')}"
    created = post(
        admin_client,
        "/api/v1/templates",
        json={
            "name": name,
            "description": "Integration template",
            "html_content": (
                "<html><body><h1>{{ company_name }}</h1><p>{{ candidate_name }}</p>"
                + "<!-- template padding for the 100 character minimum -->" * 3
                + "</body></html>"
            ),
            "is_active": True,
        },
    )
    assert created.status_code == 201, created.text
    template_id = created.json()["id"]

    duplicate = post(admin_client, f"/api/v1/templates/{template_id}/duplicate")
    assert duplicate.status_code == 201
    duplicate_id = duplicate.json()["id"]
    assert "copy" in duplicate.json()["name"].lower()

    default = post(admin_client, f"/api/v1/templates/{template_id}/default")
    assert default.status_code == 200
    assert default.json()["is_default"] is True
    reset = post(admin_client, f"/api/v1/templates/{template['id']}/default")
    assert reset.status_code == 200

    assert delete(admin_client, f"/api/v1/templates/{duplicate_id}").status_code == 200
    assert delete(admin_client, f"/api/v1/templates/{template_id}").status_code == 200

    assert delete(admin_client, f"/api/v1/templates/{template['id']}").status_code == 409

    assert post(
        hr_client,
        "/api/v1/templates",
        json={"name": "HR template", "html_content": "<html>" + "x" * 120 + "</html>"},
    ).status_code == 403


def test_content_blocks_crud(admin_client, hr_client):
    listing = hr_client.get("/api/v1/templates/blocks")
    assert listing.status_code == 200
    assert any(block["key"] == "leave_policy" for block in listing.json())

    created = post(
        admin_client,
        "/api/v1/templates/blocks",
        json={
            "key": "test_block",
            "name": "Test block",
            "content": "Test content for the block.",
            "description": "Integration test",
        },
    )
    assert created.status_code == 201, created.text
    block_id = created.json()["id"]

    duplicate = post(
        admin_client,
        "/api/v1/templates/blocks",
        json={"key": "test_block", "name": "Test block", "content": "again"},
    )
    assert duplicate.status_code == 409

    updated = patch(
        admin_client,
        f"/api/v1/templates/blocks/{block_id}",
        json={"content": "Updated block content."},
    )
    assert updated.status_code == 200
    assert updated.json()["content"] == "Updated block content."

    assert patch(
        hr_client, f"/api/v1/templates/blocks/{block_id}", json={"content": "nope"}
    ).status_code == 403

    assert delete(admin_client, f"/api/v1/templates/blocks/{block_id}").status_code == 200
