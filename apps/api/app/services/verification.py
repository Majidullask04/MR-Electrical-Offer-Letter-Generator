from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.models import Offer, OfferStatus, OfferVerification, VerificationStatus
from app.schemas.verify import VerifyLookupRequest
from app.security import hash_offer_token, sha256_bytes
from app.services.offers import get_company

INVALID_MESSAGE = "This offer letter could not be verified in the official MR. ELECTRICAL WORKS records."
REVOKED_MESSAGE = "This offer letter was issued previously but has been revoked by the authorized company administrator."
EXPIRED_MESSAGE = "This offer letter has passed its validity period."
SUPERSEDED_MESSAGE = "This offer has been replaced by a newer official version."
MODIFIED_MESSAGE = "The uploaded PDF does not match the original digitally issued document."


def _build_record(
    verif: OfferVerification,
    company_name: str,
    *,
    now: datetime,
) -> dict[str, Any]:
    offer = verif.offer
    snapshot = verif.revision.snapshot if verif.revision else {}
    employment = snapshot.get("employment") or (offer.data or {}).get("employment") or {}
    candidate_snap = snapshot.get("candidate") or {}
    candidate_name = candidate_snap.get("full_name") or (offer.candidate.full_name if offer.candidate else "Candidate")

    joining_raw = employment.get("joining_date")
    joining_date: date | None = None
    if isinstance(joining_raw, str):
        try:
            joining_date = date.fromisoformat(joining_raw[:10])
        except ValueError:
            joining_date = None
    elif isinstance(joining_raw, date):
        joining_date = joining_raw

    return {
        "offer_id": verif.offer_number,
        "draft_reference": verif.draft_reference,
        "company_name": company_name,
        "candidate_name": candidate_name,
        "designation": employment.get("job_title") or "—",
        "department": employment.get("department") or None,
        "issue_date": verif.revision.issued_at if verif.revision else offer.issued_at,
        "joining_date": joining_date,
        "expires_at": offer.expires_at,
        "lifecycle_status": offer.status.value,
        "revision_number": verif.revision.revision_number if verif.revision else 1,
        "verification_status": verif.status,
        "verified_at": now,
        "verified_count": verif.verified_count,
        "revoked_reason": verif.revoked_reason if verif.status == VerificationStatus.REVOKED.value else None,
    }


def _evaluate_verdict(
    db: Session,
    verif: OfferVerification,
    company_name: str,
    *,
    pdf_integrity: str = "NOT_CHECKED",
    uploaded_sha256: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    offer = verif.offer
    if (
        offer.status in {OfferStatus.ISSUED, OfferStatus.VIEWED, OfferStatus.REISSUED}
        and offer.expires_at
        and offer.expires_at < now
    ):
        offer.status = OfferStatus.EXPIRED

    verif.verified_count += 1
    verif.last_verified_at = now
    db.commit()
    db.refresh(verif)

    record = _build_record(verif, company_name, now=now)

    if verif.status == VerificationStatus.REVOKED.value or offer.status == OfferStatus.WITHDRAWN:
        return {
            "verdict": "REVOKED",
            "headline": "REVOKED — OFFER WITHDRAWN",
            "message": REVOKED_MESSAGE,
            "pdf_integrity": pdf_integrity,
            "uploaded_sha256": uploaded_sha256,
            "official_sha256": verif.pdf_sha256 if pdf_integrity != "NOT_CHECKED" else None,
            "record": record,
        }

    if verif.status == VerificationStatus.SUPERSEDED.value or offer.status == OfferStatus.SUPERSEDED:
        return {
            "verdict": "SUPERSEDED",
            "headline": "SUPERSEDED — NEWER VERSION ISSUED",
            "message": SUPERSEDED_MESSAGE,
            "pdf_integrity": pdf_integrity,
            "uploaded_sha256": uploaded_sha256,
            "official_sha256": verif.pdf_sha256 if pdf_integrity != "NOT_CHECKED" else None,
            "record": record,
        }

    snapshot = verif.revision.snapshot if verif.revision else {}
    snap_expires_raw = (snapshot.get("offer") or {}).get("expires_at")
    snap_expired = False
    if isinstance(snap_expires_raw, str):
        try:
            snap_expired = datetime.fromisoformat(snap_expires_raw.replace("Z", "+00:00")) < now
        except ValueError:
            snap_expired = False

    if (
        verif.status == VerificationStatus.EXPIRED.value
        or offer.status == OfferStatus.EXPIRED
        or (offer.expires_at and offer.expires_at < now)
        or snap_expired
    ):
        return {
            "verdict": "EXPIRED",
            "headline": "EXPIRED — VALIDITY PERIOD ELAPSED",
            "message": EXPIRED_MESSAGE,
            "pdf_integrity": pdf_integrity,
            "uploaded_sha256": uploaded_sha256,
            "official_sha256": verif.pdf_sha256 if pdf_integrity != "NOT_CHECKED" else None,
            "record": record,
        }

    return {
        "verdict": "VALID",
        "headline": f"VERIFIED — OFFICIAL {company_name} OFFER LETTER",
        "message": (
            f"This offer letter is an authentic document issued by {company_name}. "
            f"Current lifecycle status: {offer.status.value}."
        ),
        "pdf_integrity": pdf_integrity,
        "uploaded_sha256": uploaded_sha256,
        "official_sha256": verif.pdf_sha256 if pdf_integrity != "NOT_CHECKED" else None,
        "record": record,
    }


def _invalid_result(
    *,
    pdf_integrity: str = "NOT_CHECKED",
    uploaded_sha256: str | None = None,
) -> dict[str, Any]:
    return {
        "verdict": "INVALID",
        "headline": "UNVERIFIED OFFER LETTER",
        "message": INVALID_MESSAGE,
        "pdf_integrity": pdf_integrity,
        "uploaded_sha256": uploaded_sha256,
        "official_sha256": None,
        "record": None,
    }


def verify_by_token(db: Session, token: str) -> dict[str, Any]:
    if not token or len(token) < 20 or len(token) > 200:
        return _invalid_result()
    token_hash = hash_offer_token(token)
    verif = db.scalars(
        select(OfferVerification).where(OfferVerification.verification_token_hash == token_hash)
    ).first()
    if not verif:
        return _invalid_result()
    company = get_company(db)
    return _evaluate_verdict(db, verif, company.name)


def _match_lookup_second_factor(verif: OfferVerification, payload: VerifyLookupRequest) -> bool:
    offer = verif.offer
    snapshot = verif.revision.snapshot if verif.revision else {}
    cand_snap = snapshot.get("candidate") or {}
    registered_email = (cand_snap.get("email") or (offer.candidate.email if offer.candidate else "") or "").strip().lower()
    if registered_email:
        return bool(payload.candidate_email and payload.candidate_email.strip().lower() == registered_email)

    candidate_name = (cand_snap.get("full_name") or (offer.candidate.full_name if offer.candidate else "") or "").strip().lower()
    employment = snapshot.get("employment") or (offer.data or {}).get("employment") or {}
    joining_raw = str(employment.get("joining_date") or "")[:10]
    return bool(
        payload.candidate_name
        and payload.joining_date
        and payload.candidate_name.strip().lower() == candidate_name
        and payload.joining_date.isoformat() == joining_raw
    )


def verify_by_lookup(db: Session, payload: VerifyLookupRequest) -> dict[str, Any]:
    term = payload.offer_id.strip().lower()
    verif = db.scalars(
        select(OfferVerification)
        .where(
            or_(
                func.lower(OfferVerification.offer_number) == term,
                func.lower(OfferVerification.draft_reference) == term,
            )
        )
        .order_by(OfferVerification.created_at.desc())
        .limit(1)
    ).first()
    if not verif:
        return _invalid_result()
    if not _match_lookup_second_factor(verif, payload):
        return _invalid_result()
    company = get_company(db)
    return _evaluate_verdict(db, verif, company.name)


def verify_uploaded_pdf(
    db: Session,
    pdf_bytes: bytes,
    *,
    offer_id: str | None = None,
    token: str | None = None,
    candidate_email: str | None = None,
) -> dict[str, Any]:
    uploaded_sha256 = sha256_bytes(pdf_bytes)
    company = get_company(db)

    if token:
        if len(token) < 20 or len(token) > 200:
            return _invalid_result(pdf_integrity="UNMATCHED", uploaded_sha256=uploaded_sha256)
        verif = db.scalars(
            select(OfferVerification).where(
                OfferVerification.verification_token_hash == hash_offer_token(token)
            )
        ).first()
        if not verif:
            return _invalid_result(pdf_integrity="UNMATCHED", uploaded_sha256=uploaded_sha256)
        if verif.pdf_sha256 == uploaded_sha256:
            return _evaluate_verdict(
                db, verif, company.name, pdf_integrity="MATCHED", uploaded_sha256=uploaded_sha256
            )
        now = datetime.now(UTC)
        return {
            "verdict": "MODIFIED_DOCUMENT",
            "headline": "MODIFIED DOCUMENT — HASH MISMATCH",
            "message": MODIFIED_MESSAGE,
            "pdf_integrity": "MODIFIED",
            "uploaded_sha256": uploaded_sha256,
            "official_sha256": verif.pdf_sha256,
            "record": _build_record(verif, company.name, now=now),
        }

    if offer_id:
        term = offer_id.strip().lower()
        verifs = db.scalars(
            select(OfferVerification)
            .where(
                or_(
                    func.lower(OfferVerification.offer_number) == term,
                    func.lower(OfferVerification.draft_reference) == term,
                )
            )
            .order_by(OfferVerification.created_at.desc())
        ).all()
        if not verifs:
            return _invalid_result(pdf_integrity="UNMATCHED", uploaded_sha256=uploaded_sha256)
        matched = next((v for v in verifs if v.pdf_sha256 == uploaded_sha256), None)
        if matched:
            return _evaluate_verdict(
                db, matched, company.name, pdf_integrity="MATCHED", uploaded_sha256=uploaded_sha256
            )
        latest = verifs[0]
        record = None
        if candidate_email:
            snapshot = latest.revision.snapshot if latest.revision else {}
            reg_email = (
                (snapshot.get("candidate") or {}).get("email")
                or (latest.offer.candidate.email if latest.offer.candidate else "")
                or ""
            ).strip().lower()
            if reg_email and reg_email == candidate_email.strip().lower():
                record = _build_record(latest, company.name, now=datetime.now(UTC))
        return {
            "verdict": "MODIFIED_DOCUMENT",
            "headline": "MODIFIED DOCUMENT — HASH MISMATCH",
            "message": MODIFIED_MESSAGE,
            "pdf_integrity": "MODIFIED",
            "uploaded_sha256": uploaded_sha256,
            "official_sha256": latest.pdf_sha256 if record else None,
            "record": record,
        }

    # Hash-only verification (no token or Offer ID provided)
    matched = db.scalars(
        select(OfferVerification)
        .where(OfferVerification.pdf_sha256 == uploaded_sha256)
        .order_by(OfferVerification.created_at.desc())
        .limit(1)
    ).first()
    if matched:
        return _evaluate_verdict(
            db, matched, company.name, pdf_integrity="MATCHED", uploaded_sha256=uploaded_sha256
        )
    return {
        "verdict": "MODIFIED_DOCUMENT",
        "headline": "UNRECOGNIZED OR MODIFIED DOCUMENT",
        "message": MODIFIED_MESSAGE,
        "pdf_integrity": "UNMATCHED",
        "uploaded_sha256": uploaded_sha256,
        "official_sha256": None,
        "record": None,
    }
