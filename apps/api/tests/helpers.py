from __future__ import annotations

import uuid

from fastapi.testclient import TestClient


def csrf(client: TestClient) -> str:
    return client.cookies.get("ol_csrf") or ""


def post(client: TestClient, path: str, **kwargs):
    headers = dict(kwargs.pop("headers", {}))
    headers["X-CSRF-Token"] = csrf(client)
    return client.post(path, headers=headers, **kwargs)


def patch(client: TestClient, path: str, **kwargs):
    headers = dict(kwargs.pop("headers", {}))
    headers["X-CSRF-Token"] = csrf(client)
    return client.patch(path, headers=headers, **kwargs)


def delete(client: TestClient, path: str, **kwargs):
    headers = dict(kwargs.pop("headers", {}))
    headers["X-CSRF-Token"] = csrf(client)
    return client.delete(path, headers=headers, **kwargs)


def unique_email(prefix: str = "candidate") -> str:
    return f"{prefix}.{uuid.uuid4().hex[:12]}@example.com"


def candidate_payload(**overrides) -> dict:
    payload = {
        "full_name": "Nisha Verma",
        "email": unique_email(),
        "phone": "+91 90000 22222",
        "current_address": "14-2-9, Gokul Nagar\nPatancheru, Telangana 502319",
        "applied_position": "Site Electrical Engineer",
        "department": "Projects",
        "employment_type": "FULL_TIME",
        "proposed_joining_date": "2026-12-20",
        "reporting_manager": "Nekbor Seikh",
        "work_location": "Patancheru, Hyderabad",
        "notes": "Integration test candidate",
    }
    payload.update(overrides)
    return payload


def create_candidate(client: TestClient, **overrides) -> dict:
    response = post(client, "/api/v1/candidates", json=candidate_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def offer_data(**overrides) -> dict:
    data = {
        "employment": {
            "job_title": "Site Electrical Engineer",
            "department": "Projects",
            "employment_type": "FULL_TIME",
            "joining_date": "2026-12-20",
            "work_location": "Patancheru, Hyderabad, Telangana",
            "reporting_manager": "Nekbor Seikh",
            "probation_months": 3,
            "working_days": "Monday to Saturday",
            "working_hours": "9:00 AM to 6:00 PM",
        },
        "compensation": {
            "currency": "INR",
            "annual_ctc": 720000,
            "monthly_gross": 60000,
            "earnings": [
                {"name": "Basic salary", "amount": 30000, "period": "MONTHLY"},
                {"name": "House rent allowance", "amount": 12000, "period": "MONTHLY"},
                {"name": "Conveyance allowance", "amount": 2000, "period": "MONTHLY"},
                {"name": "Special allowance", "amount": 16000, "period": "MONTHLY"},
            ],
            "deductions": [],
            "payment_frequency": "MONTHLY",
            "notes": None,
        },
        "terms": {
            "probation": "The first three months are probation.",
            "leave_policy": "Leave follows company policy and applicable law.",
            "working_hours": "9:00 AM to 6:00 PM, Monday to Saturday.",
            "confidentiality": "Company information must remain confidential.",
            "notice_period": "Notice as stated in company policy or applicable law.",
            "termination": "Employment may be terminated for cause per applicable law.",
            "company_policies": "Follow company policies and site safety rules.",
            "joining_requirements": "Bring identity, address and education documents.",
            "additional_clauses": "",
        },
    }
    data.update(overrides)
    return data


def create_offer(client: TestClient, candidate_id: str, template_id: str | None = None, **overrides) -> dict:
    payload = {
        "candidate_id": candidate_id,
        "template_id": template_id,
        "validity_days": 14,
        "data": offer_data(),
        "internal_notes": "Integration test offer",
    }
    payload.update(overrides)
    response = post(client, "/api/v1/offers", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def move_to_issued(
    hr: TestClient,
    hiring: TestClient,
    offer_id: str,
) -> tuple[dict, str]:
    submitted = post(hr, f"/api/v1/offers/{offer_id}/submit")
    assert submitted.status_code == 200, submitted.text
    approved = post(hiring, f"/api/v1/offers/{offer_id}/approve", json={"comments": "Approved in test"})
    assert approved.status_code == 200, approved.text
    issued = post(hr, f"/api/v1/offers/{offer_id}/issue")
    assert issued.status_code == 200, issued.text
    body = issued.json()
    token = body["secure_link"].rsplit("/", 1)[-1]
    return body["offer"], token


def template_id(client: TestClient) -> str:
    response = client.get("/api/v1/templates")
    assert response.status_code == 200, response.text
    return response.json()[0]["id"]
