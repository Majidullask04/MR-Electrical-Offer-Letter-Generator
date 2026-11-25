from __future__ import annotations

from tests.helpers import create_candidate, create_offer, move_to_issued, post


def test_public_view_records_viewed_and_limits_exposure(hr_client, hiring_client):
    candidate = create_candidate(hr_client, full_name="Public Viewer")
    offer = create_offer(hr_client, candidate["id"])
    issued_offer, token = move_to_issued(hr_client, hiring_client, offer["id"])

    response = hr_client.get(f"/api/v1/public/offers/{token}")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "VIEWED"
    assert body["candidate_name"] == "Public Viewer"
    assert body["reference"] == issued_offer["offer_number"]
    assert body["company"]["udyam_number"] == "UDYAM-TS-25-0046549"
    assert body["compensation"]["annual_ctc"] == 720000
    assert body["has_responded"] is False
    assert body["pdf_available"] is True
    forbidden = {
        "internal_notes",
        "secure_token_hash",
        "data",
        "candidate_email",
        "token_hash",
        "events",
        "approvals",
    }
    assert not forbidden.intersection(body.keys())

    detail = hr_client.get(f"/api/v1/offers/{offer['id']}").json()
    assert detail["status"] == "VIEWED"
    assert detail["viewed_at"] is not None
    assert any(event["event_type"] == "VIEWED" for event in detail["events"])

    pdf = hr_client.get(f"/api/v1/public/offers/{token}/pdf")
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"
    assert pdf.headers["cache-control"] == "private, no-store"

    preview = hr_client.get(f"/api/v1/public/offers/{token}/preview")
    assert preview.status_code == 200
    assert "text/html" in preview.headers["content-type"]
    assert "Public Viewer" in preview.text
    assert "default-src 'none'" in preview.headers["content-security-policy"]

    again = hr_client.get(f"/api/v1/public/offers/{token}")
    assert again.status_code == 200
    assert again.json()["status"] == "VIEWED"


def test_accept_requires_consent_and_is_final(hr_client, hiring_client):
    candidate = create_candidate(hr_client, full_name="Accepting Candidate")
    offer = create_offer(hr_client, candidate["id"])
    _, token = move_to_issued(hr_client, hiring_client, offer["id"])

    no_consent = hr_client.post(
        f"/api/v1/public/offers/{token}/accept",
        json={"consent": False, "typed_name": "Accepting Candidate"},
    )
    assert no_consent.status_code == 422

    accepted = hr_client.post(
        f"/api/v1/public/offers/{token}/accept",
        json={"consent": True, "typed_name": "Accepting Candidate"},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "ACCEPTED"

    detail = hr_client.get(f"/api/v1/offers/{offer['id']}").json()
    assert detail["status"] == "ACCEPTED"
    assert detail["response"] == "ACCEPTED"
    assert detail["accepted_at"] is not None
    assert detail["accepted_at"] == detail["viewed_at"] or detail["viewed_at"] is None
    accept_event = next(event for event in detail["events"] if event["event_type"] == "ACCEPTED")
    assert accept_event["metadata"]["typed_name"] == "Accepting Candidate"
    assert "Not a digital signature certificate" in accept_event["metadata"]["acknowledgement"]

    duplicate = hr_client.post(
        f"/api/v1/public/offers/{token}/accept", json={"consent": True}
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "ALREADY_RESPONDED"

    rejection_after = hr_client.post(
        f"/api/v1/public/offers/{token}/reject", json={"consent": True, "reason": "changed mind"}
    )
    assert rejection_after.status_code == 409

    regenerate = post(hr_client, f"/api/v1/offers/{offer['id']}/link")
    assert regenerate.status_code == 409

    withdrawn = post(
        hr_client,
        f"/api/v1/offers/{offer['id']}/withdraw",
        json={"reason": "Cannot withdraw an accepted offer."},
    )
    assert withdrawn.status_code == 409


def test_reject_records_reason(hr_client, hiring_client):
    candidate = create_candidate(hr_client, full_name="Declining Candidate")
    offer = create_offer(hr_client, candidate["id"])
    _, token = move_to_issued(hr_client, hiring_client, offer["id"])

    rejected = hr_client.post(
        f"/api/v1/public/offers/{token}/reject",
        json={"consent": True, "reason": "Accepted a role closer to home."},
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "REJECTED"

    detail = hr_client.get(f"/api/v1/offers/{offer['id']}").json()
    assert detail["status"] == "REJECTED"
    assert detail["response"] == "REJECTED"
    assert detail["rejection_reason"] == "Accepted a role closer to home."
    assert detail["rejected_at"] is not None

    portal = hr_client.get(f"/api/v1/public/offers/{token}")
    assert portal.status_code == 200
    assert portal.json()["has_responded"] is True
    assert portal.json()["response"] == "REJECTED"


def test_invalid_and_withdrawn_tokens(hr_client, hiring_client):
    for token in ["short", "x" * 44, "not-a-real-token-but-long-enough-1234567890"]:
        response = hr_client.get(f"/api/v1/public/offers/{token}")
        assert response.status_code == 404
        assert response.json()["code"] == "OFFER_NOT_FOUND"

    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"])
    _, token = move_to_issued(hr_client, hiring_client, offer["id"])
    post(
        hr_client,
        f"/api/v1/offers/{offer['id']}/withdraw",
        json={"reason": "Role withdrawn by the company."},
    )
    gone = hr_client.get(f"/api/v1/public/offers/{token}")
    assert gone.status_code == 410
    assert gone.json()["code"] == "OFFER_UNAVAILABLE"
    assert gone.json()["company_name"] == "MR. ELECTRICAL WORKS"

    pdf = hr_client.get(f"/api/v1/public/offers/{token}/pdf")
    assert pdf.status_code == 410


def test_public_endpoints_are_rate_limited_but_need_no_csrf(hr_client, hiring_client):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"])
    _, token = move_to_issued(hr_client, hiring_client, offer["id"])
    response = hr_client.get(f"/api/v1/public/offers/{token}")
    assert response.status_code == 200
    assert "x-request-id" in response.headers
    assert response.headers["x-content-type-options"] == "nosniff"
