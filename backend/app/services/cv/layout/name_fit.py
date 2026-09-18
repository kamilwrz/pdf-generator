"""Render-only fitting for legacy managed masthead names.

New editor payloads already contain browser-measured geometry. This fallback
repairs pre-fitting point-text and editorial textarea names with ReportLab
metrics without mutating saved content or replacing browser typography choices.
"""
from __future__ import annotations

from copy import deepcopy
import math

from app.services.documents.rendering.pdf import PDF_Generator


def _value(element, key, default=None):
    return element.get(key, default) if isinstance(element, dict) else getattr(element, key, default)


def _assign(element, key, value):
    if isinstance(element, dict):
        element[key] = value
    else:
        setattr(element, key, value)


def _number(value, default=0.0):
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def fit_legacy_masthead_names(elements, *, page_width=595.0):
    """Return isolated fitted elements for managed names lacking fit metadata.

    A name must have both a matching identity descriptor and its contact band;
    ordinary freeform text remains unchanged. Point text fits down to 14 pt;
    Vellum, Aurelia and Cadenza textareas retain their authored typography and
    wrap complete names. Both modes move downstream content by added height.
    Modern browser-fitted names keep their exact size, height and line records.
    The input element list and all nested descriptor dictionaries stay intact.
    """
    candidates = [element for element in elements if
                  _value(element, "category") in {"text", "textarea"}
                  and _value(element, "mastheadRole") == "name"
                  and not _value(element, "deleted", False)
                  and not isinstance(_value(element, "nameFit"), dict)]
    if not candidates:
        return elements
    result = deepcopy(elements)
    measure = PDF_Generator.__new__(PDF_Generator)
    pagination_template = None
    changed = False
    for name in result:
        if (_value(name, "category") not in {"text", "textarea"}
                or _value(name, "mastheadRole") != "name"
                or _value(name, "deleted", False)
                or isinstance(_value(name, "nameFit"), dict)):
            continue
        band_id = _value(name, "mastheadBandId")
        identity_element = next((element for element in result if
                                 isinstance(_value(element, "mastheadIdentity"), dict)
                                 and _value(element, "mastheadIdentity").get("id") == band_id), None)
        if identity_element is None:
            continue
        identity = _value(identity_element, "mastheadIdentity")
        contact_id = identity.get("contactBandId")
        wrap_mode = _value(name, "category") == "textarea"
        if wrap_mode and contact_id not in {"vellum-contact", "aurelia-contact", "cadenza-contact"}:
            continue
        contact_element = next((element for element in result if
                                isinstance(_value(element, "contactBand"), dict)
                                and _value(element, "contactBand").get("id") == contact_id), None)
        if contact_element is None:
            continue
        parked_contact = _value(contact_element, "profilePhotoMainContactBand")
        contact = parked_contact if isinstance(parked_contact, dict) else _value(contact_element, "contactBand")
        anchor = contact.get("anchor") or {}
        left, top = _number(_value(name, "left")), _number(_value(name, "top"))
        base = max(0.01, _number(_value(name, "fontSize"), 24.0))
        page = _number(_value(name, "page"), 1)
        right = min(_number(page_width, 595.0) - 24.0,
                    _number(anchor.get("rightLimit"), _number(page_width, 595.0) - 24.0))
        for element in result:
            photo_left = _number(_value(element, "left"))
            photo_top = _number(_value(element, "top"))
            if (_value(element, "photoSlot")
                    and not _value(element, "photoSlotHidden", False)
                    and not _value(element, "deleted", False)
                    and _number(_value(element, "page"), 1) == page
                    and photo_left > left
                    and photo_top <= top + base
                    and photo_top + _number(_value(element, "height")) >= top - base):
                right = min(right, photo_left - 12.0)
        width = right - left
        authored_width = _number(_value(name, "width"))
        if authored_width > 0:
            width = min(width, authored_width)
        if width <= 1:
            continue

        content = str(_value(name, "content", "") or "")
        if _value(name, "textTransform") == "uppercase":
            content = content.upper()
        family = _value(name, "fontFamily") or "Inter"
        bold, italic = bool(_value(name, "bold")), bool(_value(name, "italic"))
        tracking = _number(_value(name, "letterSpacing"))
        prepared = measure._prepare_styled(content, _value(name, "runs"), bold, italic, False, None)
        font, _, _ = measure._resolve_font(family, bold, italic)

        def measured_width(size):
            if prepared is not None:
                clean, styles = prepared
                return measure._styled_run_width(clean, styles, family, size, tracking)
            return measure._line_width(content, font, size, tracking)

        minimum = min(base, 14.0)
        if wrap_mode or (measured_width(base) <= width - 1.0 and "\n" not in content):
            fitted = base
        else:
            low, high = math.ceil(minimum * 100), math.floor(base * 100)
            # Search integer hundredths to avoid rounding a measured fit back
            # above the available width at the final serialization boundary.
            while low < high:
                middle = (low + high + 1) // 2
                if measured_width(middle / 100.0) <= width - 1.0 and "\n" not in content:
                    low = middle
                else:
                    high = middle - 1
            fitted = low / 100.0
        line_height = (_number(_value(name, "lineHeight"), fitted * 1.2)
                       if wrap_mode else round(fitted * 1.2, 2))
        if prepared is not None:
            clean, styles = prepared
            rows = len(measure._wrap_textarea_styled(
                clean, styles, family, fitted, tracking, width,
                (bold, italic, False, None), False,
            ))
        else:
            rows = len(measure._wrap_textarea(content, font, fitted, tracking, width))
        rows = max(1, rows)
        height = round(rows * line_height, 2)
        extra_height = round((rows - 1) * line_height, 2)
        policy = {"baseFontSize": base, "fittedFontSize": fitted,
                  "width": width, "extraHeight": extra_height}
        if wrap_mode:
            # Legacy canvas auto-height may have grown the name alone. The
            # title blueprint records the space actually allocated by the
            # generator, so do not treat the overlapping live box as settled.
            base_height = 33.0 if contact_id == "aurelia-contact" else 32.0
            gap = 15.0 if contact_id == "aurelia-contact" else 5.0
            title_spec = (identity.get("title") or {}).get("spec") or {}
            allocated_height = max(base_height, _number(title_spec.get("top"), top + base_height + gap) - top - gap)
            height = max(base_height, math.ceil(height))
            extra_height = height - allocated_height
            policy.update({"mode": "wrap", "baseHeight": base_height,
                           "baseLineHeight": line_height, "extraHeight": height - base_height})
        for key, value in {
            "fontSize": fitted, "width": width, "height": height,
            "lineHeight": line_height,
            "nameFit": policy,
        }.items():
            _assign(name, key, value)
        changed = True
        if extra_height == 0:
            continue

        # Only authored downstream flow moves: photo/sidebar/page chrome and
        # other pages retain their coordinates. Descriptor blueprints follow
        # the same displacement so later restore/reflow actions stay coherent.
        for element in result:
            if (wrap_mode and contact_id == "aurelia-contact"
                    and _number(_value(element, "page"), 1) == page
                    and _value(element, "id") == "aurelia-masthead-frame"):
                _assign(element, "height", _number(_value(element, "height")) + extra_height)
            if (element is not name and _number(_value(element, "page"), 1) == page
                    and not _value(element, "fixedToPage", False)
                    and not _value(element, "photoSlot")
                    and not _value(element, "deleted", False)
                    and _value(element, "flowRole") != "photo-contact-header"
                    and not (parked_contact and _value(element, "contactBandId") == contact_id
                             and _value(element, "contactChannel"))
                    and _value(element, "flowLane") != "sidebar"
                    and not str(_value(element, "flowRole", "")).startswith("sidebar")
                    and _number(_value(element, "top")) > top):
                _assign(element, "top", _number(_value(element, "top")) + extra_height)
        title = identity.get("title") or {}
        for spec in [title.get("spec"), *(title.get("decorations") or [])]:
            if isinstance(spec, dict) and "top" in spec:
                spec["top"] = _number(spec["top"]) + extra_height
        if "startY" in anchor:
            anchor["startY"] = _number(anchor["startY"]) + extra_height
        flow = contact.get("flow") or {}
        if "bodyTop" in flow:
            flow["bodyTop"] = _number(flow["bodyTop"]) + extra_height
        for element in result:
            blueprint = _value(element, "profilePhotoMainMastheadIdentity")
            if isinstance(blueprint, dict) and blueprint.get("id") == band_id:
                parked_title = blueprint.get("title") or {}
                for spec in [parked_title.get("spec"), *(parked_title.get("decorations") or [])]:
                    if isinstance(spec, dict) and "top" in spec:
                        spec["top"] = _number(spec["top"]) + extra_height
        pagination_template = (contact_id.removesuffix("-contact") if wrap_mode
                               else "monument" if band_id == "monument-masthead" else "slate")
    if pagination_template is not None:
        _carry_overflow_records(result, template=pagination_template)
    return result if changed else elements


def _carry_overflow_records(elements, *, template):
    """Carry newly displaced main records below the existing footer boundary.

    The generators already split records larger than a complete content page.
    Keep each remaining page-scoped flowGroup atomic and attach section chrome
    to its first record. Reuse authored gaps, preserve every existing page's
    inset, and append overflow ahead of that page's existing records. Only new
    continuation pages receive cloned repeatable page chrome; portraits and
    first-page ornaments never repeat. This operates on the isolated render
    copy and does not rewrite the stored document or its declared page count.
    """
    from app.services.cv.layout.primitives import CONTENT_BOTTOM

    def is_main(element):
        role = str(_value(element, "flowRole", ""))
        return (not _value(element, "deleted", False)
                and not _value(element, "fixedToPage", False)
                and not _value(element, "photoSlot")
                and not _value(element, "contactChannel")
                and not _value(element, "contactBand")
                and not _value(element, "mastheadIdentity")
                and _value(element, "flowLane") != "sidebar"
                and not role.startswith("sidebar")
                and not role.startswith("masthead")
                and role != "photo-contact-header")

    def bottom(element):
        height = _number(_value(element, "height"))
        if height <= 0 and _value(element, "category") == "text":
            height = _number(_value(element, "fontSize")) * 0.6
        return _number(_value(element, "top")) + max(0, height)

    body = sorted((element for element in elements if is_main(element)),
                  key=lambda element: (_number(_value(element, "page"), 1),
                                       _number(_value(element, "top"))))
    if not any(bottom(element) > CONTENT_BOTTOM + 0.01 for element in body):
        return
    groups = {}
    for element in body:
        group = _value(element, "flowGroup")
        if group:
            groups.setdefault((_number(_value(element, "page"), 1), group), []).append(element)

    units, pending, consumed = [], [], set()
    for element in body:
        if id(element) in consumed:
            continue
        if _value(element, "flowRole") == "section-chrome":
            pending.append(element)
            consumed.add(id(element))
            continue
        key = (_number(_value(element, "page"), 1), _value(element, "flowGroup"))
        members = groups.get(key, [element])
        members = [member for member in members if id(member) not in consumed]
        members = pending + members
        pending = []
        consumed.update(id(member) for member in members)
        units.append(members)
    if pending:
        units.append(pending)

    # Un-grouped grid cells and decorative chip pairs can share a vertical
    # interval. Carry that complete row together instead of stacking cells
    # which were authored side by side.
    merged = []
    for members in units:
        previous = merged[-1] if merged else None
        if (previous
                and _number(_value(previous[0], "page"), 1) == _number(_value(members[0], "page"), 1)
                and min(_number(_value(member, "top")) for member in members)
                < max(bottom(member) for member in previous) - 0.01):
            previous.extend(members)
        else:
            merged.append(members)
    units = merged

    continuation_top = {"monument": 72.0, "slate": 58.0}.get(template, 66.0)
    current_page, cursor, previous_source_page, previous_source_bottom = 1, 0.0, None, 0.0
    original_pages = {_number(_value(element, "page"), 1) for element in elements}
    for members in units:
        source_page = int(_number(_value(members[0], "page"), 1))
        source_top = min(_number(_value(member, "top")) for member in members)
        source_bottom = max(bottom(member) for member in members)
        height = source_bottom - source_top
        gap = max(0.0, source_top - previous_source_bottom) if source_page == previous_source_page else 10.0
        if source_page > current_page:
            current_page, cursor = source_page, 0.0
        desired_top = max(source_top if source_page == current_page else continuation_top,
                          cursor + gap if cursor else source_top)
        if desired_top + height > CONTENT_BOTTOM + 0.01:
            current_page += 1
            desired_top = continuation_top
        for member in members:
            _assign(member, "top", round(_number(_value(member, "top")) + desired_top - source_top, 2))
            _assign(member, "page", current_page)
        cursor = desired_top + height
        previous_source_page, previous_source_bottom = source_page, source_bottom

    # Existing continuation chrome is the preferred blueprint; page one is a
    # fallback for a previously single-page document. Explicit repeat flags
    # preserve the template author's distinction between rails and masthead.
    chrome_source_page = min((page for page in original_pages if page > 1), default=1)
    chrome = [element for element in elements if
              _number(_value(element, "page"), 1) == chrome_source_page
              and _value(element, "fixedToPage", False)
              and not _value(element, "photoSlot")
              and not _value(element, "deleted", False)
              and _value(element, "repeatOnContinuation", True) is not False]
    added_chrome = []
    for page in range(1, current_page + 1):
        if page in original_pages:
            continue
        clones = deepcopy(chrome)
        for element in clones:
            _assign(element, "page", page)
            element_id = _value(element, "element_id")
            if element_id is not None:
                _assign(element, "element_id", f"{element_id}-name-fit-{page}")
            content = str(_value(element, "content", "") or "")
            if (_value(element, "category") == "text" and content.isdigit()
                    and _number(_value(element, "top")) > CONTENT_BOTTOM):
                _assign(element, "content", str(page).zfill(len(content)))
        added_chrome.extend(clones)
    # render_elements preserves authored drawing order. Backgrounds appended
    # after carried records would paint over their content on a new page.
    elements[0:0] = added_chrome
