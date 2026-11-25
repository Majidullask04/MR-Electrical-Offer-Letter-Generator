from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import EmailNotification, Offer, User
from app.security import ROLE_HIRING_MANAGER, ROLE_HR_MANAGER, ROLE_SUPER_ADMIN
from app.services import email as email_templates
from app.services.documents import format_date
from app.services.email import EmailProviderError, get_provider

logger = logging.getLogger("offerlater.email")


def _recipients(db: Session, role_keys: set[str], *, include_company_email: bool = True) -> list[str]:
    emails: set[str] = set()
    if include_company_email:
        from app.services.offers import get_company  # local import avoids a cycle

        company = get_company(db)
        if company.email and "@" in company.email:
            emails.add(company.email.lower())
    for user in db.scalars(select(User).where(User.is_active.is_(True))):
        if user.role_keys.intersection(role_keys) and "@" in user.email:
            emails.add(user.email.lower())
    return sorted(emails)


def queue_email(
    db: Session,
    *,
    recipient: str,
    template_key: str,
    subject: str,
    html_body: str,
    offer_id=None,
) -> EmailNotification:
    provider = get_provider()
    notification = EmailNotification(
        offer_id=offer_id,
        recipient=recipient,
        template_key=template_key,
        subject=subject,
        html_body=html_body,
        provider=provider.name,
        status="queued",
    )
    try:
        status = provider.send(recipient, subject, html_body)
        notification.status = status
        if status == "sent":
            notification.sent_at = datetime.now(UTC)
    except EmailProviderError as exc:
        notification.status = "failed"
        notification.error = str(exc)[:2000]
        logger.warning("Email delivery failed for %s: %s", template_key, exc)
    except Exception as exc:  # noqa: BLE001 - email must never break an offer action
        notification.status = "failed"
        notification.error = str(exc)[:2000]
        logger.exception("Unexpected email failure for %s", template_key)
    db.add(notification)
    return notification


def _deliver_many(
    db: Session,
    recipients: list[str],
    template_key: str,
    subject: str,
    html_body: str,
    offer_id=None,
) -> str:
    statuses = []
    for recipient in recipients:
        notification = queue_email(
            db,
            recipient=recipient,
            template_key=template_key,
            subject=subject,
            html_body=html_body,
            offer_id=offer_id,
        )
        statuses.append(notification.status)
    if not statuses:
        return "skipped"
    if all(status == "sent" for status in statuses):
        return "sent"
    if all(status == "logged" for status in statuses):
        return "logged"
    if any(status in {"sent", "logged"} for status in statuses):
        return "partial"
    return "failed"


def notify_offer_issued(db: Session, offer: Offer, url: str, *, revised: bool = False) -> str:
    if not offer.candidate.email:
        return "skipped"
    expiry = format_date(offer.expires_at)
    offer_ref = offer.official_offer_number or offer.offer_number
    if revised:
        subject, body = email_templates.offer_reissued_email(
            offer.candidate.full_name,
            offer.data["employment"]["job_title"],
            offer_ref,
            url,
            expiry,
        )
        key = "offer_reissued"
    else:
        subject, body = email_templates.offer_issued_email(
            offer.candidate.full_name,
            offer.data["employment"]["job_title"],
            offer_ref,
            url,
            expiry,
        )
        key = "offer_issued"
    return _deliver_many(db, [offer.candidate.email], key, subject, body, offer.id)


def notify_offer_viewed(db: Session, offer: Offer) -> str:
    subject, body = email_templates.offer_viewed_email(
        offer.offer_number,
        offer.candidate.full_name,
        datetime.now(UTC).strftime("%d %B %Y, %H:%M UTC"),
    )
    recipients = _recipients(db, {ROLE_HR_MANAGER, ROLE_SUPER_ADMIN})
    if offer.created_by and offer.created_by.email not in recipients:
        recipients.append(offer.created_by.email)
    return _deliver_many(db, recipients, "offer_viewed", subject, body, offer.id)


def notify_offer_accepted(db: Session, offer: Offer) -> str:
    subject, body = email_templates.offer_accepted_email(
        offer.offer_number,
        offer.candidate.full_name,
        offer.data["employment"]["job_title"],
        datetime.now(UTC).strftime("%d %B %Y, %H:%M UTC"),
    )
    recipients = _recipients(db, {ROLE_HR_MANAGER, ROLE_SUPER_ADMIN})
    if offer.created_by and offer.created_by.email not in recipients:
        recipients.append(offer.created_by.email)
    return _deliver_many(db, recipients, "offer_accepted", subject, body, offer.id)


def notify_offer_rejected(db: Session, offer: Offer) -> str:
    subject, body = email_templates.offer_rejected_email(
        offer.offer_number,
        offer.candidate.full_name,
        offer.data["employment"]["job_title"],
        datetime.now(UTC).strftime("%d %B %Y, %H:%M UTC"),
        offer.rejection_reason,
    )
    recipients = _recipients(db, {ROLE_HR_MANAGER, ROLE_SUPER_ADMIN})
    if offer.created_by and offer.created_by.email not in recipients:
        recipients.append(offer.created_by.email)
    return _deliver_many(db, recipients, "offer_rejected", subject, body, offer.id)


def notify_approval_required(db: Session, offer: Offer, requested_by: User) -> str:
    subject, body = email_templates.approval_required_email(
        offer.offer_number,
        offer.candidate.full_name,
        offer.data["employment"]["job_title"],
        requested_by.full_name,
    )
    recipients = _recipients(db, {ROLE_HIRING_MANAGER, ROLE_SUPER_ADMIN})
    if not recipients:
        recipients = _recipients(db, {ROLE_SUPER_ADMIN})
    return _deliver_many(db, recipients, "approval_required", subject, body, offer.id)


def notify_offer_expiring(db: Session, offer: Offer, days_left: int) -> str:
    subject, body = email_templates.offer_expiring_email(
        offer.offer_number, offer.candidate.full_name, format_date(offer.expires_at), days_left
    )
    recipients = _recipients(db, {ROLE_HR_MANAGER, ROLE_SUPER_ADMIN})
    return _deliver_many(db, recipients, "offer_expiring", subject, body, offer.id)


def notify_offer_expired(db: Session, offer: Offer) -> str:
    subject, body = email_templates.offer_expired_email(
        offer.offer_number, offer.candidate.full_name, format_date(offer.expires_at)
    )
    recipients = _recipients(db, {ROLE_HR_MANAGER, ROLE_SUPER_ADMIN})
    if offer.candidate.email and offer.candidate.email not in recipients:
        recipients.append(offer.candidate.email)
    return _deliver_many(db, recipients, "offer_expired", subject, body, offer.id)
