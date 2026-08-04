"""Custom / extra section rendering for CV templates."""
from __future__ import annotations

import math

from app.services.cv_data import group_flat_items_into_records, is_record_section
from app.services.cv_generator_primitives import (
    get_spacing,
    Builder,
    section_chrome_height,
)
from app.services.cv_templates.shared.records import _education_sidebar_content
from app.services.cv_templates.shared.text import _bullet_list_content, _extra_section_kind

def _flatten_extra_items(items: list) -> list[str]:
    """Flatten structured records to strings for sidebar / compact consumers."""
    flat: list[str] = []
    for item in items or []:
        if isinstance(item, dict):
            title = str(item.get("title") or "").strip()
            subtitle = str(item.get("subtitle") or "").strip()
            bullets = [
                str(bullet).strip()
                for bullet in (item.get("bullets") or [])
                if str(bullet).strip()
            ]
            if title and subtitle:
                flat.append(f"{title} — {subtitle}")
            elif title:
                flat.append(title)
            flat.extend(bullets)
        else:
            text = str(item or "").strip()
            if text:
                flat.append(text)
    return flat


def _measure_one_record_height(
    b: Builder,
    record: dict,
    W: int,
    font_b: str,
    *,
    title_fs: float,
    title_lh: float,
    body_fs: float,
    body_lh: float,
) -> float:
    """Estimate height for a single experience-like record."""
    title = str(record.get("title") or "").strip()
    subtitle = str(record.get("subtitle") or "").strip()
    bullets = [
        str(bullet).strip()
        for bullet in (record.get("bullets") or [])
        if str(bullet).strip()
    ]
    height = 0.0
    if title:
        height += b.measure_block(
            title, W, title_fs, title_lh, font_b, bold=True, min_h=title_lh + 2
        )
    if subtitle:
        if height:
            height += get_spacing().stack
        height += b.measure_block(
            subtitle, W, body_fs * 0.92, body_lh * 0.9, font_b, min_h=body_lh
        )
    if bullets:
        if height:
            height += get_spacing().stack
        content = "\n".join(f"• {bullet}" for bullet in bullets)
        height += b.measure_block(content, W, body_fs, body_lh, font_b, bulletList=True)
    return height


def _measure_record_section_body(
    b: Builder,
    records: list[dict],
    W: int,
    font_b: str,
    *,
    title_fs: float,
    title_lh: float,
    body_fs: float,
    body_lh: float,
) -> float:
    """Estimate stacked height for bold titles + optional nested bullet lists."""
    total = 0.0
    for index, record in enumerate(records):
        total += _measure_one_record_height(
            b, record, W, font_b,
            title_fs=title_fs, title_lh=title_lh, body_fs=body_fs, body_lh=body_lh,
        )
        if index < len(records) - 1:
            total += get_spacing().record
    return total


def _render_record_section_body(
    b: Builder,
    records: list[dict],
    L: int,
    W: int,
    C: dict,
    font_b: str,
    *,
    title_fs: float,
    title_lh: float,
    body_fs: float,
    body_lh: float,
) -> None:
    """
    Render experience-like records: bold title, optional subtitle, nested bullets.

    Used for projects, references, awards, and any other record-kind extras so
    each template does not need a bespoke branch. Each record stays whole on one
    page via ``keep_together``; later records may start on the next page.
    """
    ink = C.get("body", "#2B2B2B")
    muted = C.get("muted", C.get("slate", ink))
    for index, record in enumerate(records):
        title = str(record.get("title") or "").strip()
        subtitle = str(record.get("subtitle") or "").strip()
        bullets = [
            str(bullet).strip()
            for bullet in (record.get("bullets") or [])
            if str(bullet).strip()
        ]
        if not title and not bullets:
            continue
        record_height = _measure_one_record_height(
            b, record, W, font_b,
            title_fs=title_fs, title_lh=title_lh, body_fs=body_fs, body_lh=body_lh,
        )
        with b.keep_together(record_height):
            if title:
                b.block(title, L, W, title_fs, title_lh, ink, font_b, bold=True, min_h=title_lh + 2)
            if subtitle:
                b.gap(get_spacing().stack)
                b.block(subtitle, L, W, body_fs * 0.92, body_lh * 0.9, muted, font_b, min_h=body_lh)
            if bullets:
                b.gap(get_spacing().stack)
                content = "\n".join(f"• {bullet}" for bullet in bullets)
                b.block(content, L, W, body_fs, body_lh, ink, font_b, bulletList=True)
        if index < len(records) - 1:
            b.gap(get_spacing().record)


def _extra_sections(b: Builder, cv: dict, placement: str,
                    section_fn, C: dict, L: int, W: int,
                    font_b: str, fs: float = 10, lh: float = 15,
                    skip_indices: set[int] | None = None,
                    section_chrome_h: float | None = None) -> None:
    """
    Render extra (custom) sections found in the CV but not in the template.

    placement='after_experience' → called after the experience block
    placement='after_skills'     → called after the skills block
    Sections tagged with the requested placement are rendered; others are skipped
    here (they'll be picked up at their own placement call).

    Flat-list kinds (interests, certifications, …) stay a single bullet block.
    Record kinds (projects, references, …) render like experience: bold title
    per entry, then a nested bullet list for the description.

    ``section_chrome_h`` should match the template's real heading/icon/rule
    advance (Iconic is taller than the default label-only estimate).
    """
    chrome_h = (
        float(section_chrome_h)
        if section_chrome_h is not None
        else section_chrome_height(8.6)
    )
    title_fs = max(fs + 0.8, 10.5)
    title_lh = max(lh, title_fs + 2.5)

    for index, sec in enumerate(cv.get("extra_sections") or []):
        if skip_indices and index in skip_indices:
            continue
        if sec.get("placement", "after_skills") != placement:
            continue
        title = (sec.get("title") or "").strip().upper()
        raw_items = list(sec.get("items") or [])
        if not title or not raw_items:
            continue

        use_records = is_record_section(sec.get("kind"), title) and any(
            isinstance(item, dict) for item in raw_items
        )
        # When normalization left only flat strings but the kind/title still
        # implies records, regroup here so older cached profiles still layout.
        if is_record_section(sec.get("kind"), title) and not use_records:
            flat = _flatten_extra_items(raw_items)
            if len(flat) >= 2:
                raw_items = group_flat_items_into_records(flat)
                use_records = True

        if use_records:
            records = [item for item in raw_items if isinstance(item, dict) and item.get("title")]
            if not records:
                continue
            # Reserve only chrome + the first record. Requiring the whole
            # projects/references block to fit pushed entire sections onto the
            # next page and left a large empty band under experience.
            first_record_height = _measure_one_record_height(
                b, records[0], W, font_b,
                title_fs=title_fs, title_lh=title_lh, body_fs=fs, body_lh=lh,
            )
            b.need_section(chrome_h, first_record_height)
            section_fn(title)
            _render_record_section_body(
                b, records, L, W, C, font_b,
                title_fs=title_fs, title_lh=title_lh, body_fs=fs, body_lh=lh,
            )
            b.gap(get_spacing().section)
            continue

        items = _flatten_extra_items(raw_items)
        if not items:
            continue
        # Shared formatter strips legacy leading markers so languages/skills
        # never mix bare lines with "• • item" or hyphen-only rows.
        content = _bullet_list_content(items)
        if not content:
            continue
        body_height = b.measure_block(content, W, fs, lh, font_b, bulletList=True)
        # Reserve heading chrome + body together so custom sections do not leave
        # a title stranded above the page footer.
        b.need_section(chrome_h, body_height)
        section_fn(title)
        b.block(content, L, W, fs, lh, C.get("body", "#2B2B2B"), font_b, bulletList=True)
        b.gap(get_spacing().section)


_SIDEBAR_SECTION_ORDER = ("skills", "languages", "certifications", "interests", "education")


_SIDEBAR_FONT_SIZES = (8.3, 8.0, 7.5)


def _sidebar_wrapped_height(content: str, width: float, font_size: float, line_height: float) -> float:
    """Match Builder's text estimate for a narrow, auto-height sidebar block."""
    chars_per_line = max(10, int(width / (font_size * 0.52)))
    rendered_lines = sum(
        max(1, math.ceil(len(line.strip()) / chars_per_line)) if line.strip() else 1
        for line in content.split("\n")
    )
    return round(max(rendered_lines * line_height + 6, line_height + 6), 2)


def _sidebar_candidates(cv: dict, labels: dict) -> list[dict]:
    """Prepare complete, non-truncated sections eligible for sidebar placement."""
    candidates: list[dict] = []
    skills = [str(skill).strip() for skill in (cv.get("skills") or []) if str(skill).strip()]
    if skills:
        candidates.append({
            "key": "skills",
            "kind": "skills",
            "title": labels["skills"],
            # Vertical bullet list — matches main-column skills and languages.
            "content": _bullet_list_content(skills),
            "bulletList": True,
        })

    for index, section in enumerate(cv.get("extra_sections") or []):
        kind = _extra_section_kind(section)
        if kind not in _SIDEBAR_SECTION_ORDER:
            continue
        title = str(section.get("title") or "").strip().upper()
        items = _flatten_extra_items(section.get("items") or [])
        if title and items:
            candidates.append({
                "key": f"extra:{index}",
                "kind": kind,
                "title": title,
                "content": _bullet_list_content(items),
                "bulletList": True,
                "extra_index": index,
            })

    education_content = _education_sidebar_content(cv.get("education") or [])
    if education_content:
        candidates.append({
            "key": "education",
            "kind": "education",
            "title": labels["education"],
            # Already includes • lines for descriptions; keep as plain wrap so
            # diploma / school rows are not forced into the bullet glyph column.
            "content": education_content,
            "bulletList": False,
        })

    order = {kind: index for index, kind in enumerate(_SIDEBAR_SECTION_ORDER)}
    return sorted(candidates, key=lambda candidate: (order[candidate["kind"]], candidate["key"]))


def _fit_sidebar_sections(
    candidates: list[dict],
    *,
    width: float,
    start_y: float,
    bottom_y: float,
) -> tuple[list[dict], set[str]]:
    """Select only complete sections that fit the first-page sidebar budget.

    The sole hard limit is remaining vertical space (``bottom_y - cursor``).
    A previous per-section cap of 160 px rejected ordinary wizard skill lists
    (~10–12 lines) and pushed them into the main column even when the sidebar
    still had hundreds of free points — while shorter PDF-extracted lists fit.
    Sections that cannot fit intact fall through to the main column instead of
    being truncated.
    """
    placed: list[dict] = []
    placed_keys: set[str] = set()
    cursor = float(start_y)

    for candidate in candidates:
        for font_size in _SIDEBAR_FONT_SIZES:
            line_height = round(max(font_size * 1.45, 11.0), 2)
            body_height = _sidebar_wrapped_height(candidate["content"], width, font_size, line_height)
            section_height = 10 + 5 + body_height + 18
            if cursor + section_height <= bottom_y:
                placed.append({
                    **candidate,
                    "left": 24,
                    "top": round(cursor, 2),
                    "width": width,
                    "fontSize": font_size,
                    "lineHeight": line_height,
                    "body_top": round(cursor + 15, 2),
                    "body_height": body_height,
                })
                placed_keys.add(candidate["key"])
                cursor += section_height
                break
    return placed, placed_keys
