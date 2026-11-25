from __future__ import annotations

import html
import smtplib
import time
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from email.message import EmailMessage
from typing import Any

import httpx

MAX_SEND_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 1.0

from app.config import settings
from app.services.storage import save_outbox_email


class EmailProviderError(RuntimeError):
    pass


class EmailProvider(ABC):
    name: str

    @abstractmethod
    def send(self, recipient: str, subject: str, html_body: str) -> str:
        """Send an email and return the provider status label."""


class ConsoleEmailProvider(EmailProvider):
    name = "console"

    def send(self, recipient: str, subject: str, html_body: str) -> str:
        save_outbox_email(recipient, subject, html_body)
        return "logged"


class SMTPEmailProvider(EmailProvider):
    name = "smtp"

    def send(self, recipient: str, subject: str, html_body: str) -> str:
        if not settings.smtp_host:
            raise EmailProviderError("SMTP_HOST is not configured.")
        message = EmailMessage()
        message["From"] = settings.email_from
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content("This email contains HTML. Please use an HTML-capable mail client.")
        message.add_alternative(html_body, subtype="html")
        last_error: Exception | None = None
        for attempt in range(1, MAX_SEND_ATTEMPTS + 1):
            try:
                with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
                    if settings.smtp_use_tls:
                        smtp.starttls()
                    if settings.smtp_username:
                        smtp.login(settings.smtp_username, settings.smtp_password)
                    smtp.send_message(message)
                return "sent"
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt < MAX_SEND_ATTEMPTS:
                    time.sleep(RETRY_DELAY_SECONDS * attempt)
        raise EmailProviderError(str(last_error)) from last_error


class ResendEmailProvider(EmailProvider):
    name = "resend"

    def send(self, recipient: str, subject: str, html_body: str) -> str:
        if not settings.resend_api_key:
            raise EmailProviderError("RESEND_API_KEY is not configured.")
        last_error: Exception | None = None
        for attempt in range(1, MAX_SEND_ATTEMPTS + 1):
            try:
                response = httpx.post(
                    "https://api.resend.com/emails",
                    headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                    json={
                        "from": settings.email_from,
                        "to": [recipient],
                        "subject": subject,
                        "html": html_body,
                    },
                    timeout=20,
                )
                response.raise_for_status()
                return "sent"
            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if attempt < MAX_SEND_ATTEMPTS:
                    time.sleep(RETRY_DELAY_SECONDS * attempt)
        raise EmailProviderError(str(last_error)) from last_error


def get_provider() -> EmailProvider:
    provider = settings.email_provider.lower()
    if provider == "smtp":
        return SMTPEmailProvider()
    if provider == "resend":
        return ResendEmailProvider()
    return ConsoleEmailProvider()


BRAND = {
    "ink": "#121417",
    "muted": "#5C6470",
    "copper": "#B35010",
    "paper": "#FCFCFD",
    "border": "#D7DBE0",
}


def _layout(title: str, body: str, cta: tuple[str, str] | None = None) -> str:
    button = ""
    if cta:
        label, url = cta
        button = (
            f"<p style='margin:26px 0 8px'><a href='{html.escape(url)}' "
            f"style='background:{BRAND['copper']};color:#fff;text-decoration:none;"
            "padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block'>"
            f"{html.escape(label)}</a></p>"
            f"<p style='font-size:11px;color:{BRAND['muted']};word-break:break-all'>{html.escape(url)}</p>"
        )
    return f"""<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#F4F5F7;font-family:'Plus Jakarta Sans',Arial,sans-serif;color:{BRAND['ink']}">
  <div style="max-width:620px;margin:0 auto;padding:28px 16px">
    <div style="background:#121417;padding:20px 24px;border-radius:8px 8px 0 0">
      <div style="font-size:20px;font-weight:700;letter-spacing:-0.02em;color:#fff">MR. ELECTRICAL <span style="color:#E08A52">WORKS</span></div>
      <div style="font-size:11px;color:#B9BEC6;margin-top:4px">Turnkey electrical engineering and contracting</div>
    </div>
    <div style="background:#fff;border:1px solid {BRAND['border']};border-top:3px solid {BRAND['copper']};padding:28px 24px">
      <h1 style="font-size:22px;line-height:1.2;margin:0 0 14px;letter-spacing:-0.02em">{html.escape(title)}</h1>
      <div style="font-size:14px;line-height:1.6;color:#3B4048">{body}</div>
      {button}
    </div>
    <div style="padding:16px 4px;font-size:11px;line-height:1.5;color:{BRAND['muted']}">
      MR. ELECTRICAL WORKS, No. 83, Gokul Nagar, Patancheru, Hyderabad, Telangana 502319.<br>
      This is an automated message from OfferLater. Do not reply to this email.
    </div>
  </div>
</body></html>"""


def offer_issued_email(candidate_name: str, job_title: str, offer_number: str, url: str, expiry: str) -> tuple[str, str]:
    body = (
        f"<p>Dear {html.escape(candidate_name)},</p>"
        f"<p>Your offer for the position of <strong>{html.escape(job_title)}</strong> has been issued. "
        f"Reference <strong>{html.escape(offer_number)}</strong>.</p>"
        f"<p>Please review the full letter and respond before <strong>{html.escape(expiry)}</strong>. "
        "The secure link is unique to you; please do not forward it.</p>"
    )
    return f"Your offer from MR. ELECTRICAL WORKS: {job_title}", _layout("Your offer is ready", body, ("View your offer", url))


def offer_viewed_email(offer_number: str, candidate_name: str, when: str) -> tuple[str, str]:
    body = (
        f"<p>{html.escape(candidate_name)} viewed offer <strong>{html.escape(offer_number)}</strong> "
        f"on {html.escape(when)}.</p>"
        "<p>The offer remains open until the candidate responds or the offer expires.</p>"
    )
    return f"Offer viewed: {offer_number}", _layout("Candidate viewed the offer", body)


def offer_accepted_email(offer_number: str, candidate_name: str, job_title: str, when: str) -> tuple[str, str]:
    body = (
        f"<p><strong>{html.escape(candidate_name)}</strong> accepted the offer for "
        f"<strong>{html.escape(job_title)}</strong>.</p>"
        f"<p>Reference: {html.escape(offer_number)}<br>Accepted: {html.escape(when)}</p>"
        "<p>Review the offer in OfferLater and begin the joining process.</p>"
    )
    return f"Offer accepted: {candidate_name} ({offer_number})", _layout("Offer accepted", body)


def offer_rejected_email(offer_number: str, candidate_name: str, job_title: str, when: str, reason: str | None) -> tuple[str, str]:
    reason_html = f"<p><strong>Candidate's reason:</strong> {html.escape(reason)}</p>" if reason else ""
    body = (
        f"<p><strong>{html.escape(candidate_name)}</strong> declined the offer for "
        f"<strong>{html.escape(job_title)}</strong>.</p>"
        f"<p>Reference: {html.escape(offer_number)}<br>Declined: {html.escape(when)}</p>{reason_html}"
        "<p>You can open the offer record to review the response and decide the next step.</p>"
    )
    return f"Offer declined: {candidate_name} ({offer_number})", _layout("Offer declined", body)


def approval_required_email(offer_number: str, candidate_name: str, job_title: str, requested_by: str) -> tuple[str, str]:
    body = (
        f"<p>{html.escape(requested_by)} submitted an offer for approval.</p>"
        f"<p><strong>{html.escape(candidate_name)}</strong> for <strong>{html.escape(job_title)}</strong>.<br>"
        f"Reference: {html.escape(offer_number)}</p>"
        "<p>Open the approvals queue to review the letter, compensation and terms.</p>"
    )
    return f"Approval required: {offer_number}", _layout("An offer needs your approval", body)


def offer_expiring_email(offer_number: str, candidate_name: str, expiry: str, days_left: int) -> tuple[str, str]:
    body = (
        f"<p>Offer <strong>{html.escape(offer_number)}</strong> for {html.escape(candidate_name)} "
        f"expires on <strong>{html.escape(expiry)}</strong> ({days_left} day(s) remaining).</p>"
        "<p>No action is needed if the candidate has already responded.</p>"
    )
    return f"Offer expiring soon: {offer_number}", _layout("Offer approaching expiry", body)


def offer_expired_email(offer_number: str, candidate_name: str, expiry: str) -> tuple[str, str]:
    body = (
        f"<p>Offer <strong>{html.escape(offer_number)}</strong> for {html.escape(candidate_name)} "
        f"expired on {html.escape(expiry)} without a response.</p>"
        "<p>The candidate link is now closed. You can withdraw and reissue the offer if appropriate.</p>"
    )
    return f"Offer expired: {offer_number}", _layout("Offer expired", body)


def offer_reissued_email(candidate_name: str, job_title: str, offer_number: str, url: str, expiry: str) -> tuple[str, str]:
    body = (
        f"<p>Dear {html.escape(candidate_name)},</p>"
        f"<p>A revised offer for <strong>{html.escape(job_title)}</strong> is ready for you. "
        f"Reference <strong>{html.escape(offer_number)}</strong>.</p>"
        f"<p>Please review the current revision and respond before <strong>{html.escape(expiry)}</strong>.</p>"
    )
    return f"Revised offer from MR. ELECTRICAL WORKS: {job_title}", _layout("Your revised offer is ready", body, ("View the revised offer", url))
