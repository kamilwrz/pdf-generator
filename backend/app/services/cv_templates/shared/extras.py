"""Custom / extra section rendering for CV templates."""
from __future__ import annotations

from app.services.cv_data import group_flat_items_into_records, is_record_section
from app.services.cv_generator_primitives import (
    get_spacing,
    Builder,
    section_chrome_height,
)
from app.services.cv_templates.shared.records import (
    _build_sidebar_education_elements,
    _sidebar_education_entries,
    _sidebar_education_section_height,
)
from app.services.cv_data import skill_groups, skills_have_content
from app.services.cv_templates.shared.text import (
    _bullet_list_content,
    _extra_section_kind,
    _language_entries,
    _language_level_color,
    _measure_languages_grid_height,
    _place_languages_grid,
    _sidebar_language_content,
    _skills_sidebar_content,
)

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
                    section_chrome_h: float | None = None,
                    languages_columns: int = 4) -> None:
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

    ``languages_columns`` sizes the languages grid's cells to the caller's own
    main-column width. Sidebar templates (Sterling, Tessera, Slate — narrower
    ~300-335pt main columns, versus ~460-500pt for single-column templates)
    pass 3 instead of the default 4: at 4 columns a narrow main column gives
    each cell too little width for a "Name — Level" line to fit without
    wrapping/cutting off mid-word.
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

        kind = _extra_section_kind(sec)
        # Equal-column textarea grid with accent CEFR runs — not one bulleted
        # "Name — Level" block. Column count is caller-supplied (see
        # `languages_columns`'s docstring above).
        if kind == "languages":
            entries = _language_entries(cv, items)
            if not entries:
                continue
            body_color = C.get("body", "#2B2B2B")
            level_color = _language_level_color(C)
            body_height = _measure_languages_grid_height(
                b, entries, W, columns=languages_columns, font=font_b, fs=fs, lh=lh,
            )
            b.need_section(chrome_h, body_height or lh)
            section_fn(title)
            _place_languages_grid(
                b, entries, L, W,
                columns=languages_columns,
                font=font_b, fs=fs, lh=lh,
                body_color=body_color, level_color=level_color,
            )
            b.gap(get_spacing().section)
            continue

        # Shared formatter strips legacy leading markers so skills / interests /
        # certifications never mix bare lines with "• • item" or hyphen-only rows.
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


def _sidebar_wrapped_height(
    content: str, width: float, font_size: float, line_height: float,
    *, font: str = "Montserrat", bulletList: bool = False,
) -> float:
    """Authoritative height for a narrow, auto-height sidebar body block.

    Delegates to ``Builder.measure_block`` — the same ReportLab-metrics
    measurer used for education, main-column records, and the summary body
    — instead of approximating. A prior character-count heuristic here
    (``width / (font_size * 0.52)`` characters per line, no word-boundary
    wrap simulation) could over- or under-estimate the real wrap point
    depending on the specific text's word lengths, and because
    ``_fit_sidebar_sections`` positions every subsequent section's heading
    at a fixed absolute top from this estimate, any divergence surfaced as
    visibly uneven gaps between sidebar sections once the canvas corrected
    each body box down to its real rendered height.
    """
    return Builder.measure_block(
        content, width, font_size, line_height, font,
        bulletList=bulletList, min_h=line_height + 6,
    )


def _sidebar_candidates(cv: dict, labels: dict) -> list[dict]:
    """Prepare complete, non-truncated sections eligible for sidebar placement."""
    candidates: list[dict] = []
    if skills_have_content(cv.get("skills")):
        groups = skill_groups(cv.get("skills"))
        has_named = any(str(group.get("category") or "").strip() for group in groups)
        # Named groups already embed "•" lines under category labels — keep
        # bulletList off so category titles are not forced into the glyph column.
        candidates.append({
            "key": "skills",
            "kind": "skills",
            "title": labels["skills"],
            "content": (
                _skills_sidebar_content(cv.get("skills"))
                if has_named
                else _bullet_list_content(groups[0]["items"] if groups else [])
            ),
            "bulletList": not has_named,
        })

    for index, section in enumerate(cv.get("extra_sections") or []):
        kind = _extra_section_kind(section)
        if kind not in _SIDEBAR_SECTION_ORDER:
            continue
        title = str(section.get("title") or "").strip().upper()
        items = _flatten_extra_items(section.get("items") or [])
        if not title or not items:
            continue
        # Sidebar languages: plain "Name - Level" lines (no bullets). Prefer the
        # structured cv.languages field when present so CEFR codes stay aligned.
        if kind == "languages":
            content = _sidebar_language_content(cv, items)
            if not content:
                continue
            candidates.append({
                "key": f"extra:{index}",
                "kind": kind,
                "title": title,
                "content": content,
                "bulletList": False,
                "extra_index": index,
            })
            continue
        candidates.append({
            "key": f"extra:{index}",
            "kind": kind,
            "title": title,
            "content": _bullet_list_content(items),
            "bulletList": True,
            "extra_index": index,
        })

    education_entries = _sidebar_education_entries(cv.get("education"))
    if education_entries:
        candidates.append({
            "key": "education",
            "kind": "education",
            "title": labels["education"],
            # Structured records (degree / school / meta / bullets) — Tessera,
            # Slate and Sterling emit separate elements, not one mashed textarea.
            "entries": education_entries,
            "structured": True,
            # Empty content keeps flat-section height math from KeyErroring if a
            # caller still reads ``content``; fit uses ``entries`` instead.
            "content": "",
            "bulletList": False,
        })

    order = {kind: index for index, kind in enumerate(_SIDEBAR_SECTION_ORDER)}
    return sorted(candidates, key=lambda candidate: (order[candidate["kind"]], candidate["key"]))


def _sidebar_education_type_sizes(font_size: float, line_height: float) -> dict[str, float]:
    """Compact type roles for structured sidebar education at a fitted body size."""
    return {
        "degree_fs": font_size,
        "degree_lh": line_height,
        # Meta sits a step smaller/muted under the diploma + school stack.
        "meta_fs": round(max(7.0, font_size - 0.8), 2),
        "meta_lh": round(max(10.5, line_height - 0.5), 2),
        "body_fs": font_size,
        "body_lh": line_height,
    }


def _fit_sidebar_sections(
    candidates: list[dict],
    *,
    width: float,
    start_y: float,
    bottom_y: float,
    font: str = "Montserrat",
) -> tuple[list[dict], set[str]]:
    """Select only complete sections that fit the remaining sidebar budget.

    The sole hard limit is remaining vertical space (``bottom_y - cursor``).
    A previous per-section cap of 160 px rejected ordinary wizard skill lists
    (~10–12 lines) and pushed them into the main column even when the sidebar
    still had hundreds of free points — while shorter PDF-extracted lists fit.
    Sections that cannot fit intact fall through (Tessera/Slate: main column;
    Sterling multi-page: the next rail) instead of being truncated.

    A kicker is never placed without room for at least two body lines. The
    leftover footer band is often tall enough for the heading chrome alone;
    emitting it there orphans UMIEJĘTNOŚCI on page 1 while the list starts
    the next page's rail.

    Education candidates carry ``entries`` and are measured with the same
    structured stack the generators emit (diploma / school / meta / bullets).
    """
    placed: list[dict] = []
    placed_keys: set[str] = set()
    cursor = float(start_y)

    for candidate in candidates:
        for font_size in _SIDEBAR_FONT_SIZES:
            line_height = round(max(font_size * 1.45, 11.0), 2)
            if candidate.get("structured") and candidate.get("kind") == "education":
                type_sizes = _sidebar_education_type_sizes(font_size, line_height)
                body_height = _sidebar_education_section_height(
                    candidate.get("entries") or [],
                    width,
                    font,
                    **type_sizes,
                )
            else:
                body_height = _sidebar_wrapped_height(
                    candidate["content"], width, font_size, line_height,
                    font=font, bulletList=bool(candidate.get("bulletList")),
                )
            # Chrome advance matches the generators (kicker 10 + tick gap 5 +
            # trailing 18). Require two body lines so a heading cannot sit
            # alone in the leftover footer when the measured body is a single
            # squeezed line that the canvas then paginates away.
            section_height = 10 + 5 + body_height + 18
            min_keep = 10 + 5 + (line_height * 2) + 18
            if cursor + max(section_height, min_keep) <= bottom_y:
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


def _fitted_sidebar_body_elements(
    section_data: dict,
    *,
    left: float,
    width: float,
    ink: str,
    muted: str,
    body: str,
    font: str,
    body_top_offset: float = 6.0,
) -> list[dict]:
    """
    Body elements for one fitted sidebar section.

    Education emits separate diploma / school / meta / bullet textareas (matching
    single-column ``_place_education_record``). Flat sections stay one textarea.
    """
    body_top = float(section_data["body_top"]) + body_top_offset
    font_size = float(section_data["fontSize"])
    line_height = float(section_data["lineHeight"])

    if section_data.get("structured") and section_data.get("kind") == "education":
        type_sizes = _sidebar_education_type_sizes(font_size, line_height)
        return _build_sidebar_education_elements(
            section_data.get("entries") or [],
            left=left,
            top=body_top,
            width=width,
            ink=ink,
            muted=muted,
            body=body,
            font=font,
            **type_sizes,
        )

    return [{
        "category": "textarea",
        "content": section_data["content"],
        "left": left,
        "top": body_top,
        "width": width,
        "height": float(section_data["body_height"]),
        "fontSize": font_size,
        "lineHeight": line_height,
        "letterSpacing": 0,
        "color": body,
        "fontFamily": font,
        "zIndex": 3,
        "page": 1,
        "bold": False,
        "italic": False,
        "align": "left",
        "bulletList": bool(section_data.get("bulletList")),
        "autoHeight": True,
        "preserveInitialLayout": True,
    }]
