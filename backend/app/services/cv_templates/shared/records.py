"""Education / experience record placement helpers."""
from __future__ import annotations

import re

from app.services.cv_generator_primitives import SPACE_STACK, Builder
from app.services.cv_templates.shared.text import (
    _bullet_list_content,
    _bullets,
    _company_period,
    _extra_section_kind,
)

_LEADING_BULLET = re.compile(r"^[\s]*[•\-–*—∙·]\s*")


def _education_description(edu: dict) -> str:
    """Optional body copy; never reuse the mashed legacy detail field."""
    return str(edu.get("description") or "").strip()


def _education_school(edu: dict) -> str:
    """University / school line — rendered distinctly under the diploma title."""
    school = str(edu.get("school") or "").strip()
    if school:
        return school

    # Legacy entries may only expose a combined detail string (school · city).
    # Promote that line when there is no dedicated description so the school
    # still appears as the distinguished second row rather than muted meta.
    detail = str(edu.get("detail") or "").strip()
    description = _education_description(edu)
    if detail and not description:
        return detail
    return ""


def _education_meta(edu: dict) -> str:
    """City · period — muted line under the school name."""
    city = str(edu.get("city") or "").strip()
    period = str(edu.get("period") or "").strip()
    parts = [part for part in (city, period) if part]
    if parts:
        return "   ·   ".join(parts)

    # When school absorbed a legacy detail string, still show a bare period.
    school = str(edu.get("school") or "").strip()
    if not school:
        return period
    return period


def _education_bullet_items(edu: dict) -> list[str]:
    """
    Description lines for an education record.

    Prefer an explicit ``bullets`` / ``items`` list. Otherwise split a multiline
    description; a single paragraph becomes one bullet so the block still
    reads as a list (matching experience descriptions).
    """
    raw = edu.get("bullets") if edu.get("bullets") is not None else edu.get("items")
    if isinstance(raw, list):
        items = [
            _LEADING_BULLET.sub("", str(item).strip())
            for item in raw
            if str(item).strip()
        ]
        if items:
            return items

    description = _education_description(edu)
    if not description:
        return []

    lines = [
        _LEADING_BULLET.sub("", line.strip())
        for line in description.splitlines()
        if line.strip()
    ]
    return lines or [_LEADING_BULLET.sub("", description)]


def _education_bullets(edu: dict) -> str:
    """Bullet-list body for an education description."""
    return _bullet_list_content(_education_bullet_items(edu))


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
    school = _education_school(edu)
    if school:
        if height:
            height += SPACE_STACK
        # School uses the same size as the degree line so it reads as a peer
        # heading under the diploma, not as muted metadata.
        height += b.measure_block(school, width, degree_fs, degree_lh, font, min_h=degree_lh)
    meta = _education_meta(edu)
    if meta:
        if height:
            height += SPACE_STACK
        height += b.measure_block(meta, width, meta_fs, meta_lh, font, min_h=meta_lh)
    bullets = _education_bullets(edu)
    if bullets:
        if height:
            height += SPACE_STACK
        height += b.measure_block(
            bullets, width, body_fs, body_lh, font, bulletList=True, min_h=body_lh
        )
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
      1. diploma / degree (bold ink)
      2. school / university (ink, not bold — visually distinct from meta)
      3. city · period (muted)
      4. description as a bullet list

    The whole entry is kept on one page (``keep_together``). Trailing
    ``after_gap`` is applied outside that atomic region so inter-record spacing
    does not force the next entry onto the same page.
    """
    degree = str(edu.get("degree") or "").strip()
    school = _education_school(edu)
    meta = _education_meta(edu)
    bullets = _education_bullets(edu)
    # School uses ink so it stands out from muted city/period. Description
    # bullets use body colour like experience bullets.
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
            if school:
                if placed:
                    b.gap(SPACE_STACK)
                b.text(school, degree_fs, font, ink, left)
                placed = True
            if meta:
                if placed:
                    b.gap(SPACE_STACK)
                b.text(meta, meta_fs, font, muted, left)
                placed = True
            if bullets:
                if placed:
                    b.gap(SPACE_STACK)
                b.text(bullets, body_fs, font, body_color, left)
                placed = True
        else:
            if degree:
                b.block(
                    degree, left, width, degree_fs, degree_lh, ink, font,
                    bold=True, min_h=degree_lh,
                )
                placed = True
            if school:
                if placed:
                    b.gap(SPACE_STACK)
                b.block(
                    school, left, width, degree_fs, degree_lh, ink, font,
                    min_h=degree_lh,
                )
                placed = True
            if meta:
                if placed:
                    b.gap(SPACE_STACK)
                b.block(meta, left, width, meta_fs, meta_lh, muted, font, min_h=meta_lh)
                placed = True
            if bullets:
                if placed:
                    b.gap(SPACE_STACK)
                b.block(
                    bullets, left, width, body_fs, body_lh, body_color, font,
                    bulletList=True, min_h=body_lh,
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
        school = _education_school(entry)
        meta = _education_meta(entry)
        # Prefer structured school + city/period; fall back to legacy city join
        # when school was recovered from detail (meta may only be the period).
        if degree:
            lines.append(degree)
        if school:
            lines.append(school)
        if meta:
            lines.append(meta)
        for item in _education_bullet_items(entry):
            lines.append(f"• {item}")
        if not lines:
            legacy = str(entry.get("detail") or "").strip()
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


def _obsidian_education_parts(edu: dict) -> tuple[str, str, str, str]:
    """
    Compact structured education parts (degree, school, meta, bullets):
      1. Nazwa dyplomu (bold)
      2. Uczelnia (distinguished)
      3. Miasto · okres (muted)
      4. Opis as bullet list content
    """
    degree = str(edu.get("degree") or "").strip()
    school = _education_school(edu)
    meta = _education_meta(edu)
    bullets = _education_bullets(edu)
    return degree, school, meta, bullets
