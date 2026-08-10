"""
Deterministic ATS readability checks against a rendered PDF.

CV Studio controls PDF generation, so ATS scoring can verify the final file
instead of guessing from decorative canvas chrome. This module:

1. Renders the current canvas snapshot with ReportLab (in memory).
2. Extracts text with PyMuPDF.
3. Scores extractability, contact data, and content order in code.

Decorative elements (`fixedToPage`, `section-chrome`, `isDecorativeChromeText`,
shapes/lines/images) are excluded from the expected content stream so ordinals
and underlines do not create false negatives.
"""

from __future__ import annotations

import logging
import re
from types import SimpleNamespace
from typing import Any, Callable

import fitz

from app.utils.build_pdf import build_pdf_to_buffer

logger = logging.getLogger("ats_readability")

# Weighted blend used by the assistant merge step (must sum to 1.0).
CATEGORY_WEIGHTS: dict[str, float] = {
    "text_extract": 0.25,
    "headers": 0.20,
    "contact": 0.15,
    "section_order": 0.15,
    "keywords": 0.15,
    "length": 0.10,
}

CATEGORY_LABELS: dict[str, str] = {
    "text_extract": "Odczyt tekstu",
    "headers": "Nagłówki",
    "contact": "Dane kontaktowe",
    "section_order": "Kolejność treści",
    "keywords": "Słowa kluczowe",
    "length": "Długość",
}

_EMAIL_RE = re.compile(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", re.I)
_PHONE_RE = re.compile(
    r"(?:\+|00)?\d[\d\s\-().]{6,}\d",
)
_URL_RE = re.compile(
    r"(?:https?://|www\.|linkedin\.com|github\.com)[^\s|,;]+",
    re.I,
)
# Pure decorative ordinals such as "01" / "02" that templates place beside headings.
_ORDINAL_RE = re.compile(r"^\d{1,2}$")
_WHITESPACE_RE = re.compile(r"\s+")

# Standard section headings (PL + common EN) used for order checks.
_SECTION_HEADING_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"\b(podsumowanie|profil|summary|profile)\b", re.I),
    re.compile(r"\b(do[sś]wiadczenie|experience|praca)\b", re.I),
    re.compile(r"\b(wykszta[lł]cenie|education|edukacja)\b", re.I),
    re.compile(r"\b(umiej[eę]tno[sś]ci|skills|kompetencje)\b", re.I),
    re.compile(r"\b(certyfikaty|certificates|certifications)\b", re.I),
    re.compile(r"\b(j[eę]zyki|languages)\b", re.I),
]


class AtsReadabilityError(Exception):
    """Raised when the PDF cannot be built or text cannot be extracted."""

    def __init__(self, message: str, *, user_message: str | None = None):
        super().__init__(message)
        self.user_message = user_message or (
            "Nie udało się wygenerować PDF do sprawdzenia czytelności ATS. "
            "Spróbuj ponownie."
        )


def is_decorative_element(element: dict | Any) -> bool:
    """Return True when the element is chrome / non-content for ATS expectations."""
    get = element.get if isinstance(element, dict) else lambda k, d=None: getattr(element, k, d)
    category = str(get("category") or "").lower()
    if category not in {"text", "textarea"}:
        return True
    if get("fixedToPage") is True:
        return True
    if get("isDecorativeChromeText") is True:
        return True
    flow_role = str(get("flowRole") or "").strip().lower()
    if flow_role == "section-chrome":
        return True
    content = str(get("content") or "").strip()
    if not content:
        return True
    # Ordinal badges that slipped through without the decorative flag.
    if _ORDINAL_RE.match(content.replace("\\n", " ").strip()):
        return True
    return False


def _element_sort_key(element: dict) -> tuple:
    page = int(element.get("page") or 1)
    top = float(element.get("top") or 0)
    left = float(element.get("left") or 0)
    return (page, top, left)


def _normalize_text(value: str) -> str:
    text = str(value or "").replace("\\n", "\n")
    text = _WHITESPACE_RE.sub(" ", text).strip().lower()
    return text


def content_text_elements(elements: list[dict]) -> list[dict]:
    """Canvas text/textarea elements that carry candidate content (not chrome)."""
    items = [
        el for el in elements
        if isinstance(el, dict) and not is_decorative_element(el)
    ]
    return sorted(items, key=_element_sort_key)


def expected_content_snippets(elements: list[dict], *, min_len: int = 3) -> list[str]:
    """Short normalised snippets used to verify PDF extract order."""
    snippets: list[str] = []
    for el in content_text_elements(elements):
        raw = str(el.get("content") or "").replace("\\n", " ")
        for part in re.split(r"[\n•|;]+", raw):
            norm = _normalize_text(part)
            if len(norm) < min_len:
                continue
            # Keep a stable prefix so long paragraphs still match in PDF text.
            snippets.append(norm[:80])
    # Deduplicate while preserving order.
    seen: set[str] = set()
    unique: list[str] = []
    for snippet in snippets:
        if snippet in seen:
            continue
        seen.add(snippet)
        unique.append(snippet)
    return unique


def expected_plain_text(elements: list[dict]) -> str:
    """Joined candidate content from the canvas (decorative chrome excluded)."""
    lines = []
    for el in content_text_elements(elements):
        content = str(el.get("content") or "").replace("\\n", " ").strip()
        if content:
            lines.append(content)
    return "\n".join(lines)


def _elements_as_namespaces(elements: list[dict]) -> list[SimpleNamespace]:
    """ReportLab renderer expects attribute access, not dict keys."""
    out: list[SimpleNamespace] = []
    for el in elements:
        if not isinstance(el, dict):
            continue
        # Shallow copy so missing geometry defaults do not mutate the request.
        data = dict(el)
        data.setdefault("page", 1)
        data.setdefault("left", 0)
        data.setdefault("top", 0)
        data.setdefault("width", 100)
        data.setdefault("height", 20)
        data.setdefault("fontFamily", "Helvetica")
        data.setdefault("fontSize", 11)
        data.setdefault("color", "#222222")
        data.setdefault("content", "")
        data.setdefault("backgroundColor", "#000000")
        out.append(SimpleNamespace(**data))
    return out


def build_ats_pdf_bytes(
    elements: list[dict],
    page_size: dict | None,
    image_resolver: Callable[[str], str],
) -> bytes:
    """Render the canvas snapshot to PDF bytes (no watermark, no persistence)."""
    if not elements:
        raise AtsReadabilityError(
            "ATS PDF render requested with empty elements",
            user_message="Brak elementów CV do sprawdzenia czytelności ATS.",
        )

    page_w = float((page_size or {}).get("width") or (page_size or {}).get("page_width") or 595)
    page_h = float((page_size or {}).get("height") or (page_size or {}).get("page_height") or 842)
    page_count = max(
        (int(el.get("page") or 1) for el in elements if isinstance(el, dict)),
        default=1,
    )

    pdf_data = SimpleNamespace(
        pdf_title="ats-check",
        page_width=page_w,
        page_height=page_h,
        pages=page_count,
    )

    try:
        return build_pdf_to_buffer(
            pdf_data,
            _elements_as_namespaces(elements),
            image_resolver,
            watermark=False,
        )
    except AtsReadabilityError:
        raise
    except Exception as exc:
        logger.exception("ATS PDF render failed")
        raise AtsReadabilityError(
            f"ATS PDF render failed: {type(exc).__name__}: {exc}",
            user_message=(
                "Nie udało się wygenerować PDF do sprawdzenia czytelności ATS. "
                "Spróbuj ponownie."
            ),
        ) from exc


def extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract plain text from PDF bytes in page order via PyMuPDF."""
    if not pdf_bytes:
        raise AtsReadabilityError(
            "Empty PDF bytes for ATS extraction",
            user_message="Nie udało się odczytać tekstu z wygenerowanego PDF.",
        )
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        parts: list[str] = []
        for page in doc:
            parts.append(page.get_text("text") or "")
        doc.close()
        return "\n".join(parts)
    except AtsReadabilityError:
        raise
    except Exception as exc:
        logger.exception("ATS PDF text extraction failed")
        raise AtsReadabilityError(
            f"ATS PDF text extraction failed: {type(exc).__name__}: {exc}",
            user_message="Nie udało się odczytać tekstu z wygenerowanego PDF.",
        ) from exc


def score_text_extract(pdf_text: str, expected_snippets: list[str]) -> float:
    """0–100: share of expected content snippets found in extracted PDF text."""
    pdf_norm = _normalize_text(pdf_text)
    if not pdf_norm.strip():
        return 0.0
    if not expected_snippets:
        # No canvas text — give a neutral score when PDF still has extractable text.
        return 70.0 if len(pdf_norm) >= 40 else 30.0

    hits = 0
    checked = 0
    for snippet in expected_snippets[:40]:
        checked += 1
        needle = snippet[:48]
        if needle and needle in pdf_norm:
            hits += 1
    if checked == 0:
        return 70.0
    ratio = hits / checked
    # Soft floor when most text extracts: decorative noise alone must not tank the score.
    return max(0.0, min(100.0, round(ratio * 100.0, 1)))


def score_contact(pdf_text: str) -> float:
    """0–100: presence of email / phone / profile URL / location-like tokens."""
    text = pdf_text or ""
    signals = 0
    if _EMAIL_RE.search(text):
        signals += 1
    if _PHONE_RE.search(text):
        signals += 1
    if _URL_RE.search(text):
        signals += 1
    # Lightweight location heuristic: common city/region markers or "ul." / PL postcode.
    if re.search(r"\b(?:ul\.|Warszawa|Krak[oó]w|Wroc[lł]aw|Pozna[nń]|Gda[nń]sk|\d{2}-\d{3})\b", text, re.I):
        signals += 1
    if signals >= 3:
        return 100.0
    if signals == 2:
        return 70.0
    if signals == 1:
        return 40.0
    return 10.0


def score_section_order(pdf_text: str, expected_snippets: list[str]) -> float:
    """0–100: whether key content appears in roughly the same order as on the canvas."""
    pdf_norm = _normalize_text(pdf_text)
    if not pdf_norm.strip():
        return 0.0

    positions: list[int] = []
    for snippet in expected_snippets[:30]:
        needle = snippet[:40]
        if not needle:
            continue
        idx = pdf_norm.find(needle)
        if idx >= 0:
            positions.append(idx)

    if len(positions) < 2:
        # Fall back to section-heading order when snippets are sparse.
        heading_positions = []
        for pattern in _SECTION_HEADING_PATTERNS:
            match = pattern.search(pdf_norm)
            if match:
                heading_positions.append(match.start())
        if len(heading_positions) < 2:
            return 75.0 if positions or heading_positions else 40.0
        ordered = heading_positions == sorted(heading_positions)
        return 100.0 if ordered else 55.0

    inversions = 0
    pairs = 0
    for i in range(len(positions)):
        for j in range(i + 1, len(positions)):
            pairs += 1
            if positions[i] > positions[j]:
                inversions += 1
    if pairs == 0:
        return 75.0
    order_ratio = 1.0 - (inversions / pairs)
    return max(0.0, min(100.0, round(order_ratio * 100.0, 1)))


def score_length(pdf_text: str) -> float:
    """0–100: word-count heuristic for a typical 1–2 page CV."""
    words = len((pdf_text or "").split())
    if 250 <= words <= 1000:
        return 100.0
    if 180 <= words < 250 or 1000 < words <= 1300:
        return 80.0
    if 100 <= words < 180 or 1300 < words <= 1700:
        return 55.0
    if 40 <= words < 100 or 1700 < words <= 2200:
        return 35.0
    return 15.0


def category_dict(cat_id: str, score: float, *, max_score: float = 100.0) -> dict:
    """Build a dashboard category payload."""
    clamped = max(0.0, min(float(score), max_score))
    return {
        "id": cat_id,
        "label": CATEGORY_LABELS.get(cat_id, cat_id),
        "score": clamped,
        "max": max_score,
    }


def weighted_overall_percent(categories: list[dict]) -> float:
    """Deterministic overall percentage from weighted categories."""
    by_id = {str(c.get("id")): c for c in categories if isinstance(c, dict)}
    total = 0.0
    weight_sum = 0.0
    for cat_id, weight in CATEGORY_WEIGHTS.items():
        cat = by_id.get(cat_id)
        if not cat:
            continue
        max_score = float(cat.get("max") or 0)
        if max_score <= 0:
            continue
        pct = (float(cat.get("score") or 0) / max_score) * 100.0
        total += pct * weight
        weight_sum += weight
    if weight_sum <= 0:
        return 0.0
    # Renormalise if some categories are missing so overall stays on 0–100.
    return max(0.0, min(100.0, total / weight_sum))


def percent_to_rating(percent: float) -> int:
    """Map 0–100 overall to the legacy 1–10 `rating` field used by the UI."""
    if percent <= 0:
        return 1
    return max(1, min(10, int(round(percent / 10.0))))


def analyze_pdf_readability(
    elements: list[dict],
    page_size: dict | None,
    image_resolver: Callable[[str], str],
) -> dict:
    """Build PDF, extract text, and return deterministic category scores.

    @returns dict with keys:
      pdf_text, expected_text, categories (text_extract/contact/section_order/length),
      overall_partial_percent (weights renormalised over deterministic categories only)
    """
    pdf_bytes = build_ats_pdf_bytes(elements, page_size, image_resolver)
    pdf_text = extract_pdf_text(pdf_bytes)
    snippets = expected_content_snippets(elements)
    expected_text = expected_plain_text(elements)

    categories = [
        category_dict("text_extract", score_text_extract(pdf_text, snippets)),
        category_dict("contact", score_contact(pdf_text)),
        category_dict("section_order", score_section_order(pdf_text, snippets)),
        category_dict("length", score_length(pdf_text)),
    ]

    return {
        "pdf_text": pdf_text,
        "expected_text": expected_text,
        "snippets": snippets,
        "categories": categories,
    }


def merge_ats_categories(
    deterministic: list[dict],
    llm_categories: list[dict],
) -> list[dict]:
    """Combine code scores with LLM headers/keywords into the final six categories.

    Length is always taken from the deterministic PDF word-count score so the
    model cannot invent a length score that disagrees with the extracted text.
    """
    det_by_id = {c["id"]: c for c in deterministic if isinstance(c, dict) and c.get("id")}
    llm_by_id = {c["id"]: c for c in llm_categories if isinstance(c, dict) and c.get("id")}

    merged: list[dict] = []
    for cat_id in CATEGORY_WEIGHTS:
        if cat_id in {"text_extract", "contact", "section_order", "length"}:
            source = det_by_id.get(cat_id)
        else:
            source = llm_by_id.get(cat_id)
        if source is None:
            # Missing LLM category → neutral mid score so overall stays defined.
            merged.append(category_dict(cat_id, 60.0))
            continue
        score = float(source.get("score") or 0)
        max_score = float(source.get("max") or 100)
        # Normalise LLM 0–N scales onto 0–100 for a uniform dashboard.
        if max_score > 0 and abs(max_score - 100.0) > 0.01:
            score = (score / max_score) * 100.0
        merged.append(category_dict(cat_id, score, max_score=100.0))
    return merged
