from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings

OFFERS_DIR = "offers"
OUTBOX_DIR = "outbox"


class StorageError(ValueError):
    pass


def _root() -> Path:
    root = settings.storage_path
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def _safe_path(relative: str) -> Path:
    root = _root()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise StorageError("Invalid storage path.") from exc
    return candidate


def save_pdf(offer_id: uuid.UUID, revision_number: int, content: bytes) -> str:
    relative = f"{OFFERS_DIR}/{offer_id}/revision-{revision_number}.pdf"
    path = _safe_path(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return relative


def read_pdf(relative: str) -> bytes:
    path = _safe_path(relative)
    if not path.exists():
        raise StorageError("The document is not available.")
    return path.read_bytes()


def pdf_path(relative: str) -> Path:
    path = _safe_path(relative)
    if not path.exists():
        raise StorageError("The document is not available.")
    return path


def save_outbox_email(recipient: str, subject: str, html_body: str) -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    safe_recipient = "".join(char if char.isalnum() or char in "@.-" else "_" for char in recipient)
    relative = f"{OUTBOX_DIR}/{timestamp}-{safe_recipient}.html"
    path = _safe_path(relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    wrapper = (
        "<!doctype html><html><head><meta charset='utf-8'>"
        f"<title>{subject}</title></head><body style='margin:0;padding:24px;background:#F4F5F7'>"
        "<div style='max-width:680px;margin:0 auto;background:#fff;border:1px solid #D7DBE0;"
        "padding:20px 24px;font-family:sans-serif;color:#5C6470;font-size:12px'>"
        f"<p><strong>To:</strong> {recipient}<br><strong>Subject:</strong> {subject}</p>"
        "<p>Development outbox preview. No email was sent.</p></div>"
        f"{html_body}</body></html>"
    )
    path.write_text(wrapper, encoding="utf-8")
    return relative
