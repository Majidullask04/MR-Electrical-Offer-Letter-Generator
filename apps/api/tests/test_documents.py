from __future__ import annotations

import uuid

import pytest

from app.security import generate_offer_token, hash_offer_token
from app.services import documents
from app.services.storage import StorageError, read_pdf, save_pdf


def test_inr_formatting():
    assert documents.format_inr(60000) == "₹60,000"
    assert documents.format_inr(1234567.5) == "₹12,34,567.50"
    assert documents.format_inr(0) == "₹0"
    assert documents.format_inr(-5000) == "-₹5,000"
    assert documents.format_inr(None) == "—"


def test_amount_in_words():
    assert (
        documents.amount_in_words(1234567)
        == "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven Only"
    )
    assert documents.amount_in_words(10000000) == "Rupees One Crore Only"
    assert documents.amount_in_words(0) == "Zero Rupees Only"


def test_date_formatting():
    assert documents.format_date("2026-11-25") == "25 November 2026"
    assert documents.format_date(None) == "—"
    assert documents.format_date("not-a-date") == "not-a-date"


def test_sanitize_preview_removes_active_content():
    dirty = (
        "<html><body><h1>Offer</h1><script>alert(1)</script>"
        "<svg/onload=alert(1)><iframe srcdoc='bad'></iframe>"
        "<img src=x onerror='alert(1)'><a href='javascript:alert(1)'>x</a></body></html>"
    )
    cleaned = documents.sanitize_preview(dirty)
    assert "<h1>Offer</h1>" in cleaned
    assert "<script" not in cleaned.lower()
    assert "<iframe" not in cleaned.lower()
    assert "onload" not in cleaned.lower()
    assert "onerror" not in cleaned.lower()
    assert "srcdoc" not in cleaned.lower()
    assert "javascript:" not in cleaned.lower()


def test_sandbox_blocks_attribute_escape():
    with pytest.raises(Exception):
        documents.render_document(
            "<html><body>{{ ''.__class__.__mro__ }}</body></html>",
            {"company": {}, "candidate": {}, "employment": {}, "compensation": {}, "offer": {}},
            for_pdf=False,
        )


def test_pdf_rendering():
    pdf = documents.render_pdf("<html><body><h1>Hello</h1><p>OfferLater</p></body></html>")
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 1000


def test_storage_blocks_path_traversal(tmp_path):
    offer_id = uuid.uuid4()
    relative = save_pdf(offer_id, 1, b"%PDF-test")
    assert relative == f"offers/{offer_id}/revision-1.pdf"
    assert read_pdf(relative) == b"%PDF-test"
    with pytest.raises(StorageError):
        read_pdf("../../etc/passwd")
    assert str(tmp_path)


def test_offer_tokens_are_hashed():
    raw, digest = generate_offer_token()
    assert len(raw) >= 40
    assert raw != digest
    assert len(digest) == 64
    assert digest == hash_offer_token(raw)
    raw_two, digest_two = generate_offer_token()
    assert raw_two != raw
    assert digest_two != digest


def test_external_resources_are_rejected():
    with pytest.raises(documents.DocumentError):
        documents._local_url_fetcher("https://example.com/x.png")
    with pytest.raises(documents.DocumentError):
        documents._local_url_fetcher("file:///etc/passwd")
    with pytest.raises(documents.DocumentError):
        documents._local_url_fetcher("ftp://example.com/x.png")
