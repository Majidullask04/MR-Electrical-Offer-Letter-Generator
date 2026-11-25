from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from app.models import Offer, OfferStatus
from tests.helpers import (
    create_candidate,
    create_offer,
    csrf,
    delete,
    move_to_issued,
    offer_data,
    patch,
    post,
    template_id,
)


def test_offer_preview_create_and_validation(hr_client, seeded_database):
    candidate = create_candidate(hr_client)
    template = template_id(hr_client)
    preview = post(
        hr_client,
        "/api/v1/offers/preview",
        json={
            "candidate_id": candidate["id"],
            "template_id": template,
            "validity_days": 14,
            "data": offer_data(),
        },
    )
    assert preview.status_code == 200, preview.text
    html = preview.json()["html"]
    assert "Offer of employment" in html
    assert candidate["full_name"] in html
    assert "MR. ELECTRICAL" in html
    assert "7,20,000" in html

    offer = create_offer(hr_client, candidate["id"], template)
    assert offer["status"] == "DRAFT"
    assert offer["offer_number"].startswith("MEW-OL-")
    assert offer["candidate_name"] == candidate["full_name"]
    assert offer["annual_ctc"] == 720000

    invalid = offer_data()
    invalid["compensation"]["annual_ctc"] = 0
    invalid["compensation"]["monthly_gross"] = 0
    # Explicitly disable training policy so zero salary is still rejected (Section 5 sanity_check
    # now allows zero base salary when training_policy.enabled=True — disable it here to keep the
    # original assertion: zero salary without any compensation source → 422).
    invalid["training_policy"] = {"enabled": False, "training_period_months": 1,
                                   "training_monthly_salary_inr": 14000, "food_provided": False,
                                   "site_accommodation_free": True, "post_training_salary_min_inr": 18000,
                                   "post_training_salary_max_inr": 25000, "post_training_duration_months": 6,
                                   "first_increment_after_months": 6, "first_increment_max_percent": 30,
                                   "increment_criteria": "Behaviour and performance"}
    rejected = post(
        hr_client,
        "/api/v1/offers",
        json={"candidate_id": candidate["id"], "template_id": template, "data": invalid},
    )
    assert rejected.status_code == 422


def test_full_approval_and_issuance_workflow(hr_client, hiring_client):
    candidate = create_candidate(hr_client, full_name="Workflow Candidate")
    offer = create_offer(hr_client, candidate["id"])
    offer_id = offer["id"]

    early = post(hr_client, f"/api/v1/offers/{offer_id}/issue")
    assert early.status_code == 409
    assert early.json()["code"] == "NOT_APPROVED"

    submitted = post(hr_client, f"/api/v1/offers/{offer_id}/submit")
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "PENDING_APPROVAL"

    hr_approve = post(hr_client, f"/api/v1/offers/{offer_id}/approve", json={"comments": "self"})
    assert hr_approve.status_code == 403

    returned = post(
        hiring_client,
        f"/api/v1/offers/{offer_id}/return",
        json={"comments": "Add the joining bonus note before approval."},
    )
    assert returned.status_code == 200
    assert returned.json()["status"] == "DRAFT"
    assert returned.json()["approvals"][-1]["status"] == "RETURNED"

    post(hr_client, f"/api/v1/offers/{offer_id}/submit")
    approved = post(
        hiring_client,
        f"/api/v1/offers/{offer_id}/approve",
        json={"comments": "Terms reviewed."},
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"
    assert approved.json()["approved_by_name"] == "Hiring Manager"

    issued = post(hr_client, f"/api/v1/offers/{offer_id}/issue")
    assert issued.status_code == 200, issued.text
    body = issued.json()
    assert body["offer"]["status"] == "ISSUED"
    assert "/offer/" in body["secure_link"]
    assert body["email_status"] in {"logged", "sent"}

    detail = hr_client.get(f"/api/v1/offers/{offer_id}").json()
    event_types = [event["event_type"] for event in detail["events"]]
    assert "SUBMITTED" in event_types
    assert "RETURNED" in event_types
    assert "APPROVED" in event_types
    assert "ISSUED" in event_types


def test_issued_offer_is_immutable_and_pdf_is_private(hr_client, hiring_client, db_session):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"])
    issued_offer, token = move_to_issued(hr_client, hiring_client, offer["id"])

    locked = patch(hr_client, f"/api/v1/offers/{offer['id']}", json={"validity_days": 30})
    assert locked.status_code == 409
    assert locked.json()["code"] == "OFFER_NOT_EDITABLE"

    pdf = hr_client.get(f"/api/v1/offers/{offer['id']}/pdf")
    assert pdf.status_code == 200
    assert pdf.content[:4] == b"%PDF"
    assert "attachment" not in pdf.headers["content-disposition"]

    revision_id = issued_offer["revisions"][0]["id"]
    revision_pdf = hr_client.get(f"/api/v1/offers/{offer['id']}/revisions/{revision_id}/pdf")
    assert revision_pdf.status_code == 200
    assert revision_pdf.content[:4] == b"%PDF"
    assert "attachment" in revision_pdf.headers["content-disposition"]

    preview = hr_client.get(f"/api/v1/offers/{offer['id']}/preview")
    assert preview.status_code == 200
    assert "default-src 'none'" in preview.headers["content-security-policy"]
    assert candidate["full_name"] in preview.text
    assert issued_offer["offer_number"] in preview.text

    row = db_session.get(Offer, offer["id"])
    assert row.secure_token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert token not in row.secure_token_hash

    row.current_revision.pdf_path = "offers/../../etc/passwd"
    db_session.commit()
    blocked = hr_client.get(f"/api/v1/offers/{offer['id']}/pdf")
    assert blocked.status_code == 200
    assert blocked.content[:4] == b"%PDF"
    db_session.refresh(row.current_revision)
    assert ".." not in (row.current_revision.pdf_path or "")


def test_withdraw_revise_and_reissue_keep_history(hr_client, hiring_client):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"], validity_days=7)
    _, old_token = move_to_issued(hr_client, hiring_client, offer["id"])

    withdrawn = post(
        hr_client,
        f"/api/v1/offers/{offer['id']}/withdraw",
        json={"reason": "Compensation band was corrected."},
    )
    assert withdrawn.status_code == 200
    assert withdrawn.json()["status"] == "WITHDRAWN"

    revised = post(
        hr_client,
        f"/api/v1/offers/{offer['id']}/revise",
        json={"reason": "Issue revision two."},
    )
    assert revised.status_code == 200
    assert revised.json()["status"] == "DRAFT"
    assert revised.json()["revision_number"] == 2

    changed = offer_data()
    changed["compensation"]["annual_ctc"] = 780000
    changed["compensation"]["monthly_gross"] = 65000
    edited = patch(hr_client, f"/api/v1/offers/{offer['id']}", json={"data": changed})
    assert edited.status_code == 200

    reissued, new_token = move_to_issued(hr_client, hiring_client, offer["id"])
    assert reissued["status"] == "REISSUED"
    assert new_token != old_token
    assert len(reissued["revisions"]) == 2
    assert reissued["revisions"][0]["revision_number"] == 1
    assert reissued["revisions"][1]["revision_number"] == 2
    assert reissued["annual_ctc"] == 780000

    first_revision_pdf = hr_client.get(
        f"/api/v1/offers/{offer['id']}/revisions/{reissued['revisions'][0]['id']}/pdf"
    )
    assert first_revision_pdf.status_code == 200
    assert first_revision_pdf.content[:4] == b"%PDF"

    assert hr_client.get(f"/api/v1/public/offers/{old_token}").status_code == 404
    assert hr_client.get(f"/api/v1/public/offers/{new_token}").status_code == 200


def test_regenerated_link_revokes_previous_token(hr_client, hiring_client):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"])
    _, first_token = move_to_issued(hr_client, hiring_client, offer["id"])

    regenerated = post(hr_client, f"/api/v1/offers/{offer['id']}/link")
    assert regenerated.status_code == 200
    second_token = regenerated.json()["secure_link"].rsplit("/", 1)[-1]
    assert first_token != second_token
    assert hr_client.get(f"/api/v1/public/offers/{first_token}").status_code == 404
    assert hr_client.get(f"/api/v1/public/offers/{second_token}").status_code == 200


def test_expiry_job_closes_offer(hr_client, hiring_client, admin_client, db_session):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"])
    _, token = move_to_issued(hr_client, hiring_client, offer["id"])

    row = db_session.get(Offer, offer["id"])
    row.expires_at = datetime.now(UTC) - timedelta(days=1)
    db_session.commit()

    job = post(admin_client, "/api/v1/settings/jobs/run", params={"job": "expire"})
    assert job.status_code == 200
    detail = hr_client.get(f"/api/v1/offers/{offer['id']}").json()
    assert detail["status"] == "EXPIRED"
    public = hr_client.get(f"/api/v1/public/offers/{token}")
    assert public.status_code == 410
    assert public.json()["code"] in {"OFFER_EXPIRED", "OFFER_UNAVAILABLE"}

    revise = post(hr_client, f"/api/v1/offers/{offer['id']}/revise", json={"reason": "Retry"})
    assert revise.status_code == 200
    assert revise.json()["revision_number"] == 2


def test_offer_filters_and_pagination(hr_client):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"])

    filtered = hr_client.get(
        "/api/v1/offers", params={"candidate_id": candidate["id"], "status": "DRAFT"}
    )
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["id"] == offer["id"]

    invalid = hr_client.get("/api/v1/offers", params={"status": "BANANA"})
    assert invalid.status_code == 422
    assert invalid.json()["code"] == "INVALID_STATUS"

    by_number = hr_client.get("/api/v1/offers", params={"q": offer["offer_number"]})
    assert by_number.status_code == 200
    assert by_number.json()["total"] == 1


def test_candidate_with_offer_is_archived_not_deleted(hr_client):
    candidate = create_candidate(hr_client)
    create_offer(hr_client, candidate["id"])
    response = delete(hr_client, f"/api/v1/candidates/{candidate['id']}")
    assert response.status_code == 200
    assert "archived" in response.json()["message"].lower()
    still_there = hr_client.get(f"/api/v1/candidates/{candidate['id']}")
    assert still_there.status_code == 200
    assert still_there.json()["is_active"] is False


def test_reminder_job_is_idempotent(hr_client, hiring_client, admin_client):
    candidate = create_candidate(hr_client)
    offer = create_offer(hr_client, candidate["id"], validity_days=2)
    move_to_issued(hr_client, hiring_client, offer["id"])
    first = post(admin_client, "/api/v1/settings/jobs/run", params={"job": "remind"})
    assert first.status_code == 200
    second = post(admin_client, "/api/v1/settings/jobs/run", params={"job": "remind"})
    assert second.status_code == 200
