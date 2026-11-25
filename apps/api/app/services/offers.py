from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import (
    ActorType,
    ApprovalRecord,
    ApprovalStatus,
    Candidate,
    CompanyProfile,
    Offer,
    OfferEvent,
    OfferRevision,
    OfferStatus,
    OfferTemplate,
    OfferVerification,
    ResponseType,
    TemplateBlock,
    User,
    VerificationStatus,
)
from app.schemas.offer import OfferCreate, OfferData, OfferUpdate
from app.security import (
    candidate_offer_url,
    generate_offer_token,
    generate_verification_token,
    hash_offer_token,
    sha256_bytes,
    verification_url,
)
from app.services import documents
from app.services.audit import record_audit
from app.services.documents import DocumentError, format_date
from app.services.notifications import (
    notify_approval_required,
    notify_offer_accepted,
    notify_offer_expired,
    notify_offer_issued,
    notify_offer_rejected,
    notify_offer_viewed,
)
from app.services.storage import read_pdf, save_pdf

ISSUED_LIKE = {OfferStatus.ISSUED, OfferStatus.VIEWED, OfferStatus.REISSUED}
RESPONDED = {OfferStatus.ACCEPTED, OfferStatus.REJECTED}
EDITABLE = {OfferStatus.DRAFT, OfferStatus.PENDING_APPROVAL, OfferStatus.APPROVED}


def get_company(db: Session) -> CompanyProfile:
    company = db.scalars(select(CompanyProfile).order_by(CompanyProfile.created_at).limit(1)).first()
    if not company:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "COMPANY_NOT_CONFIGURED", "message": "Company settings are not configured."},
        )
    return company


def get_blocks(db: Session) -> dict[str, str]:
    return {block.key: block.content for block in db.scalars(select(TemplateBlock))}


def resolve_template(
    db: Session, template_id: uuid.UUID | None, *, require_active: bool = True
) -> OfferTemplate:
    if template_id:
        template = db.get(OfferTemplate, template_id)
        if not template:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "TEMPLATE_NOT_FOUND", "message": "That offer template does not exist."},
            )
        if require_active and not template.is_active:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"code": "TEMPLATE_INACTIVE", "message": "That offer template is inactive."},
            )
        return template
    template = db.scalars(
        select(OfferTemplate)
        .where(OfferTemplate.is_active.is_(True))
        .order_by(OfferTemplate.is_default.desc(), OfferTemplate.created_at.asc())
        .limit(1)
    ).first()
    if not template:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "NO_TEMPLATE", "message": "Create an active offer template before creating an offer."},
        )
    return template


def get_offer(db: Session, offer_id: uuid.UUID, *, lock: bool = False) -> Offer:
    statement = select(Offer).where(Offer.id == offer_id)
    if lock:
        statement = statement.with_for_update(of=Offer)
    offer = db.scalars(statement).first()
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "OFFER_NOT_FOUND", "message": "That offer does not exist."},
        )
    return offer


def _status_value(value: OfferStatus | None) -> str | None:
    return value.value if value else None


def record_event(
    db: Session,
    offer: Offer,
    *,
    event_type: str,
    from_status: OfferStatus | None = None,
    to_status: OfferStatus | None = None,
    user: User | None = None,
    actor_type: ActorType = ActorType.USER,
    actor_name: str | None = None,
    note: str | None = None,
    metadata: dict | None = None,
) -> OfferEvent:
    event = OfferEvent(
        offer_id=offer.id,
        event_type=event_type,
        from_status=_status_value(from_status),
        to_status=_status_value(to_status),
        actor_id=user.id if user else None,
        actor_type=actor_type,
        actor_name=user.full_name if user else actor_name,
        note=note,
        event_metadata=metadata,
    )
    db.add(event)
    return event


def _current_revision_number(offer: Offer) -> int:
    if offer.status in EDITABLE:
        return offer.draft_revision_number
    if offer.current_revision:
        return offer.current_revision.revision_number
    return offer.draft_revision_number


def next_official_offer_number(db: Session, company: CompanyProfile) -> str:
    """Allocate a unique, concurrency-safe sequential official Offer ID on issuance."""
    seq_val = int(db.execute(text("SELECT nextval('official_offer_seq')")).scalar_one())
    prefix = (company.official_offer_prefix or "MREW/OL").strip()
    fmt = company.offer_number_format or "{prefix}/{year}/{seq:06d}"
    year = datetime.now(UTC).year
    try:
        return fmt.format(prefix=prefix, year=year, seq=seq_val)
    except Exception:  # noqa: BLE001
        return f"{prefix}/{year}/{seq_val:06d}"


def _effective_status(offer: Offer) -> OfferStatus:
    now = datetime.now(UTC)
    if offer.status in ISSUED_LIKE and offer.expires_at and offer.expires_at < now:
        return OfferStatus.EXPIRED
    return offer.status


def serialize_summary(offer: Offer) -> dict[str, Any]:
    data = offer.data or {}
    employment = data.get("employment") or {}
    compensation = data.get("compensation") or {}
    candidate = offer.candidate
    return {
        "id": offer.id,
        "offer_number": offer.offer_number,
        "official_offer_number": offer.official_offer_number,
        "status": offer.status,
        "effective_status": _effective_status(offer).value,
        "candidate_id": offer.candidate_id,
        "candidate_name": candidate.full_name if candidate else "Unknown candidate",
        "candidate_email": candidate.email if candidate else None,
        "job_title": employment.get("job_title") or "Untitled role",
        "department": employment.get("department"),
        "employment_type": employment.get("employment_type"),
        "annual_ctc": float(compensation.get("annual_ctc") or 0),
        "monthly_salary": float(compensation.get("monthly_gross") or 0),
        "created_at": offer.created_at,
        "issued_at": offer.issued_at,
        "expires_at": offer.expires_at,
        "viewed_at": offer.viewed_at,
        "responded_at": offer.responded_at,
        "created_by_name": offer.created_by.full_name if offer.created_by else None,
        "approved_by_name": offer.approved_by.full_name if offer.approved_by else None,
        "revision_number": _current_revision_number(offer),
        "current_revision_id": offer.current_revision_id,
    }


def serialize_detail(offer: Offer) -> dict[str, Any]:
    summary = serialize_summary(offer)
    summary.update(
        {
            "data": offer.data or {},
            "internal_notes": offer.internal_notes,
            "withdrawal_reason": offer.withdrawal_reason,
            "rejection_reason": offer.rejection_reason,
            "response": offer.response,
            "accepted_at": offer.accepted_at,
            "rejected_at": offer.rejected_at,
            "withdrawn_at": offer.withdrawn_at,
            "token_created_at": offer.token_created_at,
            "token_revoked_at": offer.token_revoked_at,
            "has_active_link": bool(
                offer.secure_token_hash
                and not offer.token_revoked_at
                and offer.status in ISSUED_LIKE
            ),
            "template_id": offer.template_id,
            "template_name": offer.template.name if offer.template else None,
            "validity_days": offer.validity_days,
            "pdf_sha256": offer.current_revision.pdf_sha256 if offer.current_revision else None,
            "events": [
                {
                    "id": event.id,
                    "event_type": event.event_type,
                    "from_status": event.from_status,
                    "to_status": event.to_status,
                    "actor_type": event.actor_type.value if event.actor_type else "SYSTEM",
                    "actor_name": event.actor_name
                    or (event.actor.full_name if event.actor else None),
                    "note": event.note,
                    "metadata": event.event_metadata,
                    "created_at": event.created_at,
                }
                for event in sorted(offer.events, key=lambda item: item.created_at)
            ],
            "approvals": [
                {
                    "id": approval.id,
                    "revision_number": approval.revision_number,
                    "status": approval.status,
                    "requested_by_name": approval.requested_by.full_name if approval.requested_by else None,
                    "approved_by_name": approval.approved_by.full_name if approval.approved_by else None,
                    "comments": approval.comments,
                    "requested_at": approval.requested_at,
                    "decided_at": approval.decided_at,
                }
                for approval in sorted(offer.approvals, key=lambda item: item.requested_at)
            ],
            "revisions": [
                {
                    "id": revision.id,
                    "revision_number": revision.revision_number,
                    "official_offer_number": revision.official_offer_number,
                    "pdf_sha256": revision.pdf_sha256,
                    "issued_at": revision.issued_at,
                    "created_at": revision.created_at,
                    "created_by_name": revision.created_by.full_name if revision.created_by else None,
                    "has_pdf": bool(revision.pdf_path),
                    "is_current": revision.id == offer.current_revision_id,
                }
                for revision in sorted(offer.revisions, key=lambda item: item.revision_number)
            ],
        }
    )
    return summary


def _build_snapshot(
    *,
    offer_number: str,
    official_number: str | None = None,
    candidate: Candidate,
    company: CompanyProfile,
    template: OfferTemplate,
    data: dict,
    offer_date: datetime,
    expires_at: datetime,
    revision_number: int,
    blocks: dict[str, str],
    verification: dict[str, str] | None = None,
) -> dict[str, Any]:
    signatory = {
        "name": template.signatory_name or company.signatory_name,
        "title": template.signatory_title or company.signatory_title,
        "email": template.signatory_email or company.signatory_email,
    }
    footer_note = company.footer_note
    if not footer_note:
        footer_note = (
            f"{company.name} is a turnkey electrical engineering and contracting business. "
            f"Registered office: {company.address_line1 or ''}, {company.city or ''}, "
            f"{company.state or ''} {company.postal_code or ''}."
        )
        if company.udyam_number:
            footer_note += f" Udyam registration: {company.udyam_number}."
    gen_config = company.generator_config or {}
    terms = dict(data.get("terms") or {})
    if not terms.get("candidate_declaration") and gen_config.get("candidate_declaration"):
        terms["candidate_declaration"] = gen_config["candidate_declaration"]
    return {
        "schema_version": 2,
        "generated_at": datetime.now(UTC).isoformat(),
        "offer": {
            "number": offer_number,
            "official_number": official_number,
            "date": offer_date.isoformat(),
            "expires_at": expires_at.isoformat(),
            "revision_number": revision_number,
        },
        "company": {
            "name": company.name,
            "legal_name": company.legal_name,
            "tagline": company.tagline,
            "company_intro": company.company_intro,
            "primary_color": company.primary_color,
            "accent_color": company.accent_color,
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
            "signature_image_data": company.signature_image_data,
            "seal_image_data": company.seal_image_data,
            "footer_note": footer_note,
        },
        "candidate": {
            "candidate_code": candidate.candidate_code,
            "full_name": candidate.full_name,
            "email": candidate.email,
            "phone": candidate.phone,
            "current_address": candidate.current_address,
        },
        "employment": data["employment"],
        "compensation": data["compensation"],
        "terms": terms,
        "include_training_policy": bool(
            data.get("include_training_policy")
            or data.get("compensation_mode") == "TRAINING_PROGRESSION"
            or (data.get("training_policy") or {}).get("enabled")
        ),
        "compensation_mode": data.get(
            "compensation_mode",
            "TRAINING_PROGRESSION"
            if (
                data.get("include_training_policy")
                or (data.get("training_policy") or {}).get("enabled")
            )
            else "STANDARD",
        ),
        "training_policy": data.get("training_policy"),
        "show_candidate_signature_block": gen_config.get("show_candidate_signature_block", True),
        "template": {
            "id": str(template.id),
            "name": template.name,
            "version": template.version,
            "html_content": template.html_content,
        },
        "signatory": signatory,
        "blocks": blocks,
        "verification": verification or {},
    }


def _snapshot_for_offer(
    db: Session,
    offer: Offer,
    *,
    offer_date: datetime | None = None,
    expires_at: datetime | None = None,
    revision_number: int | None = None,
    official_number: str | None = None,
    verification: dict[str, str] | None = None,
) -> dict[str, Any]:
    company = get_company(db)
    template = resolve_template(db, offer.template_id, require_active=offer.status in EDITABLE)
    candidate = offer.candidate or db.get(Candidate, offer.candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "CANDIDATE_MISSING", "message": "The candidate for this offer is unavailable."},
        )
    now = offer_date or datetime.now(UTC)
    expiry = expires_at or (now + timedelta(days=offer.validity_days))
    return _build_snapshot(
        offer_number=offer.offer_number or "DRAFT-PREVIEW",
        official_number=official_number or offer.official_offer_number,
        candidate=candidate,
        company=company,
        template=template,
        data=offer.data,
        offer_date=now,
        expires_at=expiry,
        revision_number=revision_number or offer.draft_revision_number,
        blocks=get_blocks(db),
        verification=verification,
    )


def build_preview_snapshot(db: Session, payload: OfferCreate | OfferUpdate) -> dict[str, Any]:
    if not payload.data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "DATA_REQUIRED", "message": "Complete the offer details before previewing."},
        )
    if not payload.candidate_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CANDIDATE_REQUIRED", "message": "Select a candidate before previewing."},
        )
    candidate = db.get(Candidate, payload.candidate_id)
    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CANDIDATE_NOT_FOUND", "message": "That candidate does not exist."},
        )
    company = get_company(db)
    template = resolve_template(db, payload.template_id)
    now = datetime.now(UTC)
    return _build_snapshot(
        offer_number="DRAFT-PREVIEW",
        candidate=candidate,
        company=company,
        template=template,
        data=payload.data.model_dump(mode="json"),
        offer_date=now,
        expires_at=now + timedelta(days=payload.validity_days or company.default_validity_days),
        revision_number=1,
        blocks=get_blocks(db),
    )


def render_snapshot_html(snapshot: dict[str, Any]) -> str:
    try:
        return documents.render_document(
            snapshot["template"]["html_content"], snapshot, for_pdf=False
        )
    except DocumentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "TEMPLATE_RENDER_FAILED", "message": str(exc)},
        ) from exc


def create_offer(db: Session, payload: OfferCreate, user: User, request=None) -> dict[str, Any]:
    candidate = db.get(Candidate, payload.candidate_id)
    if not candidate or not candidate.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CANDIDATE_NOT_FOUND", "message": "Select an active candidate."},
        )
    template = resolve_template(db, payload.template_id)
    offer = Offer(
        candidate_id=candidate.id,
        template_id=template.id,
        data=payload.data.model_dump(mode="json"),
        validity_days=payload.validity_days,
        internal_notes=payload.internal_notes,
        created_by_id=user.id,
        status=OfferStatus.DRAFT,
        draft_revision_number=1,
        training_policy=payload.data.training_policy.model_dump(mode="json"),
    )
    db.add(offer)
    db.flush()
    record_event(
        db,
        offer,
        event_type="CREATED",
        to_status=OfferStatus.DRAFT,
        user=user,
        note="Offer draft created.",
    )
    record_audit(
        db,
        action="offer.created",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"candidate_id": str(candidate.id), "template_id": str(template.id)},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return serialize_detail(offer)


def update_offer(
    db: Session, offer_id: uuid.UUID, payload: OfferUpdate, user: User, request=None
) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status not in EDITABLE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "OFFER_NOT_EDITABLE",
                "message": "Issued offers are immutable. Withdraw and revise the offer to change it.",
            },
        )
    from_status = offer.status
    changed_fields = [field for field, value in payload.model_dump(exclude_unset=True).items() if value is not None]
    if offer.status != OfferStatus.DRAFT:
        if offer.status == OfferStatus.PENDING_APPROVAL:
            pending = _pending_approval(db, offer)
            if pending:
                pending.status = ApprovalStatus.RETURNED
                pending.comments = "Superseded by an edit; approval is required again."
                pending.decided_at = datetime.now(UTC)
        offer.status = OfferStatus.DRAFT
        offer.approved_by_id = None
    if payload.candidate_id:
        candidate = db.get(Candidate, payload.candidate_id)
        if not candidate or not candidate.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"code": "CANDIDATE_NOT_FOUND", "message": "Select an active candidate."},
            )
        offer.candidate_id = candidate.id
    if payload.template_id:
        offer.template_id = resolve_template(db, payload.template_id).id
    if payload.validity_days is not None:
        offer.validity_days = payload.validity_days
    if payload.data is not None:
        offer.data = payload.data.model_dump(mode="json")
        offer.training_policy = offer.data.get("training_policy")
    if payload.internal_notes is not None:
        offer.internal_notes = payload.internal_notes
    record_event(
        db,
        offer,
        event_type="EDITED",
        from_status=from_status,
        to_status=offer.status,
        user=user,
        note="Offer draft updated." if from_status == OfferStatus.DRAFT else "Offer returned to draft after an edit.",
        metadata={"fields": sorted(changed_fields)},
    )
    record_audit(
        db,
        action="offer.updated",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"fields": sorted(changed_fields), "from_status": from_status.value},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return serialize_detail(offer)


def _pending_approval(db: Session, offer: Offer) -> ApprovalRecord | None:
    return db.scalars(
        select(ApprovalRecord)
        .where(
            ApprovalRecord.offer_id == offer.id,
            ApprovalRecord.revision_number == offer.draft_revision_number,
            ApprovalRecord.status == ApprovalStatus.PENDING,
        )
        .order_by(ApprovalRecord.requested_at.desc())
        .limit(1)
    ).first()


def submit_offer(db: Session, offer_id: uuid.UUID, user: User, request=None) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status != OfferStatus.DRAFT:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATUS", "message": "Only a draft can be submitted for approval."},
        )
    resolve_template(db, offer.template_id)
    approval = ApprovalRecord(
        offer_id=offer.id,
        revision_number=offer.draft_revision_number,
        requested_by_id=user.id,
        status=ApprovalStatus.PENDING,
    )
    db.add(approval)
    offer.status = OfferStatus.PENDING_APPROVAL
    record_event(
        db,
        offer,
        event_type="SUBMITTED",
        from_status=OfferStatus.DRAFT,
        to_status=OfferStatus.PENDING_APPROVAL,
        user=user,
        note="Submitted for approval.",
    )
    notify_approval_required(db, offer, user)
    record_audit(
        db,
        action="offer.submitted",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"revision": offer.draft_revision_number},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return serialize_detail(offer)


def approve_offer(
    db: Session, offer_id: uuid.UUID, user: User, comments: str | None = None, request=None
) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status != OfferStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATUS", "message": "This offer is not awaiting approval."},
        )
    approval = _pending_approval(db, offer)
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "NO_APPROVAL", "message": "No pending approval was found for this revision."},
        )
    approval.status = ApprovalStatus.APPROVED
    approval.approved_by_id = user.id
    approval.comments = comments
    approval.decided_at = datetime.now(UTC)
    offer.status = OfferStatus.APPROVED
    offer.approved_by_id = user.id
    record_event(
        db,
        offer,
        event_type="APPROVED",
        from_status=OfferStatus.PENDING_APPROVAL,
        to_status=OfferStatus.APPROVED,
        user=user,
        note=comments or "Approved.",
    )
    record_audit(
        db,
        action="offer.approved",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"revision": offer.draft_revision_number},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return serialize_detail(offer)


def return_offer(
    db: Session, offer_id: uuid.UUID, user: User, comments: str, request=None
) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status != OfferStatus.PENDING_APPROVAL:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATUS", "message": "This offer is not awaiting approval."},
        )
    approval = _pending_approval(db, offer)
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "NO_APPROVAL", "message": "No pending approval was found for this revision."},
        )
    approval.status = ApprovalStatus.RETURNED
    approval.approved_by_id = user.id
    approval.comments = comments
    approval.decided_at = datetime.now(UTC)
    offer.status = OfferStatus.DRAFT
    offer.approved_by_id = None
    record_event(
        db,
        offer,
        event_type="RETURNED",
        from_status=OfferStatus.PENDING_APPROVAL,
        to_status=OfferStatus.DRAFT,
        user=user,
        note=comments,
    )
    record_audit(
        db,
        action="offer.returned",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"revision": offer.draft_revision_number},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return serialize_detail(offer)


def issue_offer(
    db: Session, offer_id: uuid.UUID, user: User, request=None
) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status != OfferStatus.APPROVED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "NOT_APPROVED", "message": "Only an approved offer can be issued."},
        )
    approval = db.scalars(
        select(ApprovalRecord)
        .where(
            ApprovalRecord.offer_id == offer.id,
            ApprovalRecord.revision_number == offer.draft_revision_number,
            ApprovalRecord.status == ApprovalStatus.APPROVED,
        )
        .order_by(ApprovalRecord.decided_at.desc())
        .limit(1)
    ).first()
    if not approval:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "APPROVAL_REQUIRED", "message": "This revision has no recorded approval."},
        )

    company = get_company(db)
    raw_token, token_hash = generate_offer_token()
    raw_verif_token, verif_token_hash = generate_verification_token()
    verif_url = verification_url(raw_verif_token)
    qr_data_uri = documents.make_qr_data_uri(verif_url)
    official_number = next_official_offer_number(db, company)

    now = datetime.now(UTC)
    expires_at = now + timedelta(days=offer.validity_days)
    revision_number = offer.draft_revision_number
    snapshot = _snapshot_for_offer(
        db,
        offer,
        offer_date=now,
        expires_at=expires_at,
        revision_number=revision_number,
        official_number=official_number,
        verification={"url": verif_url, "qr_data_uri": qr_data_uri},
    )
    rendered_html = render_snapshot_html(snapshot)
    try:
        pdf_bytes = documents.render_pdf(rendered_html)
    except DocumentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PDF_RENDER_FAILED", "message": str(exc)},
        ) from exc
    pdf_sha256 = sha256_bytes(pdf_bytes)
    pdf_size = len(pdf_bytes)
    pdf_path = save_pdf(offer.id, revision_number, pdf_bytes)

    revision = OfferRevision(
        offer_id=offer.id,
        revision_number=revision_number,
        official_offer_number=official_number,
        snapshot=snapshot,
        rendered_html=rendered_html,
        pdf_path=pdf_path,
        pdf_sha256=pdf_sha256,
        pdf_size_bytes=pdf_size,
        qr_data_uri=qr_data_uri,
        created_by_id=user.id,
        issued_at=now,
    )
    db.add(revision)
    db.flush()

    prior_verifications = db.scalars(
        select(OfferVerification).where(
            OfferVerification.offer_id == offer.id,
            OfferVerification.status.in_(
                [VerificationStatus.VALID.value, VerificationStatus.REVOKED.value, VerificationStatus.EXPIRED.value]
            ),
        )
    ).all()

    verification_row = OfferVerification(
        offer_id=offer.id,
        revision_id=revision.id,
        offer_number=official_number,
        draft_reference=offer.offer_number,
        verification_token_hash=verif_token_hash,
        pdf_sha256=pdf_sha256,
        pdf_size_bytes=pdf_size,
        status=VerificationStatus.VALID.value,
    )
    db.add(verification_row)
    db.flush()

    for prior in prior_verifications:
        prior.status = VerificationStatus.SUPERSEDED.value
        prior.superseded_by_id = verification_row.id

    offer.official_offer_number = official_number
    offer.current_revision_id = revision.id
    offer.status = OfferStatus.REISSUED if revision_number > 1 else OfferStatus.ISSUED
    offer.issued_at = now
    offer.expires_at = expires_at
    offer.issued_by_id = user.id
    offer.secure_token_hash = token_hash
    offer.token_created_at = now
    offer.token_revoked_at = None
    offer.token_last_used_at = None
    offer.viewed_at = None
    offer.responded_at = None
    offer.accepted_at = None
    offer.rejected_at = None
    offer.withdrawn_at = None
    offer.withdrawal_reason = None
    offer.response = None
    offer.rejection_reason = None
    offer.accepted_revision_id = None
    url = candidate_offer_url(raw_token)
    record_event(
        db,
        offer,
        event_type="REISSUED" if revision_number > 1 else "ISSUED",
        from_status=OfferStatus.APPROVED,
        to_status=offer.status,
        user=user,
        note=f"Revision {revision_number} issued as {official_number}.",
        metadata={"official_offer_number": official_number, "pdf_sha256": pdf_sha256},
    )
    email_status = notify_offer_issued(db, offer, url, revised=revision_number > 1)
    record_audit(
        db,
        action="offer.issued",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={
            "revision": revision_number,
            "official_offer_number": official_number,
            "pdf_sha256": pdf_sha256,
            "email_status": email_status,
        },
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return {
        "offer": serialize_detail(offer),
        "secure_link": url,
        "verification_url": verif_url,
        "official_offer_number": official_number,
        "pdf_sha256": pdf_sha256,
        "email_status": email_status,
        "message": "Offer issued with a unique Offer ID, verification QR code, and SHA-256 integrity hash.",
    }


def withdraw_offer(
    db: Session, offer_id: uuid.UUID, user: User, reason: str, request=None
) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status not in {OfferStatus.APPROVED, *ISSUED_LIKE}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_STATUS",
                "message": "Only approved or issued offers can be revoked. Accepted or rejected offers are final.",
            },
        )
    now = datetime.now(UTC)
    from_status = offer.status
    offer.status = OfferStatus.WITHDRAWN
    offer.withdrawn_at = now
    offer.withdrawal_reason = reason
    offer.token_revoked_at = now
    active_verifications = db.scalars(
        select(OfferVerification).where(
            OfferVerification.offer_id == offer.id,
            OfferVerification.status == VerificationStatus.VALID.value,
        )
    ).all()
    for verif in active_verifications:
        verif.status = VerificationStatus.REVOKED.value
        verif.revoked_at = now
        verif.revoked_reason = reason
        verif.revoked_by_id = user.id
    record_event(
        db,
        offer,
        event_type="WITHDRAWN",
        from_status=from_status,
        to_status=OfferStatus.WITHDRAWN,
        user=user,
        note=reason,
    )
    record_audit(
        db,
        action="offer.withdrawn",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"revision": _current_revision_number(offer), "reason": reason},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return serialize_detail(offer)


def revise_offer(
    db: Session, offer_id: uuid.UUID, user: User, reason: str | None = None, request=None
) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status == OfferStatus.ACCEPTED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "OFFER_ACCEPTED", "message": "An accepted offer cannot be revised. Create a new offer instead."},
        )
    if offer.status not in {OfferStatus.WITHDRAWN, OfferStatus.EXPIRED, OfferStatus.REJECTED}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "INVALID_STATUS",
                "message": "Withdraw or let the offer expire before starting a revision.",
            },
        )
    from_status = offer.status
    if from_status == OfferStatus.EXPIRED:
        prior_valid = db.scalars(
            select(OfferVerification).where(
                OfferVerification.offer_id == offer.id,
                OfferVerification.status == VerificationStatus.VALID.value,
            )
        ).all()
        for verif in prior_valid:
            verif.status = VerificationStatus.EXPIRED.value
    highest_revision = max((revision.revision_number for revision in offer.revisions), default=0)
    offer.draft_revision_number = max(highest_revision + 1, offer.draft_revision_number + 1)
    offer.status = OfferStatus.DRAFT
    offer.token_revoked_at = datetime.now(UTC)
    offer.approved_by_id = None
    offer.issued_at = None
    offer.expires_at = None
    offer.viewed_at = None
    offer.responded_at = None
    offer.accepted_at = None
    offer.rejected_at = None
    offer.withdrawn_at = None
    offer.withdrawal_reason = None
    offer.response = None
    offer.rejection_reason = None
    offer.accepted_revision_id = None
    record_event(
        db,
        offer,
        event_type="REVISION_STARTED",
        from_status=from_status,
        to_status=OfferStatus.DRAFT,
        user=user,
        note=reason or f"Revision {offer.draft_revision_number} started.",
        metadata={"new_revision": offer.draft_revision_number},
    )
    record_audit(
        db,
        action="offer.revision_started",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"revision": offer.draft_revision_number},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return serialize_detail(offer)


def regenerate_link(
    db: Session, offer_id: uuid.UUID, user: User, request=None
) -> dict[str, Any]:
    offer = get_offer(db, offer_id, lock=True)
    if offer.status not in ISSUED_LIKE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATUS", "message": "A secure link can only be regenerated for an open offer."},
        )
    raw_token, token_hash = generate_offer_token()
    offer.secure_token_hash = token_hash
    offer.token_created_at = datetime.now(UTC)
    offer.token_revoked_at = None
    url = candidate_offer_url(raw_token)
    record_event(
        db,
        offer,
        event_type="LINK_REGENERATED",
        user=user,
        note="Secure candidate link regenerated. The previous link was revoked.",
    )
    email_status = notify_offer_issued(db, offer, url, revised=offer.draft_revision_number > 1)
    record_audit(
        db,
        action="offer.link_regenerated",
        entity_type="offer",
        entity_id=offer.id,
        user=user,
        metadata={"email_status": email_status},
        request=request,
    )
    db.commit()
    db.refresh(offer)
    return {
        "offer": serialize_detail(offer),
        "secure_link": url,
        "email_status": email_status,
        "message": "A new secure link was created. The previous link no longer works.",
    }


def preview_offer(db: Session, offer_id: uuid.UUID) -> str:
    offer = get_offer(db, offer_id)
    if offer.current_revision and offer.status not in EDITABLE:
        return offer.current_revision.rendered_html
    snapshot = _snapshot_for_offer(db, offer)
    return render_snapshot_html(snapshot)


def offer_pdf(db: Session, offer_id: uuid.UUID) -> tuple[bytes, str]:
    offer = get_offer(db, offer_id)
    candidate_name = offer.candidate.full_name if offer.candidate else "Candidate"
    if offer.current_revision and offer.status not in EDITABLE:
        revision = offer.current_revision
        display_id = revision.official_offer_number or offer.official_offer_number or offer.offer_number
        filename = documents.pdf_download_filename(display_id, candidate_name)
        if revision.pdf_path:
            try:
                return read_pdf(revision.pdf_path), filename
            except Exception:  # noqa: BLE001 - regenerate a missing private document
                pass
        pdf = documents.render_pdf(revision.rendered_html)
        path = save_pdf(offer.id, revision.revision_number, pdf)
        revision.pdf_path = path
        if not revision.pdf_sha256:
            revision.pdf_sha256 = sha256_bytes(pdf)
            revision.pdf_size_bytes = len(pdf)
        db.commit()
        return pdf, filename
    snapshot = _snapshot_for_offer(db, offer)
    html_content = render_snapshot_html(snapshot)
    try:
        pdf = documents.render_pdf(html_content)
    except DocumentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PDF_RENDER_FAILED", "message": str(exc)},
        ) from exc
    return pdf, documents.pdf_download_filename(f"{offer.offer_number}-draft", candidate_name)


def revision_pdf(db: Session, offer_id: uuid.UUID, revision_id: uuid.UUID) -> tuple[bytes, str]:
    offer = get_offer(db, offer_id)
    revision = db.get(OfferRevision, revision_id)
    if not revision or revision.offer_id != offer.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "REVISION_NOT_FOUND", "message": "That revision does not exist."},
        )
    candidate_name = offer.candidate.full_name if offer.candidate else "Candidate"
    display_id = revision.official_offer_number or offer.official_offer_number or offer.offer_number
    filename = documents.pdf_download_filename(display_id, candidate_name)
    if revision.pdf_path:
        try:
            return read_pdf(revision.pdf_path), filename
        except Exception:  # noqa: BLE001
            pass
    pdf = documents.render_pdf(revision.rendered_html)
    path = save_pdf(offer.id, revision.revision_number, pdf)
    revision.pdf_path = path
    if not revision.pdf_sha256:
        revision.pdf_sha256 = sha256_bytes(pdf)
        revision.pdf_size_bytes = len(pdf)
    db.commit()
    return pdf, filename


def expire_stale_offers(db: Session) -> int:
    now = datetime.now(UTC)
    offers = db.scalars(
        select(Offer).where(
            Offer.status.in_(list(ISSUED_LIKE)),
            Offer.expires_at.is_not(None),
            Offer.expires_at < now,
        )
    ).all()
    for offer in offers:
        offer.status = OfferStatus.EXPIRED
        offer.token_revoked_at = now
        active_verifications = db.scalars(
            select(OfferVerification).where(
                OfferVerification.offer_id == offer.id,
                OfferVerification.status == VerificationStatus.VALID.value,
            )
        ).all()
        for verif in active_verifications:
            verif.status = VerificationStatus.EXPIRED.value
        record_event(
            db,
            offer,
            event_type="EXPIRED",
            from_status=OfferStatus.ISSUED,
            to_status=OfferStatus.EXPIRED,
            actor_type=ActorType.SYSTEM,
            actor_name="System",
            note="The offer validity window elapsed without a response.",
        )
        notify_offer_expired(db, offer)
        record_audit(
            db,
            action="offer.expired",
            entity_type="offer",
            entity_id=offer.id,
            actor_email="system",
            metadata={"expired_at": now.isoformat()},
        )
    if offers:
        db.commit()
    return len(offers)


def send_expiry_reminders(db: Session, within_days: int = 3) -> int:
    now = datetime.now(UTC)
    threshold = now + timedelta(days=within_days)
    offers = db.scalars(
        select(Offer).where(
            Offer.status.in_(list(ISSUED_LIKE)),
            Offer.expires_at.is_not(None),
            Offer.expires_at > now,
            Offer.expires_at <= threshold,
        )
    ).all()
    count = 0
    for offer in offers:
        already_sent = any(
            event.event_type == "EXPIRING_NOTIFIED"
            and (event.event_metadata or {}).get("revision") == offer.draft_revision_number
            for event in offer.events
        )
        if already_sent:
            continue
        from app.services.notifications import notify_offer_expiring

        notify_offer_expiring(db, offer, max(1, (offer.expires_at - now).days))
        record_event(
            db,
            offer,
            event_type="EXPIRING_NOTIFIED",
            actor_type=ActorType.SYSTEM,
            actor_name="System",
            note=f"Expiry reminder sent for revision {offer.draft_revision_number}.",
            metadata={"revision": offer.draft_revision_number},
        )
        count += 1
    if count:
        db.commit()
    return count


def _public_offer(db: Session, token: str, *, lock: bool = False) -> tuple[Offer, CompanyProfile]:
    if not token or len(token) < 20 or len(token) > 200:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "OFFER_NOT_FOUND", "message": "This offer link is not valid."},
        )
    statement = select(Offer).where(Offer.secure_token_hash == hash_offer_token(token))
    if lock:
        statement = statement.with_for_update(of=Offer)
    offer = db.scalars(statement).first()
    company = get_company(db)
    if not offer:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "OFFER_NOT_FOUND", "message": "This offer link is not valid."},
        )
    if offer.token_revoked_at or offer.status == OfferStatus.WITHDRAWN:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "OFFER_UNAVAILABLE",
                "message": "This offer link has been withdrawn. Contact the company for help.",
                "company_name": company.name,
            },
        )
    if offer.status in {OfferStatus.DRAFT, OfferStatus.PENDING_APPROVAL, OfferStatus.APPROVED}:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "OFFER_NOT_FOUND", "message": "This offer link is not valid."},
        )
    now = datetime.now(UTC)
    if offer.status in ISSUED_LIKE and offer.expires_at and offer.expires_at < now:
        offer.status = OfferStatus.EXPIRED
        offer.token_revoked_at = now
        record_event(
            db,
            offer,
            event_type="EXPIRED",
            from_status=OfferStatus.ISSUED,
            to_status=OfferStatus.EXPIRED,
            actor_type=ActorType.SYSTEM,
            actor_name="System",
            note="The offer validity window elapsed.",
        )
        notify_offer_expired(db, offer)
        db.commit()
    if offer.status == OfferStatus.EXPIRED:
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={
                "code": "OFFER_EXPIRED",
                "message": "This offer expired before a response was recorded. Contact the company for help.",
                "company_name": company.name,
            },
        )
    return offer, company


def get_public_offer(db: Session, token: str, request=None) -> dict[str, Any]:
    offer, company = _public_offer(db, token)
    now = datetime.now(UTC)
    offer.token_last_used_at = now
    if offer.status in {OfferStatus.ISSUED, OfferStatus.REISSUED}:
        offer.status = OfferStatus.VIEWED
        offer.viewed_at = now
        record_event(
            db,
            offer,
            event_type="VIEWED",
            from_status=OfferStatus.ISSUED,
            to_status=OfferStatus.VIEWED,
            actor_type=ActorType.CANDIDATE,
            actor_name=offer.candidate.full_name,
            note="Candidate opened the secure offer portal.",
            metadata={
                "ip": request.client.host if request and request.client else None,
                "user_agent": (request.headers.get("user-agent") or "")[:300] if request else None,
            },
        )
        notify_offer_viewed(db, offer)
    db.commit()
    db.refresh(offer)
    return serialize_public(offer, company)


def serialize_public(offer: Offer, company: CompanyProfile) -> dict[str, Any]:
    data = offer.data or {}
    employment = data.get("employment") or {}
    compensation = data.get("compensation") or {}
    terms = data.get("terms") or {}
    now = datetime.now(UTC)
    return {
        "reference": offer.offer_number,
        "status": offer.status.value,
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
            "logo_url": company.logo_url or "/brand/logo.png",
            "primary_color": company.primary_color,
            "accent_color": company.accent_color,
            "signatory_name": company.signatory_name,
            "signatory_title": company.signatory_title,
        },
        "candidate_name": offer.candidate.full_name,
        "position": employment.get("job_title") or "",
        "department": employment.get("department"),
        "employment_type": employment.get("employment_type") or "",
        "joining_date": employment.get("joining_date"),
        "work_location": employment.get("work_location"),
        "reporting_manager": employment.get("reporting_manager"),
        "working_days": employment.get("working_days"),
        "working_hours": employment.get("working_hours"),
        "joining_instructions": terms.get("joining_requirements"),
        "offer_date": offer.issued_at,
        "expires_at": offer.expires_at,
        "response": offer.response.value if offer.response else None,
        "responded_at": offer.responded_at,
        "compensation": compensation,
        "training_policy": offer.training_policy or data.get("training_policy"),
        "include_training_policy": bool(
            data.get("include_training_policy")
            or data.get("compensation_mode") == "TRAINING_PROGRESSION"
            or (offer.training_policy or {}).get("enabled")
            or (data.get("training_policy") or {}).get("enabled")
        ),
        "compensation_mode": data.get(
            "compensation_mode",
            "TRAINING_PROGRESSION"
            if ((offer.training_policy or {}).get("enabled") or (data.get("training_policy") or {}).get("enabled"))
            else "STANDARD",
        ),
        "has_responded": offer.response is not None,
        "is_expired": offer.status == OfferStatus.EXPIRED
        or bool(offer.expires_at and offer.expires_at < now),
        "pdf_available": bool(offer.current_revision and offer.current_revision.pdf_path)
        and offer.status not in {OfferStatus.WITHDRAWN, OfferStatus.EXPIRED},
        "revision_number": _current_revision_number(offer),
    }


def public_preview(db: Session, token: str) -> str:
    offer, _ = _public_offer(db, token)
    if not offer.current_revision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": "The offer document is not available."},
        )
    return offer.current_revision.rendered_html


def public_pdf(db: Session, token: str) -> tuple[bytes, str]:
    offer, _ = _public_offer(db, token)
    if not offer.current_revision:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": "The offer document is not available."},
        )
    revision = offer.current_revision
    candidate_name = offer.candidate.full_name if offer.candidate else "Candidate"
    display_id = revision.official_offer_number or offer.official_offer_number or offer.offer_number
    filename = documents.pdf_download_filename(display_id, candidate_name)
    offer.token_last_used_at = datetime.now(UTC)
    if revision.pdf_path:
        try:
            content = read_pdf(revision.pdf_path)
            db.commit()
            return content, filename
        except Exception:  # noqa: BLE001 - regenerate if ephemeral disk was cleared
            pass
    try:
        content = documents.render_pdf(revision.rendered_html)
        revision.pdf_path = save_pdf(offer.id, revision.revision_number, content)
    except Exception as exc:  # noqa: BLE001
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": "The offer document is not available."},
        ) from exc
    db.commit()
    return content, filename


def accept_public_offer(
    db: Session, token: str, *, typed_name: str | None, ip: str | None, agent: str | None
) -> dict[str, Any]:
    offer, _ = _public_offer(db, token, lock=True)
    if offer.status in RESPONDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_RESPONDED", "message": "A response has already been recorded for this offer."},
        )
    if offer.status not in ISSUED_LIKE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATUS", "message": "This offer cannot be accepted in its current state."},
        )
    now = datetime.now(UTC)
    if not offer.expires_at or offer.expires_at < now:
        offer.status = OfferStatus.EXPIRED
        offer.token_revoked_at = now
        record_event(
            db,
            offer,
            event_type="EXPIRED",
            from_status=OfferStatus.ISSUED,
            to_status=OfferStatus.EXPIRED,
            actor_type=ActorType.SYSTEM,
            actor_name="System",
            note="The offer expired before acceptance.",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "OFFER_EXPIRED", "message": "This offer has expired."},
        )
    offer.status = OfferStatus.ACCEPTED
    offer.response = ResponseType.ACCEPTED
    offer.responded_at = now
    offer.accepted_at = now
    offer.accepted_revision_id = offer.current_revision_id
    record_event(
        db,
        offer,
        event_type="ACCEPTED",
        from_status=OfferStatus.VIEWED if offer.viewed_at else OfferStatus.ISSUED,
        to_status=OfferStatus.ACCEPTED,
        actor_type=ActorType.CANDIDATE,
        actor_name=offer.candidate.full_name,
        note="Candidate accepted the offer through the secure portal.",
        metadata={
            "revision": _current_revision_number(offer),
            "typed_name": typed_name,
            "ip": ip,
            "user_agent": (agent or "")[:300],
            "acknowledgement": "Candidate confirmed they read and understood the offer. Not a digital signature certificate.",
        },
    )
    notify_offer_accepted(db, offer)
    record_audit(
        db,
        action="offer.accepted",
        entity_type="offer",
        entity_id=offer.id,
        actor_email=offer.candidate.email or offer.candidate.full_name,
        metadata={"revision": _current_revision_number(offer)},
    )
    db.commit()
    return {
        "status": offer.status.value,
        "message": "Your acceptance has been recorded. The company has been notified.",
        "responded_at": offer.responded_at,
    }


def reject_public_offer(
    db: Session, token: str, *, reason: str | None, ip: str | None, agent: str | None
) -> dict[str, Any]:
    offer, _ = _public_offer(db, token, lock=True)
    if offer.status in RESPONDED:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "ALREADY_RESPONDED", "message": "A response has already been recorded for this offer."},
        )
    if offer.status not in ISSUED_LIKE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "INVALID_STATUS", "message": "This offer cannot be declined in its current state."},
        )
    now = datetime.now(UTC)
    if not offer.expires_at or offer.expires_at < now:
        offer.status = OfferStatus.EXPIRED
        offer.token_revoked_at = now
        record_event(
            db,
            offer,
            event_type="EXPIRED",
            from_status=OfferStatus.ISSUED,
            to_status=OfferStatus.EXPIRED,
            actor_type=ActorType.SYSTEM,
            actor_name="System",
            note="The offer expired before a response.",
        )
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail={"code": "OFFER_EXPIRED", "message": "This offer has expired."},
        )
    offer.status = OfferStatus.REJECTED
    offer.response = ResponseType.REJECTED
    offer.responded_at = now
    offer.rejected_at = now
    offer.rejection_reason = reason
    record_event(
        db,
        offer,
        event_type="REJECTED",
        from_status=OfferStatus.VIEWED if offer.viewed_at else OfferStatus.ISSUED,
        to_status=OfferStatus.REJECTED,
        actor_type=ActorType.CANDIDATE,
        actor_name=offer.candidate.full_name,
        note=reason or "Candidate declined the offer.",
        metadata={
            "revision": _current_revision_number(offer),
            "ip": ip,
            "user_agent": (agent or "")[:300],
        },
    )
    notify_offer_rejected(db, offer)
    record_audit(
        db,
        action="offer.rejected",
        entity_type="offer",
        entity_id=offer.id,
        actor_email=offer.candidate.email or offer.candidate.full_name,
        metadata={"revision": _current_revision_number(offer)},
    )
    db.commit()
    return {
        "status": offer.status.value,
        "message": "Your response has been recorded. The company has been notified.",
        "responded_at": offer.responded_at,
    }
