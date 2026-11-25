from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from app.deps import DbSession, HrOrAdmin
from app.models import ApprovalRecord, ApprovalStatus, Candidate, Offer, OfferStatus
from app.schemas.offer import OfferPreviewResponse
from app.schemas.verify import GeneratorOfferRequest
from app.security import ROLE_HIRING_MANAGER, ROLE_SUPER_ADMIN
from app.services import documents, offers as offer_service
from app.services.audit import record_audit

router = APIRouter(prefix="/generator", tags=["offer generator"])


def _build_offer_data(db, payload: GeneratorOfferRequest) -> tuple[dict, int]:
    company = offer_service.get_company(db)
    gen_config = company.generator_config or {}
    if gen_config.get("require_email") and not payload.email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "EMAIL_REQUIRED", "message": "Candidate email is required by company settings."},
        )
    if gen_config.get("require_phone") and not payload.phone:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PHONE_REQUIRED", "message": "Candidate mobile number is required by company settings."},
        )
    if gen_config.get("require_department") and not payload.department:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "DEPARTMENT_REQUIRED", "message": "Department is required by company settings."},
        )

    today = datetime.now(UTC).date()
    if payload.expiry_date:
        validity_days = max(1, min(90, (payload.expiry_date - today).days))
    else:
        validity_days = payload.validity_days or company.default_validity_days

    annual_ctc = float(payload.annual_ctc or 0)
    monthly_salary = float(payload.monthly_salary or 0)
    stipend = float(payload.stipend or 0) if payload.stipend is not None else None
    if annual_ctc > 0 and monthly_salary <= 0:
        monthly_salary = round(annual_ctc / 12, 2)
    elif monthly_salary > 0 and annual_ctc <= 0:
        annual_ctc = round(monthly_salary * 12, 2)

    earnings = [item.model_dump() for item in payload.allowances]
    if not earnings and monthly_salary > 0:
        earnings = [{"name": "Consolidated salary", "amount": monthly_salary, "period": "MONTHLY"}]

    default_terms = dict(company.default_terms or {})
    if payload.employment_terms:
        default_terms["additional_clauses"] = payload.employment_terms
    if payload.additional_instructions:
        existing_join = default_terms.get("joining_requirements") or ""
        default_terms["joining_requirements"] = (
            f"{existing_join}\n\n{payload.additional_instructions}".strip()
            if existing_join
            else payload.additional_instructions
        )

    responsibilities = payload.responsibilities or gen_config.get("default_responsibilities") or None
    data = {
        "employment": {
            "job_title": payload.job_title.strip(),
            "department": (payload.department or "").strip(),
            "employment_type": payload.employment_type.value,
            "joining_date": payload.joining_date.isoformat(),
            "work_location": payload.work_location or company.default_work_location or "Patancheru, Hyderabad, Telangana",
            "reporting_manager": payload.reporting_manager or company.signatory_name or "Management",
            "employment_duration": payload.employment_duration,
            "probation_months": (
                payload.probation_months
                if payload.probation_months is not None
                else company.default_probation_months
            ),
            "working_days": company.default_working_days or "Monday to Saturday",
            "working_hours": company.default_working_hours or "9:00 AM to 6:00 PM",
            "responsibilities": responsibilities,
        },
        "compensation": {
            "currency": "INR",
            "annual_ctc": annual_ctc,
            "monthly_gross": monthly_salary,
            "stipend": stipend,
            "earnings": earnings,
            "deductions": [],
            "payment_frequency": "MONTHLY",
            "payment_terms": payload.payment_terms,
            "notes": None,
        },
        "terms": default_terms,
    }
    return data, validity_days


@router.post("/preview", response_model=OfferPreviewResponse)
def preview_generated_offer(payload: GeneratorOfferRequest, db: DbSession, user: HrOrAdmin):
    company = offer_service.get_company(db)
    template = offer_service.resolve_template(db, payload.template_id)
    data, validity_days = _build_offer_data(db, payload)
    now = datetime.now(UTC)
    candidate = Candidate(
        candidate_code=payload.candidate_code,
        full_name=payload.full_name.strip(),
        email=payload.email.lower() if payload.email else None,
        phone=payload.phone,
        applied_position=payload.job_title.strip(),
        department=payload.department,
        employment_type=payload.employment_type.value,
        proposed_joining_date=payload.joining_date,
        reporting_manager=data["employment"]["reporting_manager"],
        work_location=data["employment"]["work_location"],
    )
    preview_id = f"{company.official_offer_prefix}/{now.year}/PREVIEW"
    preview_qr = documents.make_qr_data_uri(f"https://www.knightsky.in/verify/preview")
    snapshot = offer_service._build_snapshot(
        offer_number="DRAFT-PREVIEW",
        official_number=preview_id,
        candidate=candidate,
        company=company,
        template=template,
        data=data,
        offer_date=now,
        expires_at=now + timedelta(days=validity_days),
        revision_number=1,
        blocks=offer_service.get_blocks(db),
        verification={"url": "Verification QR assigned upon issuance", "qr_data_uri": preview_qr},
    )
    html_content = offer_service.render_snapshot_html(snapshot)
    return {"html": documents.sanitize_preview(html_content)}


@router.post("/offers", status_code=status.HTTP_201_CREATED)
def generate_offer(
    payload: GeneratorOfferRequest,
    db: DbSession,
    user: HrOrAdmin,
    request: Request,
):
    if payload.issue_immediately and not user.role_keys.intersection({ROLE_SUPER_ADMIN, ROLE_HIRING_MANAGER}):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "APPROVAL_PERMISSION_REQUIRED",
                "message": "Only Super Admin or Hiring Manager can approve and issue directly. Save as draft and submit for approval.",
            },
        )

    data, validity_days = _build_offer_data(db, payload)
    template = offer_service.resolve_template(db, payload.template_id)

    candidate: Candidate | None = None
    if payload.email:
        candidate = db.scalars(
            select(Candidate).where(func.lower(Candidate.email) == payload.email.lower())
        ).first()
    if candidate:
        candidate.full_name = payload.full_name.strip()
        if payload.phone:
            candidate.phone = payload.phone
        if payload.candidate_code:
            candidate.candidate_code = payload.candidate_code
        candidate.applied_position = payload.job_title.strip()
        candidate.department = payload.department
        candidate.employment_type = payload.employment_type.value
        candidate.proposed_joining_date = payload.joining_date
        candidate.reporting_manager = data["employment"]["reporting_manager"]
        candidate.work_location = data["employment"]["work_location"]
        candidate.is_active = True
    else:
        code = payload.candidate_code
        if not code:
            count = db.scalar(select(func.count()).select_from(Candidate)) or 0
            code = f"CAND-{datetime.now(UTC).year}-{count + 1:04d}"
        candidate = Candidate(
            candidate_code=code,
            full_name=payload.full_name.strip(),
            email=payload.email.lower() if payload.email else None,
            phone=payload.phone,
            applied_position=payload.job_title.strip(),
            department=payload.department,
            employment_type=payload.employment_type.value,
            proposed_joining_date=payload.joining_date,
            reporting_manager=data["employment"]["reporting_manager"],
            work_location=data["employment"]["work_location"],
            is_active=True,
            created_by_id=user.id,
        )
        db.add(candidate)
        db.flush()

    offer = Offer(
        candidate_id=candidate.id,
        template_id=template.id,
        data=data,
        validity_days=validity_days,
        created_by_id=user.id,
        status=OfferStatus.DRAFT,
        draft_revision_number=1,
    )
    db.add(offer)
    db.flush()
    offer_service.record_event(
        db,
        offer,
        event_type="CREATED",
        to_status=OfferStatus.DRAFT,
        user=user,
        note="Created via Offer Letter Generator.",
    )
    record_audit(
        db,
        action="offer.generated_draft",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"candidate_id": str(candidate.id), "issue_immediately": payload.issue_immediately},
        request=request,
    )
    db.commit()
    db.refresh(offer)

    if not payload.issue_immediately:
        return {
            "offer": offer_service.serialize_detail(offer),
            "secure_link": None,
            "verification_url": None,
            "official_offer_number": None,
            "pdf_sha256": None,
            "email_status": "not_sent",
            "message": "Draft offer created. Preview or submit for approval before issuing.",
        }

    # Authorized admin direct issuance: record approval & issue atomically
    approval = ApprovalRecord(
        offer_id=offer.id,
        revision_number=1,
        requested_by_id=user.id,
        approved_by_id=user.id,
        status=ApprovalStatus.APPROVED,
        comments="Approved and issued directly from Offer Letter Generator.",
        decided_at=datetime.now(UTC),
    )
    db.add(approval)
    offer.status = OfferStatus.APPROVED
    offer.approved_by_id = user.id
    offer_service.record_event(
        db,
        offer,
        event_type="APPROVED",
        from_status=OfferStatus.DRAFT,
        to_status=OfferStatus.APPROVED,
        user=user,
        note="Approved directly by authorised issuer.",
    )
    db.commit()
    return offer_service.issue_offer(db, offer.id, user, request)
