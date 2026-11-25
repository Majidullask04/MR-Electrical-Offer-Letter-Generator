from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from datetime import UTC, datetime
from pathlib import Path

from app.config import settings

OFFERS_DIR = "offers"
OUTBOX_DIR = "outbox"


class StorageError(ValueError):
    pass


class StorageBackend(ABC):
    """Common interface for persisting offer documents."""

    name: str

    @abstractmethod
    def save_pdf(self, offer_id: uuid.UUID, revision_number: int, content: bytes) -> str: ...

    @abstractmethod
    def read_pdf(self, relative: str) -> bytes: ...

    @abstractmethod
    def pdf_path(self, relative: str) -> Path: ...

    @abstractmethod
    def save_outbox_email(self, recipient: str, subject: str, html_body: str) -> str: ...


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


class LocalStorageBackend(StorageBackend):
    name = "local"

    def save_pdf(self, offer_id: uuid.UUID, revision_number: int, content: bytes) -> str:
        relative = f"{OFFERS_DIR}/{offer_id}/revision-{revision_number}.pdf"
        path = _safe_path(relative)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return relative

    def read_pdf(self, relative: str) -> bytes:
        path = _safe_path(relative)
        if not path.exists():
            raise StorageError("The document is not available.")
        return path.read_bytes()

    def pdf_path(self, relative: str) -> Path:
        path = _safe_path(relative)
        if not path.exists():
            raise StorageError("The document is not available.")
        return path

    def save_outbox_email(self, recipient: str, subject: str, html_body: str) -> str:
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


class S3StorageBackend(StorageBackend):
    """S3-compatible object storage (AWS S3, Cloudflare R2, Supabase Storage).

    Requires ``boto3``. Documents survive container restarts/redeploys.
    """

    name = "s3"

    def __init__(self) -> None:
        try:
            import boto3  # noqa: F401
        except ImportError as exc:
            raise StorageError(
                "boto3 is required when STORAGE_BACKEND=s3. Install it to use object storage."
            ) from exc
        if not settings.s3_bucket:
            raise StorageError("S3_BUCKET must be configured when STORAGE_BACKEND=s3.")
        self._bucket = settings.s3_bucket
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region or None,
            aws_access_key_id=settings.s3_access_key or None,
            aws_secret_access_key=settings.s3_secret_key or None,
        )

    def save_pdf(self, offer_id: uuid.UUID, revision_number: int, content: bytes) -> str:
        relative = f"{OFFERS_DIR}/{offer_id}/revision-{revision_number}.pdf"
        self._client.put_object(Bucket=self._bucket, Key=relative, Body=content)
        return relative

    def read_pdf(self, relative: str) -> bytes:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=relative)
        except Exception as exc:  # noqa: BLE001 - surface missing objects as StorageError
            raise StorageError("The document is not available.") from exc
        return response["Body"].read()

    def pdf_path(self, relative: str) -> Path:
        raise StorageError("Object storage does not expose a local filesystem path.")

    def save_outbox_email(self, recipient: str, subject: str, html_body: str) -> str:
        # The outbox is a development-only preview artifact and is always written
        # to local disk regardless of the document storage backend.
        return LocalStorageBackend().save_outbox_email(recipient, subject, html_body)


_backend: StorageBackend | None = None


def get_storage_backend() -> StorageBackend:
    global _backend
    if _backend is None:
        kind = settings.storage_backend.strip().lower()
        if kind == "s3":
            _backend = S3StorageBackend()
        else:
            _backend = LocalStorageBackend()
    return _backend


def reset_storage_backend() -> None:
    """Forget the cached backend (used by tests)."""
    global _backend
    _backend = None


def save_pdf(offer_id: uuid.UUID, revision_number: int, content: bytes) -> str:
    return get_storage_backend().save_pdf(offer_id, revision_number, content)


def read_pdf(relative: str) -> bytes:
    return get_storage_backend().read_pdf(relative)


def pdf_path(relative: str) -> Path:
    return get_storage_backend().pdf_path(relative)


def save_outbox_email(recipient: str, subject: str, html_body: str) -> str:
    return get_storage_backend().save_outbox_email(recipient, subject, html_body)
