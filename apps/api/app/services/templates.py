from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CompanyProfile, OfferTemplate
from app.seed_data import DEFAULT_TERMS
from app.services import documents, offers as offer_service
from app.services.offers import get_blocks, get_company


def sample_snapshot(db: Session, template: OfferTemplate) -> dict:
    company = get_company(db)
    now = datetime.now(UTC)
    terms = company.default_terms or DEFAULT_TERMS
    training_policy = company.default_training_policy or {
        "enabled": False,
        "include_training_policy": False,
        "compensation_mode": "STANDARD",
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
    blocks = dict(get_blocks(db))
    is_training_active = bool(training_policy.get("enabled") or training_policy.get("include_training_policy"))
    blocks["training_and_increment_policy"] = (
        documents.render_training_policy_block(training_policy) if is_training_active else ""
    )
    return {
        "schema_version": 1,
        "generated_at": now.isoformat(),
        "include_training_policy": is_training_active,
        "compensation_mode": "TRAINING_PROGRESSION" if is_training_active else "STANDARD",
        "offer": {
            "number": "MEW-OL-PREVIEW",
            "date": now.isoformat(),
            "expires_at": (now + timedelta(days=company.default_validity_days)).isoformat(),
            "revision_number": 1,
        },
        "company": {
            "name": company.name,
            "legal_name": company.legal_name,
            "tagline": company.tagline,
            "website": company.website,
            "email": company.email,
            "phone": company.phone,
            "address_line1": company.address_line1,
            "address_line2": company.address_line2,
            "city": company.city,
            "state": company.state,
            "postal_code": company.postal_code,
            "country": company.country,
            "udyam_number": company.udyam_number,
            "gst_number": company.gst_number,
            "signatory_name": company.signatory_name,
            "signatory_title": company.signatory_title,
            "signatory_email": company.signatory_email,
            "footer_note": company.footer_note,
        },
        "candidate": {
            "full_name": "Ananya Rao",
            "email": "ananya.rao@example.com",
            "phone": "+91 90000 00000",
            "current_address": "Plot 12, Ramachandrapuram, Hyderabad, Telangana 502032",
        },
        "employment": {
            "job_title": "Site Electrical Engineer",
            "department": "Projects",
            "employment_type": "FULL_TIME",
            "joining_date": (now + timedelta(days=30)).date().isoformat(),
            "work_location": company.default_work_location or "Patancheru, Hyderabad, Telangana",
            "reporting_manager": "Nekbor Seikh",
            "probation_months": company.default_probation_months,
            "working_days": company.default_working_days or "Monday to Saturday",
            "working_hours": company.default_working_hours or "9:00 AM to 6:00 PM",
        },
        "compensation": {
            "currency": "INR",
            "annual_ctc": 720000,
            "monthly_gross": 60000,
            "earnings": [
                {"name": "Basic salary", "amount": 30000, "period": "MONTHLY"},
                {"name": "House rent allowance", "amount": 12000, "period": "MONTHLY"},
                {"name": "Conveyance allowance", "amount": 4000, "period": "MONTHLY"},
                {"name": "Special allowance", "amount": 14000, "period": "MONTHLY"},
            ],
            "deductions": [],
            "payment_frequency": "MONTHLY",
            "notes": None,
        },
        "terms": terms,
        "training_policy": training_policy,
        "template": {
            "id": str(template.id),
            "name": template.name,
            "version": template.version,
            "html_content": template.html_content,
        },
        "signatory": {
            "name": template.signatory_name or company.signatory_name,
            "title": template.signatory_title or company.signatory_title,
            "email": template.signatory_email or company.signatory_email,
        },
        "blocks": blocks,
        "verification": {
            "url": "https://www.knightsky.in/verify/sample-preview",
            "qr_data_uri": documents.make_qr_data_uri("https://www.knightsky.in/verify/sample-preview"),
        },
    }


def preview_template(db: Session, template: OfferTemplate) -> str:
    snapshot = sample_snapshot(db, template)
    html_content = offer_service.render_snapshot_html(snapshot)
    return documents.sanitize_preview(html_content)
