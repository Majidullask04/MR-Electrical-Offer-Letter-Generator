"""Idempotent development seed.

Run from apps/api:

    python -m app.seed

Creates the company profile, staff roles/users, positions, content blocks, the
default letter template, demo candidates and a set of offers that exercise the
full lifecycle. Existing records are never overwritten, and demo offers are
only created when the offers table is empty.
"""

from __future__ import annotations

import argparse
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import (
    ActorType,
    ApprovalStatus,
    Candidate,
    CompanyProfile,
    JobPosition,
    Offer,
    OfferEvent,
    OfferStatus,
    OfferTemplate,
    ResponseType,
    Role,
    TemplateBlock,
    User,
)
from app.schemas.offer import OfferCreate
from app.seed_data import COMPANY, DEFAULT_BLOCKS, DEFAULT_TERMS, DEMO_CANDIDATES, DEMO_USERS, POSITIONS, ROLES
from app.security import hash_password
from app.services import offers as offer_service

TEMPLATE_PATH = Path(__file__).resolve().parent / "templates" / "offer_letter_default.html"


def seed_company(db: Session) -> CompanyProfile:
    company = db.scalars(select(CompanyProfile).order_by(CompanyProfile.created_at).limit(1)).first()
    if company:
        print("  company profile already present")
        return company
    company = CompanyProfile(**COMPANY, default_terms=DEFAULT_TERMS)
    db.add(company)
    db.commit()
    db.refresh(company)
    print("  company profile created")
    return company


def seed_roles(db: Session) -> dict[str, Role]:
    roles: dict[str, Role] = {}
    for key, name, description in ROLES:
        role = db.scalars(select(Role).where(Role.key == key)).first()
        if not role:
            role = Role(key=key, name=name, description=description)
            db.add(role)
            print(f"  role {key} created")
        roles[key] = role
    db.commit()
    return roles


def seed_users(db: Session, roles: dict[str, Role]) -> dict[str, User]:
    users: dict[str, User] = {}
    passwords = {
        "SUPER_ADMIN": settings.seed_admin_password,
        "HR_MANAGER": "HrManager!2026",
        "HIRING_MANAGER": "HiringManager!2026",
    }
    for email, full_name, role_key, _ in DEMO_USERS:
        if role_key == "SUPER_ADMIN":
            email = settings.seed_admin_email
        elif settings.is_production:
            continue
        user = db.scalars(select(User).where(func.lower(User.email) == email.lower())).first()
        if user:
            if role_key not in user.role_keys:
                user.roles.append(roles[role_key])
                db.commit()
            users[role_key] = user
            continue
        user = User(
            email=email,
            full_name=full_name,
            password_hash=hash_password(passwords[role_key]),
            is_active=True,
        )
        user.roles.append(roles[role_key])
        db.add(user)
        db.commit()
        db.refresh(user)
        print(f"  user {email} created")
        users[role_key] = user
    return users


def seed_positions(db: Session) -> None:
    for title, department in POSITIONS:
        existing = db.scalars(select(JobPosition).where(JobPosition.title == title)).first()
        if not existing:
            db.add(JobPosition(title=title, department=department, is_active=True))
    db.commit()


def seed_blocks(db: Session) -> None:
    for block in DEFAULT_BLOCKS:
        existing = db.scalars(select(TemplateBlock).where(TemplateBlock.key == block["key"])).first()
        if not existing:
            db.add(TemplateBlock(**block))
    db.commit()


def seed_template(db: Session, company: CompanyProfile, admin: User) -> OfferTemplate:
    existing = db.scalars(
        select(OfferTemplate).where(OfferTemplate.is_default.is_(True)).order_by(OfferTemplate.created_at)
    ).first()
    if existing:
        print(f"  default template already present: {existing.name}")
        return existing
    html_content = TEMPLATE_PATH.read_text(encoding="utf-8")
    template = OfferTemplate(
        name="Standard offer letter",
        description="MR. ELECTRICAL WORKS standard letterhead with employment, compensation and terms sections.",
        html_content=html_content,
        version=1,
        is_default=True,
        is_active=True,
        signatory_name=company.signatory_name,
        signatory_title=company.signatory_title,
        signatory_email=company.signatory_email,
        created_by_id=admin.id,
        updated_by_id=admin.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    print("  default template created")
    return template


def seed_candidates(db: Session, hr: User) -> list[Candidate]:
    created: list[Candidate] = []
    for data in DEMO_CANDIDATES:
        candidate = db.scalars(
            select(Candidate).where(func.lower(Candidate.email) == data["email"].lower())
        ).first()
        if not candidate:
            candidate = Candidate(
                **data,
                is_active=True,
                created_by_id=hr.id,
                proposed_joining_date=date.today() + timedelta(days=30),
            )
            db.add(candidate)
            db.commit()
            db.refresh(candidate)
        created.append(candidate)
    return created


def _offer_data(candidate: Candidate, annual_ctc: int, joining_in_days: int) -> dict:
    monthly = round(annual_ctc / 12 / 100) * 100
    basic = round(monthly * 0.40 / 100) * 100
    hra = round(monthly * 0.20 / 100) * 100
    conveyance = 2000
    special = monthly - basic - hra - conveyance
    if special < 0:
        special = 0
        monthly = basic + hra + conveyance
    annual = monthly * 12
    return {
        "employment": {
            "job_title": candidate.applied_position,
            "department": candidate.department or "Projects",
            "employment_type": candidate.employment_type,
            "joining_date": (date.today() + timedelta(days=joining_in_days)).isoformat(),
            "work_location": candidate.work_location or "Patancheru, Hyderabad, Telangana",
            "reporting_manager": candidate.reporting_manager or "Nekbor Seikh",
            "probation_months": 3,
            "working_days": "Monday to Saturday",
            "working_hours": "9:00 AM to 6:00 PM",
        },
        "compensation": {
            "currency": "INR",
            "annual_ctc": annual,
            "monthly_gross": monthly,
            "earnings": [
                {"name": "Basic salary", "amount": basic, "period": "MONTHLY"},
                {"name": "House rent allowance", "amount": hra, "period": "MONTHLY"},
                {"name": "Conveyance allowance", "amount": conveyance, "period": "MONTHLY"},
                {"name": "Special allowance", "amount": special, "period": "MONTHLY"},
            ],
            "deductions": [],
            "payment_frequency": "MONTHLY",
            "notes": None,
        },
        "terms": DEFAULT_TERMS,
    }


def _event(
    db: Session,
    offer: Offer,
    *,
    event_type: str,
    from_status: OfferStatus | None,
    to_status: OfferStatus | None,
    actor_name: str,
    note: str,
    actor_type: ActorType = ActorType.SYSTEM,
    when: datetime | None = None,
    metadata: dict | None = None,
) -> None:
    event = OfferEvent(
        offer_id=offer.id,
        event_type=event_type,
        from_status=from_status.value if from_status else None,
        to_status=to_status.value if to_status else None,
        actor_type=actor_type,
        actor_name=actor_name,
        note=note,
        event_metadata=metadata,
    )
    if when:
        event.created_at = when
    db.add(event)


def seed_demo_offers(
    db: Session,
    *,
    candidates: list[Candidate],
    template: OfferTemplate,
    users: dict[str, User],
) -> str | None:
    if db.scalar(select(func.count()).select_from(Offer)):
        print("  offers already exist, skipping demo offers")
        return None

    hr = users["HR_MANAGER"]
    hiring = users["HIRING_MANAGER"]
    salaries = [780000, 660000, 540000, 480000, 420000, 360000, 600000, 300000]
    scenarios = [
        ("draft", candidates[0]),
        ("pending", candidates[1]),
        ("approved", candidates[2]),
        ("issued", candidates[3]),
        ("viewed", candidates[4]),
        ("accepted", candidates[5]),
        ("rejected", candidates[6]),
        ("expired", candidates[7]),
    ]

    issued_link: str | None = None
    now = datetime.now(UTC)

    for index, (scenario, candidate) in enumerate(scenarios):
        payload = OfferCreate(
            candidate_id=candidate.id,
            template_id=template.id,
            validity_days=14,
            data=_offer_data(candidate, salaries[index], 24 + index),
            internal_notes=(
                f"Demo offer generated by the seed. Scenario: {scenario}. "
                "Replace the clause text before issuing a real offer."
            ),
        )
        offer = offer_service.create_offer(db, payload, hr)
        offer = offer_service.get_offer(db, offer["id"])

        if scenario == "draft":
            continue

        offer_service.submit_offer(db, offer.id, hr)
        offer = offer_service.get_offer(db, offer.id)
        if scenario == "pending":
            continue

        offer_service.approve_offer(db, offer.id, hiring, "Approved after reviewing the compensation and terms.")
        offer = offer_service.get_offer(db, offer.id)
        if scenario == "approved":
            continue

        result = offer_service.issue_offer(db, offer.id, hr)
        offer = offer_service.get_offer(db, offer.id)
        if scenario == "issued":
            issued_link = result["secure_link"]
            continue

        current = offer.current_revision_id
        if scenario == "viewed":
            offer.viewed_at = now - timedelta(hours=6)
            offer.status = OfferStatus.VIEWED
            _event(
                db, offer,
                event_type="VIEWED", from_status=OfferStatus.ISSUED, to_status=OfferStatus.VIEWED,
                actor_name=candidate.full_name, actor_type=ActorType.CANDIDATE,
                note="Candidate opened the secure offer portal.",
                when=now - timedelta(hours=6),
            )
        elif scenario == "accepted":
            offer.status = OfferStatus.ACCEPTED
            offer.response = ResponseType.ACCEPTED
            offer.viewed_at = now - timedelta(days=1)
            offer.responded_at = now - timedelta(hours=20)
            offer.accepted_at = now - timedelta(hours=20)
            offer.accepted_revision_id = current
            _event(
                db, offer,
                event_type="ACCEPTED", from_status=OfferStatus.VIEWED, to_status=OfferStatus.ACCEPTED,
                actor_name=candidate.full_name, actor_type=ActorType.CANDIDATE,
                note="Candidate accepted the offer through the secure portal.",
                when=now - timedelta(hours=20),
                metadata={"revision": offer.draft_revision_number},
            )
        elif scenario == "rejected":
            offer.status = OfferStatus.REJECTED
            offer.response = ResponseType.REJECTED
            offer.viewed_at = now - timedelta(days=2)
            offer.responded_at = now - timedelta(hours=30)
            offer.rejected_at = now - timedelta(hours=30)
            offer.rejection_reason = "Accepted another offer closer to home."
            _event(
                db, offer,
                event_type="REJECTED", from_status=OfferStatus.VIEWED, to_status=OfferStatus.REJECTED,
                actor_name=candidate.full_name, actor_type=ActorType.CANDIDATE,
                note="Accepted another offer closer to home.",
                when=now - timedelta(hours=30),
                metadata={"revision": offer.draft_revision_number},
            )
        elif scenario == "expired":
            offer.status = OfferStatus.EXPIRED
            offer.expires_at = now - timedelta(days=1)
            offer.token_revoked_at = now - timedelta(days=1)
            _event(
                db, offer,
                event_type="EXPIRED", from_status=OfferStatus.ISSUED, to_status=OfferStatus.EXPIRED,
                actor_name="System",
                note="The offer validity window elapsed without a response.",
                when=now - timedelta(days=1),
            )
        db.commit()

    print(f"  {len(scenarios)} demo offers created")
    return issued_link


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed OfferLater development data.")
    parser.add_argument("--skip-demo", action="store_true", help="Seed base data but no demo candidates/offers.")
    args = parser.parse_args()

    print(f"Seeding OfferLater ({settings.app_env})")
    with SessionLocal() as db:
        company = seed_company(db)
        roles = seed_roles(db)
        users = seed_users(db, roles)
        seed_positions(db)
        seed_blocks(db)
        template = seed_template(db, company, users["SUPER_ADMIN"])

        issued_link = None
        if not args.skip_demo:
            candidates = seed_candidates(db, users["HR_MANAGER"])
            print(f"  {len(candidates)} demo candidates available")
            issued_link = seed_demo_offers(
                db, candidates=candidates, template=template, users=users
            )

    if not settings.is_production:
        print("")
        print("Staff sign-in")
        print(f"  Super Admin     {settings.seed_admin_email} / {settings.seed_admin_password}")
        print("  HR Manager      hr@mrelectricalworks.in / HrManager!2026")
        print("  Hiring Manager  hiring@mrelectricalworks.in / HiringManager!2026")
        if issued_link:
            print("")
            print("Demo candidate portal (issued offer)")
            print(f"  {issued_link}")
    print("")
    print("The seeded clause text is neutral starter copy, not legal advice.")
    print("Review company details and replace the terms before issuing a real offer.")


if __name__ == "__main__":
    main()
