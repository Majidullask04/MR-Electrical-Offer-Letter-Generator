from __future__ import annotations

import base64
import html
import re
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import bleach
from jinja2 import BaseLoader, TemplateError
from jinja2.sandbox import SandboxedEnvironment
import segno
from weasyprint import HTML
from weasyprint.urls import default_url_fetcher

from app.schemas.offer import TrainingIncrementPolicy

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
FONT_DIR = STATIC_DIR / "fonts"
LOGO_PATH = STATIC_DIR / "brand" / "logo.png"

EMPLOYMENT_LABELS = {
    "FULL_TIME": "Full-time",
    "PART_TIME": "Part-time",
    "CONTRACT": "Contract",
    "TEMPORARY": "Temporary",
    "INTERNSHIP": "Internship",
}

TERM_TITLES = [
    ("probation", "Probation"),
    ("leave_policy", "Leave policy"),
    ("working_hours", "Working hours"),
    ("confidentiality", "Confidentiality"),
    ("notice_period", "Notice period"),
    ("termination", "Termination"),
    ("company_policies", "Company policies"),
    ("joining_requirements", "Joining requirements"),
    ("additional_clauses", "Additional clauses"),
]


class DocumentError(ValueError):
    pass


def make_qr_data_uri(url: str) -> str:
    """Render a crisp SVG QR code data URI for embedding into HTML and WeasyPrint PDFs."""
    import io

    qr = segno.make(url, error="m")
    buffer = io.BytesIO()
    qr.save(buffer, kind="svg", xmldecl=False, scale=4, border=2, dark="#121417", light="#FFFFFF")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def pdf_download_filename(offer_id: str, candidate_name: str) -> str:
    """Build a safe filename such as MREW-OL-2026-000001-John-Doe.pdf."""
    clean_id = re.sub(r"[^A-Za-z0-9._-]+", "-", offer_id.replace("/", "-")).strip("-") or "OFFER"
    clean_name = re.sub(r"[^A-Za-z0-9]+", "-", candidate_name.strip()).strip("-")
    if clean_name:
        return f"{clean_id}-{clean_name}.pdf"
    return f"{clean_id}.pdf"


def _font_files() -> dict[str, Path]:
    return {
        "Outfit": FONT_DIR / "Outfit.ttf",
        "Plus Jakarta Sans": FONT_DIR / "PlusJakartaSans.ttf",
        "JetBrains Mono": FONT_DIR / "JetBrainsMono.ttf",
    }


@lru_cache(maxsize=1)
def _logo_data_uri() -> str:
    if not LOGO_PATH.exists():
        return ""
    encoded = base64.b64encode(LOGO_PATH.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


@lru_cache(maxsize=1)
def _embedded_font_css() -> str:
    rules = []
    for family, path in _font_files().items():
        if not path.exists():
            continue
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
        rules.append(
            f"@font-face {{ font-family: '{family}'; src: url(data:font/ttf;base64,{encoded}) "
            f"format('truetype'); font-weight: 100 900; font-style: normal; }}"
        )
    return "\n".join(rules)


@lru_cache(maxsize=1)
def _file_font_css() -> str:
    rules = []
    for family, path in _font_files().items():
        if not path.exists():
            continue
        rules.append(
            f"@font-face {{ font-family: '{family}'; src: url('{path.as_uri()}') "
            f"format('truetype'); font-weight: 100 900; font-style: normal; }}"
        )
    return "\n".join(rules)


def font_face_css(for_pdf: bool) -> str:
    return _file_font_css() if for_pdf else _embedded_font_css()


def format_inr(value: float | Decimal | int | None) -> str:
    if value is None:
        return "—"
    amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    negative = amount < 0
    amount = abs(amount)
    integer = int(amount)
    paise = int((amount - integer) * 100)
    raw = str(integer)
    if len(raw) > 3:
        last_three = raw[-3:]
        rest = raw[:-3]
        groups = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        raw = ",".join(groups) + "," + last_three
    decimals = f".{paise:02d}" if paise else ""
    return f"{'-' if negative else ''}₹{raw}{decimals}"


ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two_digits(number: int) -> str:
    if number < 20:
        return ONES[number]
    return (TENS[number // 10] + (" " + ONES[number % 10] if number % 10 else "")).strip()


def _three_digits(number: int) -> str:
    if number >= 100:
        hundreds = ONES[number // 100] + " Hundred"
        remainder = number % 100
        return hundreds + (" " + _two_digits(remainder) if remainder else "")
    return _two_digits(number)


def amount_in_words(value: float | Decimal | int) -> str:
    number = int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
    if number == 0:
        return "Zero Rupees Only"
    if number >= 1_00_00_00_000:
        return "Rupees " + format(number, ",") + " Only"
    parts: list[str] = []
    crore = number // 1_00_00_000
    number %= 1_00_00_000
    lakh = number // 1_00_000
    number %= 1_00_000
    thousand = number // 1_000
    number %= 1_000
    if crore:
        parts.append(_two_digits(crore) + " Crore")
    if lakh:
        parts.append(_two_digits(lakh) + " Lakh")
    if thousand:
        parts.append(_two_digits(thousand) + " Thousand")
    if number:
        parts.append(_three_digits(number))
    return "Rupees " + " ".join(parts) + " Only"


def format_date(value: str | date | datetime | None) -> str:
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            try:
                parsed = datetime.combine(date.fromisoformat(value), datetime.min.time())
            except ValueError:
                return value
        value = parsed
    if isinstance(value, datetime):
        value = value.date()
    return value.strftime("%d %B %Y")


def format_datetime(value: str | datetime | None) -> str:
    if not value:
        return "—"
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
    return value.strftime("%d %B %Y, %H:%M UTC")


def _escaped_paragraphs(text: str | None) -> str:
    if not text or not text.strip():
        return ""
    cleaned = html.escape(text.strip())
    return "".join(f"<p>{line}</p>" for line in cleaned.splitlines() if line.strip())


def _employment_table(snapshot: dict[str, Any]) -> str:
    employment = snapshot["employment"]
    is_training_active = bool(
        snapshot.get("include_training_policy")
        or snapshot.get("compensation_mode") == "TRAINING_PROGRESSION"
        or (snapshot.get("training_policy") or {}).get("enabled")
    )
    rows: list[tuple[str, Any]] = [
        ("Job title", employment.get("job_title")),
    ]
    if employment.get("department"):
        rows.append(("Department", employment.get("department")))
    rows.extend(
        [
            (
                "Employment type",
                EMPLOYMENT_LABELS.get(employment.get("employment_type", ""), employment.get("employment_type")),
            ),
            ("Joining date", format_date(employment.get("joining_date"))),
        ]
    )
    if is_training_active:
        policy = snapshot.get("training_policy") or {}
        tp_months = int(policy.get("training_period_months") or 1)
        tp_label = f"{tp_months} month" if tp_months == 1 else f"{tp_months} months"
        rows.append(("Training period", tp_label))

        acc_free = policy.get("site_accommodation_free", True)
        food_prov = policy.get("food_provided", False)
        acc_text = "Free accommodation at working site" if acc_free else "No site accommodation"
        food_text = "Food provided" if food_prov else "Food not provided"
        rows.append(("Site facilities", f"{acc_text} · {food_text}"))

    if employment.get("employment_duration"):
        rows.append(("Employment duration", employment.get("employment_duration")))
    rows.extend(
        [
            ("Work location", employment.get("work_location")),
            ("Reporting manager", employment.get("reporting_manager")),
        ]
    )
    if not is_training_active and employment.get("probation_months") is not None:
        rows.append(
            (
                "Probation",
                f"{employment.get('probation_months', 0)} months"
                if employment.get("probation_months")
                else "Not applicable",
            )
        )
    if employment.get("working_days"):
        rows.append(("Working days", employment.get("working_days")))
    if employment.get("working_hours"):
        rows.append(("Working hours", employment.get("working_hours")))
    body = "".join(
        f"<tr><td class='label'>{html.escape(str(label))}</td><td>{html.escape(str(value or '—'))}</td></tr>"
        for label, value in rows
    )
    return f"<table class='facts'>{body}</table>"


def _money_cell(value: float, negative: bool = False) -> str:
    formatted = format_inr(value)
    if negative and value:
        return f"<td class='num negative'>−{formatted}</td>"
    return f"<td class='num'>{formatted}</td>"


def _compensation_table(snapshot: dict[str, Any]) -> str:
    comp = snapshot["compensation"]
    rows: list[str] = []
    for item in comp.get("earnings", []):
        amount = float(item.get("amount", 0))
        period = item.get("period", "MONTHLY")
        monthly = amount if period == "MONTHLY" else amount / 12
        annual = amount * 12 if period == "MONTHLY" else amount
        rows.append(
            f"<tr><td>{html.escape(str(item.get('name', 'Earning')))}</td>"
            f"<td class='num'>{format_inr(monthly)}</td><td class='num'>{format_inr(annual)}</td></tr>"
        )
    for item in comp.get("deductions", []):
        amount = float(item.get("amount", 0))
        period = item.get("period", "MONTHLY")
        monthly = amount if period == "MONTHLY" else amount / 12
        annual = amount * 12 if period == "MONTHLY" else amount
        rows.append(
            f"<tr><td>{html.escape(str(item.get('name', 'Deduction')))}</td>"
            f"<td class='num negative'>−{format_inr(monthly)}</td>"
            f"<td class='num negative'>−{format_inr(annual)}</td></tr>"
        )
    stipend = float(comp.get("stipend") or 0)
    annual_ctc = float(comp.get("annual_ctc") or 0)
    monthly_gross = float(comp.get("monthly_gross") or 0)
    if stipend > 0 and not comp.get("earnings"):
        rows.append(
            f"<tr><td>Monthly stipend</td>"
            f"<td class='num'>{format_inr(stipend)}</td><td class='num'>{format_inr(stipend * 12)}</td></tr>"
        )
    if not rows and (annual_ctc > 0 or monthly_gross > 0):
        rows.append(
            f"<tr><td>Gross compensation</td>"
            f"<td class='num'>{format_inr(monthly_gross)}</td><td class='num'>{format_inr(annual_ctc)}</td></tr>"
        )
    if not rows:
        return "<p class='muted'>Compensation is as per the agreed company engagement terms.</p>"
    frequency = {
        "MONTHLY": "Monthly",
        "QUARTERLY": "Quarterly",
        "ANNUALLY": "Annually",
    }.get(comp.get("payment_frequency", "MONTHLY"), comp.get("payment_frequency"))
    total_label = "Monthly stipend" if (stipend > 0 and annual_ctc <= 0) else "Annual CTC"
    total_monthly = stipend if (stipend > 0 and monthly_gross <= 0) else monthly_gross
    total_annual = stipend * 12 if (stipend > 0 and annual_ctc <= 0) else annual_ctc
    rows.append(
        f"<tr class='total'><td>{total_label}</td>"
        f"<td class='num'>{format_inr(total_monthly)}</td>"
        f"<td class='num'>{format_inr(total_annual)}</td></tr>"
    )
    table = (
        "<table class='money'><thead><tr><th>Component</th><th class='num'>Monthly</th>"
        "<th class='num'>Annual</th></tr></thead><tbody>"
        + "".join(rows)
        + "</tbody></table>"
    )
    payment_terms = comp.get("payment_terms")
    clean_payment_terms = str(payment_terms).strip().rstrip(".") if payment_terms else ""
    if not clean_payment_terms or "4th" in clean_payment_terms.lower():
        payment_phrase = "Salary is paid monthly on the 4th of every month."
    elif clean_payment_terms.lower().startswith("on "):
        payment_phrase = f"Salary is paid {html.escape(str(frequency).lower())} {html.escape(clean_payment_terms)}."
    else:
        payment_phrase = f"Salary is paid {html.escape(str(frequency).lower())}. Payment terms: {html.escape(clean_payment_terms)}."

    note = (
        f"<p class='muted'>{total_label} in words: {html.escape(amount_in_words(total_annual))}. "
        f"{payment_phrase} "
        "Only the deductions listed above are included; no statutory deduction has been assumed in this letter.</p>"
    )
    if comp.get("notes"):
        note += f"<p class='muted'>{html.escape(str(comp['notes']))}</p>"
    return table + note


def _terms_html(snapshot: dict[str, Any]) -> str:
    terms = snapshot.get("terms") or {}
    is_training_active = bool(
        snapshot.get("include_training_policy")
        or snapshot.get("compensation_mode") == "TRAINING_PROGRESSION"
        or (snapshot.get("training_policy") or {}).get("enabled")
    )
    sections = []
    for key, title in TERM_TITLES:
        if key == "probation" and is_training_active:
            policy = snapshot.get("training_policy") or {}
            tp_months = int(policy.get("training_period_months") or 1)
            tp_str = f"{tp_months}-month" if tp_months == 1 else f"{tp_months}-month"
            tp_salary = f"{format_inr(policy.get('training_monthly_salary_inr', 14000))} / month"
            food_text = "food provided" if policy.get("food_provided") else "no food provided"
            acc_text = (
                "free accommodation if staying at the working site"
                if policy.get("site_accommodation_free", True)
                else "no site accommodation"
            )
            p_min = format_inr(policy.get("post_training_salary_min_inr", 18000))
            p_max = format_inr(policy.get("post_training_salary_max_inr", 25000))
            p_months = int(policy.get("post_training_duration_months") or 6)
            inc_months = int(policy.get("first_increment_after_months") or 6)
            inc_pct = _format_percent(policy.get("first_increment_max_percent", 30))
            criteria = html.escape(str(policy.get("increment_criteria", "Behaviour and performance")))

            body = (
                f"<p><strong>1. Training Period ({tp_str})</strong>: Consolidated stipend of {tp_salary}; "
                f"{food_text}; {acc_text}.</p>"
                f"<p><strong>2. Post-Training Salary (Next {p_months} Months)</strong>: Revision to {p_min} – {p_max} / month "
                f"based on performance, continuing for {p_months} months.</p>"
                f"<p><strong>3. First Increment (After {inc_months} Months)</strong>: Up to {inc_pct}% increment "
                f"evaluated after {inc_months} months of post-training service based on {criteria.lower()}.</p>"
            )
            sections.append(
                f"<div class='term'><h3>Training Period, Accommodation &amp; Increment Policy</h3>{body}</div>"
            )
            continue

        body = _escaped_paragraphs(terms.get(key))
        if body:
            sections.append(f"<div class='term'><h3>{title}</h3>{body}</div>")
    if not sections:
        return "<p class='muted'>The company's standard terms apply.</p>"
    return "".join(sections)


POLICY_ALLOWED_TAGS = [
    "div",
    "p",
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
    "strong",
    "span",
    "ul",
    "li",
    "br",
]
POLICY_ALLOWED_ATTRS = {
    "div": ["class"],
    "p": ["class"],
    "table": ["class"],
    "th": ["class"],
    "td": ["class"],
    "span": ["class"],
}


def _format_percent(value: float) -> str:
    rounded = round(float(value), 2)
    return str(int(rounded)) if rounded.is_integer() else f"{rounded:g}"


def render_training_policy_block(policy: dict[str, Any] | None) -> str:
    """Render and sanitize the structured training, salary progression, and increment policy block."""
    if not policy or not isinstance(policy, dict):
        return ""
    if not (
        policy.get("enabled", False)
        or policy.get("include_training_policy", False)
        or policy.get("compensation_mode") == "TRAINING_PROGRESSION"
    ):
        return ""
    model = TrainingIncrementPolicy.model_validate(policy or {})
    if not model.enabled:
        return ""

    training_label = (
        "1st Month Training Period"
        if model.training_period_months == 1
        else f"First {model.training_period_months} Months Training Period"
    )
    training_window = (
        "Month 1 (1 Month)"
        if model.training_period_months == 1
        else f"Months 1–{model.training_period_months} ({model.training_period_months} Months)"
    )
    post_start = model.training_period_months + 1
    post_end = model.training_period_months + model.post_training_duration_months
    post_duration_unit = "Month" if model.post_training_duration_months == 1 else "Months"
    post_duration_text = f"Months {post_start}–{post_end} ({model.post_training_duration_months} {post_duration_unit})"
    inc_unit = "month" if model.first_increment_after_months == 1 else "months"

    food_text = "Food provided" if model.food_provided else "No food provided"
    acc_text = (
        "Free accommodation if staying at the working site"
        if model.site_accommodation_free
        else "No free site accommodation"
    )
    training_salary = f"{format_inr(model.training_monthly_salary_inr)}/month"
    post_salary = (
        f"{format_inr(model.post_training_salary_min_inr)} – "
        f"{format_inr(model.post_training_salary_max_inr)}/month"
    )
    pct_text = f"Up to {_format_percent(model.first_increment_max_percent)}% increment"
    criteria_text = html.escape(model.increment_criteria)

    raw_html = (
        "<div class='training-policy-block'>"
        "<table class='money'>"
        "<thead><tr>"
        "<th>Stage</th><th>Duration / Window</th><th>Compensation / Revision</th><th>Site Facilities &amp; Evaluation</th>"
        "</tr></thead>"
        "<tbody>"
        "<tr>"
        f"<td><strong>{html.escape(training_label)}</strong></td>"
        f"<td>{html.escape(training_window)}</td>"
        f"<td><strong>{html.escape(training_salary)}</strong></td>"
        f"<td>{html.escape(food_text)}<br>{html.escape(acc_text)}</td>"
        "</tr>"
        "<tr>"
        "<td><strong>Post-Training Salary</strong></td>"
        f"<td>{html.escape(post_duration_text)}</td>"
        f"<td><strong>{html.escape(post_salary)}</strong></td>"
        f"<td>Performance-based revision continuing for {model.post_training_duration_months} {post_duration_unit.lower()}.</td>"
        "</tr>"
        "<tr>"
        f"<td><strong>First Increment</strong></td>"
        f"<td>After {model.first_increment_after_months} {inc_unit}</td>"
        f"<td><strong>{html.escape(pct_text)}</strong></td>"
        f"<td>Reviewed after {model.first_increment_after_months} {inc_unit} of post-training salary based on {criteria_text}.</td>"
        "</tr>"
        "</tbody>"
        "</table>"
        "</div>"
    )
    return bleach.clean(raw_html, tags=POLICY_ALLOWED_TAGS, attributes=POLICY_ALLOWED_ATTRS, strip=True)


def _company_address_html(company: dict[str, Any]) -> str:
    parts = [
        company.get("address_line1"),
        company.get("address_line2"),
        ", ".join(filter(None, [company.get("city"), company.get("state"), company.get("postal_code")])),
        company.get("country"),
    ]
    return "<br>".join(html.escape(part) for part in parts if part)


def _company_address_line(company: dict[str, Any]) -> str:
    parts = [
        company.get("address_line1"),
        company.get("address_line2"),
        ", ".join(filter(None, [company.get("city"), company.get("state"), company.get("postal_code")])),
    ]
    return ", ".join(part for part in parts if part)


def build_render_context(snapshot: dict[str, Any], *, for_pdf: bool) -> dict[str, Any]:
    company = snapshot["company"]
    candidate = snapshot["candidate"]
    employment = snapshot["employment"]
    compensation = snapshot["compensation"]
    offer = snapshot["offer"]
    signatory = snapshot.get("signatory") or {}
    blocks = dict(snapshot.get("blocks") or {})
    is_training_active = bool(
        snapshot.get("include_training_policy")
        or snapshot.get("compensation_mode") == "TRAINING_PROGRESSION"
        or (snapshot.get("training_policy") or {}).get("enabled")
    )
    if is_training_active and "training_policy" in snapshot:
        blocks["training_and_increment_policy"] = render_training_policy_block(snapshot.get("training_policy"))
    else:
        blocks["training_and_increment_policy"] = ""

    company_address = _company_address_html(company)
    candidate_address = "<br>".join(
        html.escape(line)
        for line in str(candidate.get("current_address") or "").splitlines()
        if line.strip()
    )
    verification = snapshot.get("verification") or {}
    official_offer_number = offer.get("official_number") or offer.get("number")
    qr_uri = verification.get("qr_data_uri") or ""
    verif_url = verification.get("url") or ""
    employment_type = employment.get("employment_type", "")
    terms = snapshot.get("terms") or {}
    company_name = str(company.get("name") or "MR. ELECTRICAL WORKS").strip()
    name_parts = company_name.rsplit(" ", 1)
    legal_name = str(company.get("legal_name") or company.get("name") or "MR. ELECTRICAL WORKS").strip()
    if legal_name == "MR ELECTRIC WORKS":
        legal_name = "MR. ELECTRICAL WORKS"
    primary_color = str(company.get("primary_color") or "#B35010")
    if not re.fullmatch(r"#[0-9A-Fa-f]{6}", primary_color):
        primary_color = "#B35010"
    context = {
        "font_face_css": font_face_css(for_pdf),
        "company_logo": _logo_data_uri(),
        "company_name": company_name,
        "company_name_head": name_parts[0],
        "company_name_tail": name_parts[1] if len(name_parts) > 1 else "",
        "primary_color": primary_color,
        "company_legal_name": legal_name,
        "company_tagline": company.get("tagline") or "",
        "company_intro": company.get("company_intro") or "",
        "company_address_html": company_address,
        "company_address_line": _company_address_line(company),
        "company_phone": company.get("phone") or "",
        "company_email": company.get("email") or "",
        "company_website": company.get("website") or "",
        "company_udyam": company.get("udyam_number") or "",
        "signature_image_data": company.get("signature_image_data") or "",
        "seal_image_data": company.get("seal_image_data") or "",
        "candidate_name": candidate.get("full_name"),
        "candidate_code": candidate.get("candidate_code") or "",
        "candidate_email": candidate.get("email") or "",
        "candidate_phone": candidate.get("phone") or "",
        "candidate_address_html": candidate_address,
        "offer_number": offer.get("number"),
        "official_offer_number": official_offer_number,
        "display_offer_id": official_offer_number,
        "offer_date": format_date(offer.get("date")),
        "expiry_date": format_date(offer.get("expires_at")),
        "revision_number": offer.get("revision_number", 1),
        "job_title": employment.get("job_title"),
        "department": employment.get("department") or "",
        "employment_type": employment_type,
        "employment_type_label": EMPLOYMENT_LABELS.get(employment_type, employment_type),
        "joining_date": format_date(employment.get("joining_date")),
        "employment_duration": employment.get("employment_duration") or "",
        "work_location": employment.get("work_location"),
        "reporting_manager": employment.get("reporting_manager"),
        "probation_months": employment.get("probation_months"),
        "working_days": employment.get("working_days"),
        "working_hours": employment.get("working_hours"),
        "responsibilities": employment.get("responsibilities") or "",
        "annual_ctc": format_inr(compensation.get("annual_ctc")),
        "monthly_salary": format_inr(compensation.get("monthly_gross")),
        "annual_ctc_words": amount_in_words(compensation.get("annual_ctc", 0)),
        "salary_frequency": compensation.get("payment_frequency", "MONTHLY"),
        "currency": compensation.get("currency", "INR"),
        "signatory_name": signatory.get("name") or company.get("signatory_name"),
        "signatory_title": signatory.get("title") or company.get("signatory_title"),
        "signatory_email": signatory.get("email") or company.get("signatory_email"),
        "footer_note": company.get("footer_note") or "",
        "footer_identity": f"{company.get('name')} | {official_offer_number}",
        "verification_qr_data_uri": qr_uri,
        "verification_url": verif_url,
        "candidate_declaration": terms.get("candidate_declaration") or "",
        "show_candidate_signature_block": bool(snapshot.get("show_candidate_signature_block", True)),
        "employment_table": _employment_table(snapshot),
        "compensation_table": _compensation_table(snapshot),
        "terms_html": _terms_html(snapshot),
        "blocks": blocks,
        "offer": offer,
        "company": company,
        "candidate": candidate,
        "employment": employment,
        "compensation": compensation,
        "terms": terms,
    }
    return context


def render_document(template_html: str, snapshot: dict[str, Any], *, for_pdf: bool) -> str:
    if not template_html or not template_html.strip():
        raise DocumentError("The selected template has no content.")
    environment = SandboxedEnvironment(loader=BaseLoader(), autoescape=True)
    try:
        template = environment.from_string(template_html)
        rendered = template.render(**build_render_context(snapshot, for_pdf=for_pdf))
    except TemplateError as exc:
        raise DocumentError(f"The template could not be rendered: {exc}") from exc
    if not rendered.strip():
        raise DocumentError("The template rendered an empty document.")
    return rendered


def _local_url_fetcher(url: str, *args, **kwargs):
    parsed = urlparse(url)
    if parsed.scheme == "data":
        return default_url_fetcher(url, *args, **kwargs)
    if parsed.scheme == "file":
        path = Path(parsed.path)
        try:
            path.resolve().relative_to(STATIC_DIR.resolve())
        except ValueError as exc:
            raise DocumentError("Documents may only load bundled static assets.") from exc
        return default_url_fetcher(url, *args, **kwargs)
    raise DocumentError("Documents may not load external resources.")


def render_pdf(html_content: str) -> bytes:
    try:
        return HTML(
            string=html_content,
            base_url=str(STATIC_DIR),
            url_fetcher=_local_url_fetcher,
        ).write_pdf()
    except DocumentError:
        raise
    except Exception as exc:  # noqa: BLE001 - WeasyPrint raises varied errors
        raise DocumentError(f"PDF rendering failed: {exc}") from exc


def sanitize_preview(html_content: str) -> str:
    """Strip active content from admin-authored templates before browser preview."""
    cleaned = re.sub(
        r"<(script|iframe|object|embed|frame|frameset|meta|base)\b[^>]*>.*?</\1>",
        "",
        html_content,
        flags=re.I | re.S,
    )
    cleaned = re.sub(
        r"<(script|iframe|object|embed|frame|meta|base)\b[^>]*\/?>",
        "",
        cleaned,
        flags=re.I,
    )
    # Match event handlers separated by whitespace OR '/' (e.g. <svg/onload=...>)
    cleaned = re.sub(
        r"(?<=[\s/])on[a-z]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)",
        "",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(
        r"(?<=[\s/])srcdoc\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)",
        "",
        cleaned,
        flags=re.I,
    )
    cleaned = re.sub(r"(?:javascript|vbscript)\s*:", "", cleaned, flags=re.I)
    cleaned = re.sub(r"data\s*:\s*text/html", "", cleaned, flags=re.I)
    return cleaned
