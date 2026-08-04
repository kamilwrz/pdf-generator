"""Education / experience record placement helpers."""
from __future__ import annotations

from app.services.cv_generator_primitives import SPACE_STACK, Builder
from app.services.cv_templates.shared.text import (
    _bullets,
    _company_period,
    _extra_section_kind,
)

def _education_meta(edu: dict) -> str:
    """School · city · period — the muted line under the diploma title."""
    school = str(edu.get("school") or "").strip()
    city = str(edu.get("city") or "").strip()
    period = str(edu.get("period") or "").strip()
    parts = [part for part in (school, city, period) if part]
    if parts:
        return "   ·   ".join(parts)

    # Legacy entries may only expose a combined detail string.
    detail = str(edu.get("detail") or "").strip()
    description = str(edu.get("description") or "").strip()
    if detail and not description:
        if period and period not in detail:
            return f"{detail}   ·   {period}"
        return detail
    return period


def _education_description(edu: dict) -> str:
    """Optional body copy; never reuse the mashed legacy detail field."""
    return str(edu.get("description") or "").strip()


def _education_record_height(
    b: "Builder",
    edu: dict,
    width: float,
    font: str,
    *,
    degree_fs: float = 10.2,
    degree_lh: float = 13,
    meta_fs: float = 8.6,
    meta_lh: float = 11.5,
    body_fs: float = 8.5,
    body_lh: float = 11.5,
) -> float:
    """Measured height of one structured education record (no trailing gap)."""
    height = 0.0
    degree = str(edu.get("degree") or "").strip()
    if degree:
        height += b.measure_block(
            degree, width, degree_fs, degree_lh, font, bold=True, min_h=degree_lh
        )
    meta = _education_meta(edu)
    if meta:
        if height:
            height += SPACE_STACK
        height += b.measure_block(meta, width, meta_fs, meta_lh, font, min_h=meta_lh)
    description = _education_description(edu)
    if description:
        if height:
            height += SPACE_STACK
        height += b.measure_block(description, width, body_fs, body_lh, font, min_h=body_lh)
    return height


def _place_education_record(
    b: "Builder",
    edu: dict,
    left: float,
    width: float,
    *,
    ink: str,
    muted: str,
    font: str,
    body: str | None = None,
    mode: str = "block",
    degree_fs: float = 10.2,
    degree_lh: float = 13,
    meta_fs: float = 8.6,
    meta_lh: float = 11.5,
    body_fs: float = 8.5,
    body_lh: float = 11.5,
    after_gap: float | None = None,
) -> None:
    """
    Render one education entry as:
      1. diploma / degree (bold)
      2. school · city · period (muted)
      3. optional description

    The whole entry is kept on one page (``keep_together``). Trailing
    ``after_gap`` is applied outside that atomic region so inter-record spacing
    does not force the next entry onto the same page.
    """
    degree = str(edu.get("degree") or "").strip()
    meta = _education_meta(edu)
    description = _education_description(edu)
    # The school/date line is metadata, while the optional description is
    # readable content and must use the same ink as experience descriptions.
    # Falling back to `muted` here makes the education body look disabled.
    body_color = body if body is not None else ink
    placed = False
    record_height = _education_record_height(
        b, edu, width, font,
        degree_fs=degree_fs, degree_lh=degree_lh,
        meta_fs=meta_fs, meta_lh=meta_lh,
        body_fs=body_fs, body_lh=body_lh,
    )

    with b.keep_together(record_height):
        if mode == "text":
            if degree:
                b.text(degree, degree_fs, font, ink, left, bold=True)
                placed = True
            if meta:
                if placed:
                    b.gap(SPACE_STACK)
                b.text(meta, meta_fs, font, muted, left)
                placed = True
            if description:
                if placed:
                    b.gap(SPACE_STACK)
                b.text(description, body_fs, font, body_color, left)
                placed = True
        else:
            if degree:
                b.block(
                    degree, left, width, degree_fs, degree_lh, ink, font,
                    bold=True, min_h=degree_lh,
                )
                placed = True
            if meta:
                if placed:
                    b.gap(SPACE_STACK)
                b.block(meta, left, width, meta_fs, meta_lh, muted, font, min_h=meta_lh)
                placed = True
            if description:
                if placed:
                    b.gap(SPACE_STACK)
                b.block(
                    description, left, width, body_fs, body_lh, body_color, font, min_h=body_lh
                )
                placed = True

    if after_gap is not None and placed:
        b.gap(after_gap)


def _experience_record_height(
    b: "Builder",
    job: dict,
    width: float,
    font: str,
    *,
    title_fs: float,
    title_lh: float,
    meta_fs: float,
    meta_lh: float,
    body_fs: float,
    body_lh: float,
    title_min_h: float = 15,
    meta_min_h: float = 12,
    meta_font: str | None = None,
) -> float:
    """Measured height of one experience record (no trailing gap)."""
    meta_fam = meta_font or font
    bullets = _bullets(job)
    height = (
        b.measure_block(
            job.get("title", ""), width, title_fs, title_lh, font,
            bold=True, min_h=title_min_h,
        )
        + SPACE_STACK
        + b.measure_block(
            _company_period(job), width, meta_fs, meta_lh, meta_fam, min_h=meta_min_h,
        )
    )
    if bullets:
        height += SPACE_STACK + b.measure_block(
            bullets, width, body_fs, body_lh, font, bulletList=True,
        )
    return height


def _place_experience_record(
    b: "Builder",
    job: dict,
    left: float,
    width: float,
    *,
    ink: str,
    muted: str,
    body: str,
    font: str,
    title_fs: float = 11,
    title_lh: float = 13.5,
    meta_fs: float = 8.7,
    meta_lh: float = 11.5,
    body_fs: float = 9.4,
    body_lh: float = 13.3,
    title_min_h: float = 15,
    meta_min_h: float = 12,
    meta_font: str | None = None,
    after_gap: float | None = None,
) -> None:
    """
    Render one experience entry (title → company/period → bullets) as one page
    atom. Sections may continue on the next page; this record may not split.
    """
    meta_fam = meta_font or font
    height = _experience_record_height(
        b, job, width, font,
        title_fs=title_fs, title_lh=title_lh,
        meta_fs=meta_fs, meta_lh=meta_lh,
        body_fs=body_fs, body_lh=body_lh,
        title_min_h=title_min_h, meta_min_h=meta_min_h,
        meta_font=meta_fam,
    )
    with b.keep_together(height):
        b.block(
            job.get("title", ""), left, width, title_fs, title_lh, ink, font,
            bold=True, min_h=title_min_h,
        )
        b.gap(SPACE_STACK)
        b.block(
            _company_period(job), left, width, meta_fs, meta_lh, muted, meta_fam,
            min_h=meta_min_h,
        )
        bullets = _bullets(job)
        if bullets:
            b.gap(SPACE_STACK)
            b.block(bullets, left, width, body_fs, body_lh, body, font, bulletList=True)
    if after_gap is not None:
        b.gap(after_gap)


def _education_sidebar_content(education: list[dict]) -> str:
    """Compact, structured records for a narrow sidebar column."""
    records: list[str] = []
    for entry in education:
        lines: list[str] = []
        degree = str(entry.get("degree") or "").strip()
        school = str(entry.get("school") or "").strip()
        city = str(entry.get("city") or "").strip()
        period = str(entry.get("period") or "").strip()
        description = _education_description(entry)
        legacy_detail = str(entry.get("detail") or "").strip()
        school_city = "  ·  ".join(part for part in (school, city) if part)
        if degree:
            lines.append(degree)
        if school_city:
            lines.append(school_city)
        elif legacy_detail and legacy_detail not in {degree, period}:
            # Older payloads store the school in `detail` only.
            lines.append(legacy_detail)
        if period:
            lines.append(period)
        if description:
            lines.append(description)
        if not lines:
            legacy = _education_meta(entry)
            if legacy:
                lines.append(legacy)
        if lines:
            records.append("\n".join(lines))
    return "\n\n".join(records)


def _language_sidebar_lines(cv: dict) -> list[str]:
    """Language lines for sidebar bullet lists (wizard field or extra_sections)."""
    lines: list[str] = []
    for entry in cv.get("languages") or []:
        if isinstance(entry, dict):
            name = str(entry.get("name") or "").strip()
            level = str(entry.get("level") or "").strip()
            if name:
                lines.append(f"{name} — {level}" if level else name)
        else:
            text = str(entry or "").strip()
            if text:
                lines.append(text)
    if lines:
        return lines
    for section in cv.get("extra_sections") or []:
        if _extra_section_kind(section) != "languages":
            continue
        for item in section.get("items") or []:
            text = str(item or "").strip()
            if text:
                lines.append(text)
    return lines


def _obsidian_education_parts(edu: dict) -> tuple[str, str, str]:
    """
    Obsidian sidebar education format:
      1. Nazwa dyplomu — Data/Okres
      2. Uczelnia, Miasto
      3. Opis
    """
    degree = str(edu.get("degree") or "").strip()
    period = str(edu.get("period") or "").strip()
    school = str(edu.get("school") or "").strip()
    city = str(edu.get("city") or "").strip()
    description = _education_description(edu)
    legacy_detail = str(edu.get("detail") or "").strip()

    title = " — ".join(part for part in (degree, period) if part)
    school_city = ", ".join(part for part in (school, city) if part)
    if not school_city and legacy_detail:
        if legacy_detail not in {degree, period, description, title}:
            school_city = legacy_detail
    return title, school_city, description
