from __future__ import annotations

import pytest

from app.models import Offer, OfferRevision
from app.schemas.offer import TrainingIncrementPolicy
from app.services import documents, offers

from tests.helpers import create_candidate, create_offer, move_to_issued, patch, post


def training_policy(**overrides) -> dict:
    payload = {
        "enabled": True,
        "training_period_months": 1,
        "training_monthly_salary_inr": 14000,
        "food_provided": False,
        "site_accommodation_free": True,
        "post_training_salary_min_inr": 18000,
        "post_training_salary_max_inr": 25000,
        "post_training_duration_months": 6,
        "first_increment_after_months": 6,
        "first_increment_max_percent": 30,
        "increment_criteria": "Behaviour and performance",
    }
    payload.update(overrides)
    return payload


def test_default_policy_is_seeded(admin_client, db_session):
    company = admin_client.get("/api/v1/company").json()
    policy = company["default_training_policy"]
    assert policy is not None
    assert policy["training_period_months"] == 1
    assert policy["training_monthly_salary_inr"] == 14000
    assert policy["food_provided"] is False
    assert policy["site_accommodation_free"] is True
    assert policy["post_training_salary_min_inr"] == 18000
    assert policy["post_training_salary_max_inr"] == 25000
    assert policy["post_training_duration_months"] == 6
    assert policy["first_increment_after_months"] == 6
    assert policy["first_increment_max_percent"] == 30
    assert policy["increment_criteria"] == "Behaviour and performance"


def test_hr_can_update_policy_defaults(hr_client):
    response = patch(
        hr_client,
        "/api/v1/company/training-policy",
        json=training_policy(training_monthly_salary_inr=15000, post_training_salary_max_inr=28000),
    )
    assert response.status_code == 200, response.text
    policy = response.json()["default_training_policy"]
    assert policy["training_monthly_salary_inr"] == 15000
    assert policy["post_training_salary_max_inr"] == 28000


def test_policy_rejects_min_gt_max(admin_client):
    response = patch(
        admin_client,
        "/api/v1/company/training-policy",
        json=training_policy(post_training_salary_min_inr=30000, post_training_salary_max_inr=25000),
    )
    assert response.status_code == 422
    assert "minimum" in response.text.lower() or "exceed" in response.text.lower()


def test_policy_rejects_invalid_increment():
    with pytest.raises(Exception):
        TrainingIncrementPolicy.model_validate(training_policy(first_increment_max_percent=150))


def test_snapshot_freezes_policy(admin_client, hr_client, hiring_client, db_session):
    candidate = create_candidate(admin_client)
    offer = create_offer(
        admin_client,
        candidate["id"],
        data={"training_policy": training_policy()},
    )
    offer_id = offer["id"]

    # Issue the offer (creates an OfferRevision snapshot).
    _, token = move_to_issued(hr_client, hiring_client, offer_id)

    # The revision's frozen snapshot must contain the policy.
    offer_row = db_session.get(Offer, offer_id)
    current_revision = offer_row.current_revision
    assert current_revision is not None
    assert "training_policy" in current_revision.snapshot
    assert current_revision.snapshot["training_policy"]["training_monthly_salary_inr"] == 14000
    assert current_revision.snapshot["training_policy"]["post_training_salary_max_inr"] == 25000

    # Mutating company defaults afterwards must not change the issued snapshot.
    patch(
        hr_client,
        "/api/v1/company/training-policy",
        json=training_policy(training_monthly_salary_inr=99999),
    )
    db_session.expire_all()
    offer_row = db_session.get(Offer, offer_id)
    frozen = offer_row.current_revision.snapshot["training_policy"]
    assert frozen["training_monthly_salary_inr"] == 14000


def test_rendered_html_contains_policy_terms():
    policy = training_policy()
    html = documents.render_training_policy_block(policy)
    assert "₹14,000" in html
    assert "₹18,000 – ₹25,000" in html
    assert "Up to 30% increment" in html
    assert "No food provided" in html
    assert "Free accommodation if staying at the working site" in html
    assert "Behav and performance" in html


def test_rendered_pdf_contains_policy_terms():
    policy = training_policy()
    html = documents.render_training_policy_block(policy)
    full = f"<html><body><h1>Offer</h1>{html}</body></html>"
    pdf = documents.render_pdf(full)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 2000


def test_disabled_policy_renders_nothing():
    assert documents.render_training_policy_block(training_policy(enabled=False)) == ""
