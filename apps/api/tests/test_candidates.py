from __future__ import annotations

from tests.helpers import create_candidate, delete, patch, post, unique_email


def test_candidate_crud_and_duplicate_guard(hr_client):
    email = unique_email("candidate")
    created = create_candidate(hr_client, email=email, full_name="Ananya Rao")
    candidate_id = created["id"]
    assert created["email"] == email
    assert created["employment_type"] == "FULL_TIME"

    duplicate = post(
        hr_client,
        "/api/v1/candidates",
        json={
            "full_name": "Someone Else",
            "email": email,
            "phone": "+91 90000 44444",
            "applied_position": "Site Supervisor",
        },
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "CANDIDATE_EXISTS"
    assert duplicate.json()["candidate_id"] == candidate_id

    fetched = hr_client.get(f"/api/v1/candidates/{candidate_id}")
    assert fetched.status_code == 200
    assert fetched.json()["full_name"] == "Ananya Rao"

    updated = patch(
        hr_client,
        f"/api/v1/candidates/{candidate_id}",
        json={"full_name": "Ananya R. Rao", "department": "Design"},
    )
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Ananya R. Rao"
    assert updated.json()["department"] == "Design"


def test_candidate_search_and_pagination(hr_client):
    marker = unique_email("search").split("@")[0]
    create_candidate(hr_client, full_name=f"Searchable {marker}", email=f"{marker}@example.com")
    response = hr_client.get("/api/v1/candidates", params={"q": marker, "page": 1, "page_size": 5})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["full_name"] == f"Searchable {marker}"
    assert body["pages"] == 1

    bad_page = hr_client.get("/api/v1/candidates", params={"page_size": 500})
    assert bad_page.status_code == 422


def test_candidate_without_offers_is_deleted(hr_client):
    created = create_candidate(hr_client)
    response = delete(hr_client, f"/api/v1/candidates/{created['id']}")
    assert response.status_code == 200
    assert "deleted" in response.json()["message"].lower()
    assert hr_client.get(f"/api/v1/candidates/{created['id']}").status_code == 404


def test_positions_are_seeded_and_creatable(hr_client):
    response = hr_client.get("/api/v1/candidates/meta/positions")
    assert response.status_code == 200
    titles = {position["title"] for position in response.json()}
    assert "Site Electrical Engineer" in titles
    assert "Safety Officer" in titles

    created = post(
        hr_client,
        "/api/v1/candidates/meta/positions",
        json={"title": "Testing Technician", "department": "Quality"},
    )
    assert created.status_code == 201
    assert created.json()["title"] == "Testing Technician"

    duplicate = post(
        hr_client,
        "/api/v1/candidates/meta/positions",
        json={"title": "Testing Technician", "department": "Quality"},
    )
    assert duplicate.status_code == 201
    assert duplicate.json()["id"] == created.json()["id"]


def test_hiring_manager_cannot_mutate_candidates(hiring_client):
    response = hiring_client.get("/api/v1/candidates")
    assert response.status_code == 200
    create = post(
        hiring_client,
        "/api/v1/candidates",
        json={
            "full_name": "Not Allowed",
            "email": unique_email("hiring"),
            "phone": "+91 90000 55555",
            "applied_position": "Site Supervisor",
        },
    )
    assert create.status_code == 403
