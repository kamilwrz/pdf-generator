"""Shared text / label helpers for CV template generators."""
from __future__ import annotations

import re
from collections.abc import Callable
from typing import Any

from app.services.cv_data import (
    fold_section_label,
    is_distinct_skill_family_title,
    is_skills_like_title,
    skill_groups,
    skills_have_content,
)
from app.services.cv_generator_primitives import (
    _rect,
    _text,
    _text_width,
    get_spacing,
    section_chrome_height,
)

# Strip leading glyph/dash markers so callers can pass already-bulleted lines
# without producing "• • item" in the canvas bulletList renderer.
_LEADING_BULLET = re.compile(r"^[\s]*[•\-–*—∙·]\s*")


def _clean_list_items(items: list | tuple | None) -> list[str]:
    """Strip leading markers and drop empty entries from a flat chip list."""
    cleaned: list[str] = []
    for item in items or []:
        text = _LEADING_BULLET.sub("", str(item or "").strip())
        if text:
            cleaned.append(text)
    return cleaned


def _bullet_list_content(items: list | tuple | None) -> str:
    """
    Format flat strings as a ``bulletList`` textarea body.

    Used in sidebars and for non-skills chip sections (languages, interests,
    certifications). Main-column skills use ``_skills_inline_content`` instead.
    """
    return "\n".join(f"• {text}" for text in _clean_list_items(items))


def _skills_inline_content(items: list | tuple | None) -> str:
    """
    Main-column skills as a compact mid-dot row.

    Accepts flat chips or ``{category, items}`` groups (chips only — category
    labels are rendered separately by ``_place_skills_section``).
    """
    chips: list[str] = []
    for group in skill_groups(items):
        chips.extend(group["items"])
    return "  ·  ".join(_clean_list_items(chips))


def _skills_sidebar_content(skills: Any) -> str:
    """
    Sidebar / compact skills body: optional category lines + bullet chips.

    Example::

        Bezpieczeństwo
        • Wireshark
        • Nmap
        Przemysł / OT
        • PLC
    """
    parts: list[str] = []
    for group in skill_groups(skills):
        category = str(group.get("category") or "").strip()
        body = _bullet_list_content(group.get("items"))
        if category:
            parts.append(category)
        if body:
            parts.append(body)
    return "\n".join(parts)


def _skill_group_body_content(
    items: list | tuple | None,
    *,
    mode: str = "inline",
) -> str:
    """Chip body for one skill group (mid-dot row or bullet list)."""
    if mode == "inline":
        return _skills_inline_content(items)
    return _bullet_list_content(items)


# Chip pill layout: horizontal padding/gap around each pill and vertical gap
# between wrapped rows, in px. Tuned to read as a distinct rounded badge next
# to the mid-dot/bullet body styles above without dominating the row.
CHIP_PAD_X = 10.0
CHIP_PAD_Y = 5.0
CHIP_GAP_X = 8.0
CHIP_GAP_Y = 8.0


def _layout_skill_chips(
    items: list | tuple | None,
    width: float,
    font: str,
    fs: float,
) -> tuple[list[tuple[str, float, float, float]], float]:
    """Compute wrapped chip positions and the total block height.

    Returns ``(placements, total_height)`` where each placement is
    ``(skill, dx, dy, chip_width)`` relative to the block's top-left corner.
    Both the measure pass (``_measure_skill_chips_row``) and the place pass
    (``_place_skill_chips_row``) call this same function, so the two can
    never disagree about how many rows a skill list wraps into. Axis's older,
    unshared ``_place_skill_chips`` only reserves height for the first row
    before wrapping, which can let a category with many skills paint past
    the footer; sharing one layout pass here rules that class of bug out.
    """
    cleaned = _clean_list_items(items)
    if not cleaned:
        return [], 0.0
    chip_h = fs + 2 * CHIP_PAD_Y
    row_step = chip_h + CHIP_GAP_Y
    placements: list[tuple[str, float, float, float]] = []
    cx = 0.0
    cy = 0.0
    row_started = False
    for skill in cleaned:
        chip_w = _text_width(skill, font, fs) + 2 * CHIP_PAD_X
        if row_started and cx + chip_w > width:
            cx = 0.0
            cy += row_step
            row_started = False
        placements.append((skill, cx, cy, chip_w))
        cx += chip_w + CHIP_GAP_X
        row_started = True
    return placements, cy + chip_h


def _measure_skill_chips_row(
    items: list | tuple | None, width: float, font: str, fs: float,
) -> float:
    """Total height of one category's wrapped chip pills."""
    _, total_height = _layout_skill_chips(items, width, font, fs)
    return total_height


def _place_skill_chips_row(
    b: Any,
    items: list | tuple | None,
    left: float,
    width: float,
    font: str,
    fs: float,
    chip_bg: str,
    chip_fg: str,
) -> float:
    """Emit one category's skills as wrapped, filled rounded-pill chips.

    Advances and returns ``b.y`` by the same amount
    ``_measure_skill_chips_row`` reports for identical inputs (both call
    ``_layout_skill_chips``), which is what lets ``_place_skills_section``
    reserve exact space via ``keep_together`` and never split a category
    mid-row.
    """
    placements, total_height = _layout_skill_chips(items, width, font, fs)
    if not placements:
        return b.y
    chip_h = fs + 2 * CHIP_PAD_Y
    radius = chip_h / 2
    top = b.y
    for skill, dx, dy, chip_w in placements:
        x = left + dx
        y = top + dy
        # `grid-member` tells the frontend structural-editor repacker
        # (sectionStructure.js) that these elements form a 2D row/column grid,
        # not a linear title->meta->body stack. Without it, `compactSectionStrip`
        # / `placeStrip` treat every keep_together sibling as the next line in a
        # single vertical record and collapse the whole wrapped grid into one
        # column when the user runs Add Section.
        b.els.append({
            **_rect(
                x, y, chip_w, chip_h, chip_bg, 0,
                filled=True, borderRadius=radius, zIndex=2, page=b.pg,
            ),
            "flowRole": "grid-member",
        })
        b.els.append({
            **_text(
                skill, fs, font, chip_fg, x + CHIP_PAD_X, y + CHIP_PAD_Y,
                zIndex=3, page=b.pg,
            ),
            "flowRole": "grid-member",
        })
    b.y = top + total_height
    return b.y


def _measure_skill_group(
    b: Any,
    group: dict[str, Any],
    width: float,
    fs: float,
    lh: float,
    font: str,
    *,
    mode: str = "inline",
    category_fs: float | None = None,
) -> float:
    """Height of one category label + chip body (no trailing inter-group gap)."""
    cat_fs = float(category_fs if category_fs is not None else max(fs, 9.5))
    # Match the category font, not the body line-height — inflating to body ``lh``
    # leaves empty box space that spacing guides read as a ~10 px ink gap.
    cat_lh = cat_fs + 2.0
    category = str(group.get("category") or "").strip()
    items = group.get("items") or []
    height = 0.0
    if category:
        height += b.measure_block(
            category, width, cat_fs, cat_lh, font, bold=True, min_h=cat_lh,
        )
        if items:
            height += get_spacing().stack
    if items:
        if mode == "chips":
            height += _measure_skill_chips_row(items, width, font, fs)
        else:
            content = _skill_group_body_content(items, mode=mode)
            if content:
                height += b.measure_block(
                    content, width, fs, lh, font, bulletList=(mode == "bullets"),
                )
    return height


def _measure_skills_body(
    b: Any,
    groups: list[dict[str, Any]],
    width: float,
    fs: float,
    lh: float,
    font: str,
    *,
    mode: str = "inline",
    category_fs: float | None = None,
) -> float:
    """Estimate stacked height for named skill groups (no section chrome)."""
    total = 0.0
    between = get_spacing().record
    for index, group in enumerate(groups):
        total += _measure_skill_group(
            b, group, width, fs, lh, font, mode=mode, category_fs=category_fs,
        )
        if index < len(groups) - 1:
            total += between
    return total


def _place_skills_section(
    b: Any,
    cv: dict,
    section_fn: Callable[[str], Any],
    L: float,
    W: float,
    body_color: str,
    font: str,
    fs: float,
    lh: float,
    *,
    mode: str = "inline",
    section_chrome_h: float | None = None,
    category_fs: float | None = None,
    chip_bg: str | None = None,
    chip_fg: str | None = None,
) -> bool:
    """
    Emit one UMIEJĘTNOŚCI heading plus optional named subsections.

    Flat skills → heading + mid-dot/bullet/chip body (unchanged look unless
    ``mode="chips"`` is requested).
    Grouped skills → heading, then bold category labels and chip bodies under
    each. ``inline``/``bullets`` reuse existing textarea bold + list blocks —
    no new canvas primitives. ``mode="chips"`` instead emits one filled,
    rounded ``rectangle`` + centered ``text`` pair per skill via
    ``_place_skill_chips_row``, wrapped across rows.

    ``mode="chips"`` requires ``chip_bg``/``chip_fg`` (pill background/text
    colors) — callers pass their own template palette so pills stay on-brand
    without a new persisted configuration field.

    Each category + body is emitted inside ``keep_together`` so they share a
    ``flowGroup`` — for chips this guarantees a category's label and every one
    of its wrapped pill rows land on the same page, never split mid-row.
    Canvas rhythm knobs treat that pair as stack (4 px), not record (10 px) —
    autoHeight textareas without a shared group fall through to record
    spacing in ``classifyIntraSectionGap``.
    """
    raw_skills = cv.get("skills")
    if not skills_have_content(raw_skills):
        return False
    if mode == "chips" and (not chip_bg or not chip_fg):
        raise ValueError("mode='chips' requires chip_bg and chip_fg")

    groups = skill_groups(raw_skills)
    labels = _labels(cv)
    cat_fs = float(category_fs if category_fs is not None else max(fs, 9.5))
    cat_lh = cat_fs + 2.0
    chrome_h = (
        float(section_chrome_h)
        if section_chrome_h is not None
        else section_chrome_height(8.6)
    )
    stack = get_spacing().stack

    # Reserve chrome + first group so the heading does not orphan at the footer.
    first_h = _measure_skill_group(
        b, groups[0], W, fs, lh, font, mode=mode, category_fs=category_fs,
    )

    b.need_section(chrome_h, first_h or lh)
    section_fn(labels["skills"])

    for index, group in enumerate(groups):
        category = str(group.get("category") or "").strip()
        items = group.get("items") or []
        if mode == "chips":
            content = ""
            has_body = bool(_clean_list_items(items))
        else:
            content = _skill_group_body_content(items, mode=mode) if items else ""
            has_body = bool(content)
        group_h = _measure_skill_group(
            b, group, W, fs, lh, font, mode=mode, category_fs=category_fs,
        )
        with b.keep_together(group_h or lh):
            if category:
                b.block(
                    category, L, W, cat_fs, cat_lh, body_color, font,
                    bold=True, min_h=cat_lh,
                )
                if has_body:
                    b.gap(stack)
            if mode == "chips":
                if has_body:
                    _place_skill_chips_row(b, items, L, W, font, fs, chip_bg, chip_fg)
            elif content:
                b.block(
                    content, L, W, fs, lh, body_color, font,
                    bulletList=(mode == "bullets"),
                )
        if index < len(groups) - 1:
            b.gap(get_spacing().record)
    return True

_LABEL_DEFAULTS = {
    "summary":    "PODSUMOWANIE ZAWODOWE",
    "experience": "DOŚWIADCZENIE ZAWODOWE",
    "education":  "WYKSZTAŁCENIE",
    "skills":     "UMIEJĘTNOŚCI",
}


def _fold_label(value: object) -> str:
    """Normalize section titles so old and newly extracted CVs classify alike."""
    return fold_section_label(value)


def _extra_section_kind(section: dict) -> str:
    """Return a supported semantic kind with a title-based legacy fallback."""
    declared = _fold_label(section.get("kind"))
    if declared in {
        "languages",
        "certifications",
        "interests",
        "education",
        "skills",
        "projects",
        "references",
        "awards",
        "publications",
        "volunteering",
    }:
        return declared

    title = _fold_label(section.get("title"))
    if any(token in title for token in ("jezyk", "language", "lingua", "sprache")):
        return "languages"
    if any(token in title for token in ("certyf", "certificate", "certification", "licenc", "uprawnien", "kurs", "szkolen")):
        return "certifications"
    if any(token in title for token in ("zainteres", "hobb", "interest", "pasj")):
        return "interests"
    if any(token in title for token in ("wyksztalc", "education")):
        return "education"
    if any(token in title for token in ("projekt", "project", "portfolio")):
        return "projects"
    if any(token in title for token in ("referenc", "reference")):
        return "references"
    if any(token in title for token in ("nagrod", "award", "achiev")):
        return "awards"
    if any(token in title for token in ("publikac", "publication")):
        return "publications"
    if any(token in title for token in ("wolontar", "volunteer")):
        return "volunteering"
    # Soft/hard/tools keep kind "other" so templates that skip a folded
    # skills slot (e.g. Axis) still render each named family as its own list.
    if is_skills_like_title(section.get("title")):
        if is_distinct_skill_family_title(section.get("title")):
            return "other"
        return "skills"
    return "other"


def _labels(cv: dict) -> dict:
    """Return section headings in the CV's language (GPT-supplied), with Polish fallbacks."""
    raw = cv.get("labels") or {}
    return {k: (raw.get(k) or v).upper() for k, v in _LABEL_DEFAULTS.items()}


def _contact_line_core(cv: dict) -> str:
    """Email · phone · location only (no socials — use when socials live elsewhere)."""
    return "   ·   ".join(filter(None, [
        cv.get("email"), cv.get("phone"), cv.get("location"),
    ]))


def _contact_line(cv: dict) -> str:
    """Mid-dot masthead contact string: email · phone · location · socials."""
    from app.services.cv_templates.shared.contact import _social_contact_line_parts

    return "   ·   ".join(filter(None, [
        cv.get("email"),
        cv.get("phone"),
        cv.get("location"),
        *_social_contact_line_parts(cv),
    ]))


def _compact_text(value: object, limit: int) -> str:
    """Collapse whitespace and shorten decorative-slot copy without splitting words."""
    clean = " ".join(str(value or "").split())
    if len(clean) <= limit:
        return clean
    shortened = clean[: max(limit - 1, 1)].rsplit(" ", 1)[0].rstrip()
    return f"{shortened or clean[: max(limit - 1, 1)]}…"


def _bullets(job: dict) -> str:
    return "\n".join(f"• {b}" for b in job.get("bullets", []) if b)


def _company_period(job: dict) -> str:
    return "   ·   ".join(filter(None, [
        job.get("company"),
        job.get("city"),
        job.get("period"),
    ]))
