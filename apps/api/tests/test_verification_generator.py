from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

from app.models import Offer
from tests.helpers import create_candidate, create_offer, move_to_issued, post


def test_generator_requires_auth_and_permission_for_direct_issuance(client, hr_client, admin_client):
    payload = {
        "full_name": "John Doe",
        "job_title": "Electrical Technician",
        "joining_date": "2026-12-01",
        "work_location": "Hyderabad",
        "issue_immediately": True,
    }

    unauth = client.post("/api/v1/generator/offers", json=payload)
    assert unauth.status_code == 401

    hr_direct = post(hr_client, "/api/v1/generator/offers", json=payload)
    assert hr_direct.status_code == 403
    assert hr_direct.json()["code"] == "APPROVAL_PERMISSION_REQUIRED"

    hr_draft = post(hr_client, "/api/v1/generator/offers", json={**payload, "issue_immediately": False})
    assert hr_draft.status_code == 201, hr_draft.text
    assert hr_draft.json()["offer"]["status"] == "DRAFT"
    assert hr_draft.json()["official_offer_number"] is None

    admin_issued = post(admin_client, "/api/v1/generator/offers", json=payload)
    assert admin_issued.status_code == 201, admin_issued.text
    body = admin_issued.json()
    assert body["offer"]["status"] == "ISSUED"
    assert body["official_offer_number"].startswith("MREW/OL/")
    assert body["pdf_sha256"]
    assert "/verify/" in body["verification_url"]

    pdf = admin_client.get(f"/api/v1/offers/{body['offer']['id']}/pdf", params={"download": "true"})
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"
    assert "John-Doe.pdf" in pdf.headers["content-disposition"]


def test_generator_preview_populates_company_facts(admin_client):
    preview = post(
        admin_client,
        "/api/v1/generator/preview",
        json={
            "full_name": "Preview Candidate",
            "job_title": "Site Engineer",
            "joining_date": "2026-12-01",
            "stipend": 18000,
        },
    )
    assert preview.status_code == 200, preview.text
    html = preview.json()["html"]
    assert "MR. ELECTRICAL WORKS" in html
    assert "Preview Candidate" in html
    assert "Site Engineer" in html
    assert "18,000" in html
    assert "official authenticity verification" in html.lower()


def test_sequential_and_concurrent_official_offer_ids_are_unique(admin_client):
    def issue_one(idx: int) -> str:
        res = post(
            admin_client,
            "/api/v1/generator/offers",
            json={
                "full_name": f"Concurrent Candidate {idx}",
                "job_title": "Electrical Technician",
                "joining_date": "2026-12-05",
                "monthly_salary": 25000,
                "issue_immediately": True,
            },
        )
        assert res.status_code == 201, res.text
        return res.json()["official_offer_number"]

    with ThreadPoolExecutor(max_workers=4) as pool:
        numbers = list(pool.map(issue_one, range(4)))

    assert len(set(numbers)) == 4
    for num in numbers:
        assert num.startswith("MREW/OL/")


def test_verification_lifecycle_valid_accepted_revoked_expired_superseded_and_pdf_hash(
    client, hr_client, hiring_client, admin_client, db_session
):
    # 1. Issued offer with registered email -> VALID via QR + lookup + PDF hash
    issued_res = post(
        admin_client,
        "/api/v1/generator/offers",
        json={
            "full_name": "Verified Candidate",
            "email": "verified.candidate@example.com",
            "phone": "+91 98765 00001",
            "job_title": "Electrical Technician",
            "joining_date": "2026-12-01",
            "annual_ctc": 480000,
            "issue_immediately": True,
        },
    )
    assert issued_res.status_code == 201, issued_res.text
    issued_body = issued_res.json()
    offer_id = issued_body["offer"]["id"]
    official_id = issued_body["official_offer_number"]
    verif_token = issued_body["verification_url"].rstrip("/").split("/")[-1]
    portal_token = issued_body["secure_link"].rstrip("/").split("/")[-1]

    # Candidate accepts the offer: authenticity stays VALID while lifecycle shows ACCEPTED
    acc = client.post(
        f"/api/v1/public/offers/{portal_token}/accept",
        json={"consent": True, "typed_name": "Verified Candidate"},
    )
    assert acc.status_code == 200

    qr_check = client.get(f"/api/v1/public/verify/token/{verif_token}")
    assert qr_check.status_code == 200, qr_check.text
    qr_json = qr_check.json()
    assert qr_json["verdict"] == "VALID"
    assert qr_json["record"]["offer_id"] == official_id
    assert qr_json["record"]["candidate_name"] == "Verified Candidate"
    assert qr_json["record"]["lifecycle_status"] == "ACCEPTED"
    # Confidential data must never appear on public verification response
    serialized = qr_check.text.lower()
    assert "480000" not in serialized
    assert "98765" not in serialized
    assert "verified.candidate@example.com" not in serialized

    # Manual lookup requires second factor (email)
    bad_lookup = client.post(
        "/api/v1/public/verify/lookup",
        json={"offer_id": official_id, "candidate_email": "wrong@example.com"},
    )
    assert bad_lookup.status_code == 200
    assert bad_lookup.json()["verdict"] == "INVALID"

    good_lookup = client.post(
        "/api/v1/public/verify/lookup",
        json={"offer_id": official_id, "candidate_email": "verified.candidate@example.com"},
    )
    assert good_lookup.status_code == 200
    assert good_lookup.json()["verdict"] == "VALID"

    # Unknown Offer ID -> INVALID
    unknown = client.post(
        "/api/v1/public/verify/lookup",
        json={"offer_id": "MREW/OL/2026/999999", "candidate_email": "nobody@example.com"},
    )
    assert unknown.status_code == 200
    assert unknown.json()["verdict"] == "INVALID"
    assert "could not be verified" in unknown.json()["message"]

    # PDF integrity: genuine PDF passes, altered PDF fails
    pdf_resp = admin_client.get(f"/api/v1/offers/{offer_id}/pdf")
    assert pdf_resp.status_code == 200
    good_pdf = client.post(
        "/api/v1/public/verify/pdf",
        data={"token": verif_token},
        files={"file": ("offer.pdf", pdf_resp.content, "application/pdf")},
    )
    assert good_pdf.status_code == 200
    assert good_pdf.json()["verdict"] == "VALID"
    assert good_pdf.json()["pdf_integrity"] == "MATCHED"

    tampered = pdf_resp.content + b"\n%tampered"
    bad_pdf = client.post(
        "/api/v1/public/verify/pdf",
        data={"token": verif_token},
        files={"file": ("tampered.pdf", tampered, "application/pdf")},
    )
    assert bad_pdf.status_code == 200
    assert bad_pdf.json()["verdict"] == "MODIFIED_DOCUMENT"
    assert bad_pdf.json()["pdf_integrity"] == "MODIFIED"

    # 2. Revoked offer -> REVOKED; superseded revision -> SUPERSEDED
    rev_offer_res = post(
        admin_client,
        "/api/v1/generator/offers",
        json={
            "full_name": "Revoke Test",
            "job_title": "Technician",
            "joining_date": "2026-12-10",
            "monthly_salary": 20000,
            "issue_immediately": True,
        },
    )
    rev_id = rev_offer_res.json()["offer"]["id"]
    rev_token = rev_offer_res.json()["verification_url"].rstrip("/").split("/")[-1]
    rev_official_id = rev_offer_res.json()["official_offer_number"]

    # Without email, manual lookup requires name + joining_date
    no_email_lookup = client.post(
        "/api/v1/public/verify/lookup",
        json={
            "offer_id": rev_official_id,
            "candidate_name": "Revoke Test",
            "joining_date": "2026-12-10",
        },
    )
    assert no_email_lookup.json()["verdict"] == "VALID"

    # Non-super-admin (HR) cannot call /revoke
    hr_revoke = post(
        hr_client,
        f"/api/v1/offers/{rev_id}/revoke",
        json={"reason": "Unauthorized HR revoke attempt."},
    )
    assert hr_revoke.status_code == 403

    revoked = post(
        admin_client,
        f"/api/v1/offers/{rev_id}/revoke",
        json={"reason": "Position cancelled by management."},
    )
    assert revoked.status_code == 200

    rev_check = client.get(f"/api/v1/public/verify/token/{rev_token}")
    assert rev_check.json()["verdict"] == "REVOKED"
    assert "revoked" in rev_check.json()["message"].lower()

    # Revise and reissue -> revision 1 becomes SUPERSEDED
    post(hr_client, f"/api/v1/offers/{rev_id}/revise", json={"reason": "New revision"})
    _, _ = move_to_issued(hr_client, hiring_client, rev_id)
    # After reissue, previous offer_verifications row is SUPERSEDED
    sup_check = client.get(f"/api/v1/public/verify/token/{rev_token}")
    assert sup_check.json()["verdict"] == "SUPERSEDED"

    # 3. Expired offer -> EXPIRED
    exp_res = post(
        admin_client,
        "/api/v1/generator/offers",
        json={
            "full_name": "Expired Candidate",
            "job_title": "Technician",
            "joining_date": "2026-12-15",
            "monthly_salary": 22000,
            "issue_immediately": True,
        },
    )
    exp_id = exp_res.json()["offer"]["id"]
    exp_token = exp_res.json()["verification_url"].rstrip("/").split("/")[-1]
    row = db_session.get(Offer, exp_id)
    row.expires_at = datetime.now(UTC) - timedelta(days=2)
    db_session.commit()

    exp_check = client.get(f"/api/v1/public/verify/token/{exp_token}")
    assert exp_check.json()["verdict"] == "EXPIRED"
    assert "validity period" in exp_check.json()["message"].lower()

    # Revising an expired offer into DRAFT must keep Revision 1 EXPIRED (never revert to VALID)
    revise_exp = post(hr_client, f"/api/v1/offers/{exp_id}/revise", json={"reason": "Re-open expired offer"})
    assert revise_exp.status_code == 200
    exp_check_after_revise = client.get(f"/api/v1/public/verify/token/{exp_token}")
    assert exp_check_after_revise.json()["verdict"] == "EXPIRED"
