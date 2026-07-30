"""GPT-owned freestyle layout session (geometry corrector).

Builds a full multi-page A4 geometry snapshot for the model, then turns GPT
``changes`` / ``findings`` / ``moves`` into frontend ``layout_groups`` +
``layout_issues``. Python only validates ids, freezes locked chrome / identity,
and keeps patches on-page — it does not invent a second layout algorithm.
"""
from __future__ import annotations

import json
import re
from typing import Any

from app.services.cv_generator import A4_H
from app.services.layout_analysis import (
    AUTO_LAYOUT_CATEGORIES,
    EPSILON,
    _group,
    _number,
    extract_bounds,
)

# Soft cap so one response cannot teleport freestyle blocks across the page.
MAX_LAYOUT_MOVE_PX = 80.0
MAX_LAYOUT_MOVES = 40
MAX_LAYOUT_FINDINGS = 12
_SNAPSHOT_CATEGORIES = {
    "text", "textarea", "line", "image", "rectangle", "circle", "ellipse",
}
_VALID_SEVERITIES = {"critical", "high", "medium", "low", "review", "warning"}
_FROZEN_IDENTITY_ROLES_HINTS = (
    "PODSUMOWANIE", "DOŚWIADCZENIE", "WYKSZTAŁCENIE", "UMIEJĘTNOŚCI", "JĘZYKI",
    "SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES",
)
_SECTION_HEADER_HINTS = (
    "PODSUMOWANIE", "DOŚWIADCZENIE", "DOSWIADCZENIE", "WYKSZTAŁCENIE", "WYKSZTALCENIE",
    "UMIEJĘTNOŚCI", "UMIEJETNOSCI", "JĘZYKI", "JEZYKI", "HOBBY", "CERTYFIKATY",
    "SUMMARY", "EXPERIENCE", "EDUCATION", "SKILLS", "LANGUAGES", "CERTIFICATES",
)
# How far below a header we still look for its underline / first body peer.
_SECTION_LOOKAHEAD_PX = 56.0
# Gaps that differ from the peer median by more than this are flagged.
_SECTION_GAP_OUTLIER_PX = 3.0

DEFAULT_LAYOUT_QUESTION = (
    "Przeprowadź pełną korektę układu CV: rytm pionowych odstępów, odstępy między "
    "sekcjami i wpisami doświadczenia/wykształcenia, wyrównanie nagłówków, dat "
    "względem stanowisk, ikon/linii przy nagłówkach, spójność lewych marginesów "
    "i kolumn oraz nachodzenia. Zwróć grupy zmian tylko tam, gdzie trzeba."
)

LAYOUT_CORRECTOR_SYSTEM = """\
Jesteś korektorem układu freestyle CV na wielu stronach A4.
Analizujesz JSON elementów (text, textarea, image, line, kształty) ze współrzędnymi
left/top/width/height oraz page.

Twoim zadaniem jest wykrywanie i poprawianie WYŁĄCZNIE problemów geometrii:
- rytm pionowych odstępów,
- odstępy między sekcjami,
- odstępy między wpisami w doświadczeniu i wykształceniu,
- wyrównanie nagłówków,
- wyrównanie dat względem stanowisk lub tytułów,
- wyrównanie ikon, linii i tekstów należących do jednego nagłówka,
- spójność marginesów lewych,
- spójność odstępów pomiędzy kolumnami,
- nachodzenie elementów,
- zbyt małe lub zbyt duże przerwy.

NIE poprawiasz treści CV, pisowni, nazw stanowisk/firm, dat jako tekstu, fontów,
kolorów ani rozmiarów tekstu — chyba że użytkownik wyraźnie o to poprosi.

Zachowujesz wizję użytkownika (freestyle). Preferujesz najmniejszą zmianę, która
przywraca spójność względem dominującego rytmu peerów.
Gdy w JSON jest `section_rhythm`, odpowiadasz metryką `primary_gap` / `comparison`
(fakt z Pythona). Nie zastępujesz tego przez body.top−header.top ani icon.top−header.top.
Zwracasz WYŁĄCZNIE prawidłowy JSON (bez tekstu przed/po).
"""


def build_layout_snapshot(
    elements: list[dict[str, Any]],
    page_size: dict[str, Any] | None,
) -> dict[str, Any]:
    """Full multi-page canvas JSON for GPT layout analysis."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), float(A4_H))
    items: list[dict[str, Any]] = []

    for element in elements:
        if not isinstance(element, dict):
            continue
        element_id = str(element.get("element_id") or "")
        category = element.get("category")
        if not element_id or category not in _SNAPSHOT_CATEGORIES:
            continue

        locked = bool(element.get("locked") or element.get("fixedToPage"))
        content = str(element.get("content") or "")
        if category == "image":
            preview = "[image]"
        elif category in {"line", "rectangle", "circle", "ellipse"}:
            preview = f"[{category}]"
        else:
            preview = content[:280]

        measured = element.get("layout_bounds") if isinstance(element.get("layout_bounds"), dict) else {}
        item: dict[str, Any] = {
            "element_id": element_id,
            "category": category,
            "page": int(_number(element.get("page"), 1)),
            "left": round(_number(measured.get("left", element.get("left"))), 2),
            "top": round(_number(measured.get("top", element.get("top"))), 2),
            "width": round(_number(measured.get("width", element.get("width"))), 2),
            "height": round(_number(measured.get("height", element.get("height"))), 2),
            "zIndex": int(_number(element.get("zIndex"), 1)),
            "movable": not locked,
            "locked": locked,
            "fixedToPage": bool(element.get("fixedToPage")),
            "content": preview,
        }
        if category in {"text", "textarea"}:
            item.update({
                "fontSize": element.get("fontSize"),
                "fontFamily": element.get("fontFamily"),
                "bold": bool(element.get("bold")),
                "italic": bool(element.get("italic")),
                "align": element.get("align"),
                "color": element.get("color"),
                "lineHeight": element.get("lineHeight"),
                "content_height": element.get("content_height"),
                "clipped": bool(element.get("clipped")),
            })
        if category == "line":
            item["color"] = element.get("color")
            item["strokeWidth"] = element.get("strokeWidth") or element.get("borderWidth")
        items.append(item)

    items.sort(key=lambda row: (row["page"], row["top"], row["left"], row["element_id"]))
    pages = sorted({item["page"] for item in items}) or [1]
    section_rhythm = build_section_rhythm(items)
    return {
        "page": {
            "width": page_width,
            "height": page_height,
            "unit": "px",
            "format": "A4",
            "page_count": max(pages),
            "pages": pages,
        },
        "element_count": len(items),
        "movable_count": sum(1 for row in items if row["movable"]),
        "elements": items,
        # Precomputed peer gaps — GPT must trust these over hand-waved top-top diffs.
        "section_rhythm": section_rhythm,
        "constraints": {
            "max_moves": MAX_LAYOUT_MOVES,
            "max_findings": MAX_LAYOUT_FINDINGS,
            "max_delta_px": MAX_LAYOUT_MOVE_PX,
            "forbid_page_change": True,
            "forbid_resize_unless_clipped": True,
            "preserve_user_vision": True,
        },
    }


def _is_section_header_item(item: dict[str, Any]) -> bool:
    """True for short ALL-CAPS-ish section titles (not body text mentioning 'skills')."""
    if item.get("category") not in {"text", "textarea"}:
        return False
    content = str(item.get("content") or "").strip()
    if not content or len(content) > 48 or "\n" in content:
        return False
    letters = [ch for ch in content if ch.isalpha()]
    # Body copy like "Summary body" / "Skills list" must not count as a section header.
    if letters:
        upper_ratio = sum(1 for ch in letters if ch.isupper()) / len(letters)
        if upper_ratio < 0.7:
            return False
    upper = content.upper()
    return any(
        upper == hint or upper.startswith(hint + " ") or upper.startswith(hint + "\u00a0")
        for hint in _SECTION_HEADER_HINTS
    )


def _is_section_rule_item(item: dict[str, Any]) -> bool:
    """Thin wide horizontal rule — typical section underline."""
    if item.get("category") != "line":
        return False
    return _number(item.get("height")) <= 4.0 + EPSILON and _number(item.get("width")) >= 24.0


def _horizontal_overlap(a: dict[str, Any], b: dict[str, Any], *, min_ratio: float = 0.15) -> bool:
    left = max(_number(a.get("left")), _number(b.get("left")))
    right = min(
        _number(a.get("left")) + _number(a.get("width")),
        _number(b.get("left")) + _number(b.get("width")),
    )
    overlap = right - left
    if overlap <= 0:
        return False
    shorter = min(_number(a.get("width"), 1.0), _number(b.get("width"), 1.0))
    return overlap >= shorter * min_ratio


def _median(values: list[float]) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2.0


def build_section_rhythm(items: list[dict[str, Any]]) -> dict[str, Any]:
    """Precompute header → underline → first-body gaps for section peers.

    GPT previously mistook icon.top vs header.top (same row) for the vertical
    spacing under a section. These numbers use bottom edges:
    header_to_body = body.top − (header.top + header.height).
    """
    headers = [item for item in items if _is_section_header_item(item)]
    rows: list[dict[str, Any]] = []

    for header in headers:
        header_bottom = _number(header["top"]) + _number(header["height"])
        page = int(header.get("page") or 1)

        line = None
        line_gap = None
        for item in items:
            if item is header or int(item.get("page") or 1) != page:
                continue
            if not _is_section_rule_item(item):
                continue
            if _number(item["top"]) < header_bottom - EPSILON:
                continue
            if _number(item["top"]) > header_bottom + _SECTION_LOOKAHEAD_PX:
                continue
            if not _horizontal_overlap(header, item, min_ratio=0.2):
                continue
            gap = round(_number(item["top"]) - header_bottom, 2)
            if line is None or _number(item["top"]) < _number(line["top"]):
                line = item
                line_gap = gap

        body = None
        body_from_header = None
        body_from_line = None
        search_after = header_bottom
        if line is not None:
            search_after = max(search_after, _number(line["top"]) + _number(line["height"]))

        for item in items:
            if item is header or int(item.get("page") or 1) != page:
                continue
            if item.get("category") not in {"text", "textarea"}:
                continue
            if _is_section_header_item(item):
                continue
            if _number(item["top"]) < search_after - EPSILON:
                continue
            if _number(item["top"]) > search_after + 120.0:
                continue
            # Same main column: body starts near or to the right of header left,
            # but not a far sidebar column.
            if _number(item["left"]) + _number(item["width"]) < _number(header["left"]) - 8:
                continue
            if _number(item["left"]) > _number(header["left"]) + _number(header["width"]) + 40:
                continue
            if body is None or _number(item["top"]) < _number(body["top"]):
                body = item

        if body is not None:
            body_from_header = round(_number(body["top"]) - header_bottom, 2)
            if line is not None:
                line_bottom = _number(line["top"]) + _number(line["height"])
                body_from_line = round(_number(body["top"]) - line_bottom, 2)

        # Visual gap under section chrome: prefer line→body when an underline exists
        # (matches designer rulers like “6 px under the rule”). Else header→body.
        if isinstance(body_from_line, (int, float)):
            primary_gap = body_from_line
            primary_metric = "line_to_body_gap"
        else:
            primary_gap = body_from_header
            primary_metric = "header_to_body_gap"

        rows.append({
            "section": str(header.get("content") or "")[:48],
            "header_element_id": header["element_id"],
            "page": page,
            "header_top": round(_number(header["top"]), 2),
            "header_bottom": round(header_bottom, 2),
            "header_left": round(_number(header["left"]), 2),
            "line_element_id": line["element_id"] if line else None,
            "header_to_line_gap": line_gap,
            "body_element_id": body["element_id"] if body else None,
            "body_top": round(_number(body["top"]), 2) if body else None,
            "header_to_body_gap": body_from_header,
            "line_to_body_gap": body_from_line,
            "primary_gap": primary_gap,
            "primary_metric": primary_metric,
        })

    primary_gaps = [
        float(row["primary_gap"])
        for row in rows
        if isinstance(row.get("primary_gap"), (int, float))
    ]
    median_primary = _median(primary_gaps)

    outliers: list[dict[str, Any]] = []
    for row in rows:
        gap = row.get("primary_gap")
        if (
            not isinstance(gap, (int, float))
            or median_primary is None
            or abs(float(gap) - median_primary) <= _SECTION_GAP_OUTLIER_PX
        ):
            continue
        outliers.append({
            "section": row["section"],
            "metric": row.get("primary_metric") or "primary_gap",
            "gap": gap,
            "median": round(median_primary, 2),
            "delta_vs_median": round(float(gap) - median_primary, 2),
            "header_element_id": row["header_element_id"],
            "line_element_id": row.get("line_element_id"),
            "body_element_id": row["body_element_id"],
            "target_body_top": (
                round(_number(row["body_top"]) + (median_primary - float(gap)), 2)
                if isinstance(row.get("body_top"), (int, float))
                else None
            ),
            "hint": (
                f"{row['section']}: odstęp pod sekcją {gap:g} px "
                f"(metryka {row.get('primary_metric')}) vs mediana {median_primary:g} px. "
                "Ujednolic: przesuń treść sekcji (pierwszy wpis + dalsze elementy bloku) "
                f"o {(median_primary - float(gap)):.2f} px w pionie."
            ),
        })

    comparison = [
        {
            "section": row["section"],
            "primary_gap": row.get("primary_gap"),
            "primary_metric": row.get("primary_metric"),
            "header_to_body_gap": row.get("header_to_body_gap"),
            "line_to_body_gap": row.get("line_to_body_gap"),
            "body_element_id": row.get("body_element_id"),
        }
        for row in rows
    ]

    return {
        "sections": rows,
        "comparison": comparison,
        "median_primary_gap": round(median_primary, 2) if median_primary is not None else None,
        "median_header_to_body_gap": (
            None
            if (m := _median([
                float(row["header_to_body_gap"])
                for row in rows
                if isinstance(row.get("header_to_body_gap"), (int, float))
            ])) is None
            else round(m, 2)
        ),
        "median_line_to_body_gap": (
            None
            if (m := _median([
                float(row["line_to_body_gap"])
                for row in rows
                if isinstance(row.get("line_to_body_gap"), (int, float))
            ])) is None
            else round(m, 2)
        ),
        "outliers": outliers,
        "note": (
            "Główny metr wizualny = primary_gap (gdy jest linia: line_to_body_gap, inaczej "
            "header_to_body_gap). To jest miarka jak „6 px pod kreską”, NIE body.top−header.top "
            "i NIE icon.top−header.top. Przy pytaniu o odległość nagłówek↔pierwszy wpis "
            "odpowiadaj comparison[] / primary_gap. Przy outliers zaproponuj changes."
        ),
    }


def build_layout_user_prompt(
    snapshot: dict[str, Any],
    question: str,
    history_block: str = "",
) -> str:
    """User message: canvas JSON + corrector rules + response contract."""
    constraints = snapshot.get("constraints") or {}
    max_findings = int(constraints.get("max_findings") or MAX_LAYOUT_FINDINGS)
    max_moves = int(constraints.get("max_moves") or MAX_LAYOUT_MOVES)
    max_delta = float(constraints.get("max_delta_px") or MAX_LAYOUT_MOVE_PX)
    q = (question or "").strip() or DEFAULT_LAYOUT_QUESTION
    history = history_block or ""

    return f"""{history}STAN PŁÓTNA (wszystkie strony, px, origin = lewy górny róg strony):
{json.dumps(snapshot, ensure_ascii=False)}

POLECENIE / PYTANIE UŻYTKOWNIKA:
{q}

## Zasady analizy
1. Najpierw przeczytaj `section_rhythm.comparison` i `outliers` — to WYLICZONE przez
   Pythona odstępy pod sekcjami. Główna liczba = `primary_gap` (zwykle line→body,
   jak miarka „6 px pod kreską”). Gdy `outliers` nie jest puste, MUSISZ zaproponować
   `changes` ujednolicające do `median_primary_gap` (przesuń treść sekcji o
   `target_body_top` / delta z hint). Nie twierdź, że wszystko jest równe przy
   rozjeździe np. 6 vs 14 px.
2. Na pytanie „jaka odległość między nagłówkiem a pierwszym wpisem”:
   odpowiedz `primary_gap` + porównaj WSZYSTKIE sekcje z `comparison`.
   NIE zaczynaj od body.top − header.top (to daje mylące 22 px przy height≈19).
   NIGDY nie używaj icon.top − header.top jako odstępu sekcji.
3. Grupuj elementy logicznie (wpis doświadczenia: stanowisko + data + firma + opis).
4. Porównuj peery: nagłówki, wpisy, daty, opisy, ikony/linie z nagłówkami.
5. Gap pionowy między peerami:
   gap = next.top − (prev.top + prev.height)
   Dla całego wpisu bierz dolną krawędź bloku (max top+height elementów wpisu).
6. Nie przesuwaj bez potrzeby. Preferuj najmniejszą zmianę.
7. Relacje w bloku: przesuwając treść pod sekcją, przesuń wszystkie elementy wpisu /
   bloku o TEN SAM delta w jednej grupie `changes`.
8. Preferuj tylko top/left. width/height tylko gdy konieczne (clipped textarea).
9. Nie dopuszczaj nachodzenia. Nie zmieniaj content, page, category, fontów, kolorów.
10. Pomiń movable=false / locked / fixedToPage. Nie ruszaj imienia i roli pod zdjęciem
    (keep_element_ids). Max ±{max_delta:g} px na element; max {max_moves} ruchów;
    max {max_findings} grup.
11. Na czyste pytanie bez potrzeby patchy: status \"no_changes\", changes=[], summary po polsku.
    Ale jeśli `section_rhythm.outliers` wskazuje rozjazd (np. 6 vs 14), to NIE jest no_changes.

## Preferowane reguły (wskazówki, nie sztywne wartości)
- Nagłówki tego samego poziomu: zbliżony left.
- Ikona nagłówka wyrównana pionowo z tekstem nagłówka (osobna sprawa od rytmu pod sekcją).
- Linia dekoracyjna na osi wizualnej nagłówka, bez przechodzenia przez tekst.
- `header_to_body_gap` / `line_to_body_gap` ujednolicone do mediany z `section_rhythm`.
- Daty doświadczenia w jednej prawej kolumnie; wysokość zbliżona do stanowiska.
- Odstępy tytuł→firma, firma→opis, koniec wpisu→następny wpis: spójne w sekcji.
- Odstęp nad nową sekcją większy niż odstępy wewnątrz wpisu.
- Kolumny: spójne left i przerwy.

## Format odpowiedzi (WYŁĄCZNIE JSON)
NIE zwracaj pełnej tablicy corrected_elements (oszczędność tokenów).
Python zbuduje karty Podgląd/Zastosuj z `changes`.

{{
  "status": "corrected",
  "summary": "<odpowiedź po polsku: co znalazłeś / co proponujesz>",
  "keep_element_ids": ["..."],
  "changes": [
    {{
      "group": "DOŚWIADCZENIE — odstęp Citibank",
      "reason": "Medtronic kończy się top+height≈443.7, Citibank top:462 → przerwa 18 px vs typowe 13 px.",
      "severity": "high",
      "delta": {{"top": -5, "left": 0}},
      "elements": [
        {{
          "element_id": "...",
          "before": {{"top": 462, "left": 50}},
          "after": {{"top": 457, "left": 50}}
        }}
      ]
    }}
  ]
}}

Gdy układ jest spójny lub pytanie nie wymaga ruchów:
{{"status": "no_changes", "summary": "<odpowiedź po polsku>", "keep_element_ids": [], "changes": []}}

W `reason` cytuj konkretne left/top/gap jak w przykładach peerów.
Liczby jako number, nie string. Zachowaj oryginalne element_id.
"""


def _is_frozen_identity(raw: dict[str, Any], item: dict[str, Any]) -> bool:
    """Freeze large name / short ALL-CAPS role under the photo on page 1."""
    if item.get("category") not in {"text", "textarea"}:
        return False
    if int(item.get("page") or 1) != 1 or _number(item.get("top"), 999) > 240:
        return False
    font_size = _number(raw.get("fontSize"), item.get("fontSize", 12.0))
    content = str(raw.get("content") or "").strip()
    if font_size >= 18:
        return True
    if content and 10 <= font_size <= 16 and "\n" not in content and 3 <= len(content) <= 48:
        upper = content.upper()
        if content == upper and not any(hint in upper for hint in _FROZEN_IDENTITY_ROLES_HINTS):
            return True
    return False


def _unwrap_payload(raw: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {}
    if (
        isinstance(raw.get("findings"), list)
        or isinstance(raw.get("moves"), list)
        or isinstance(raw.get("changes"), list)
    ):
        return raw
    for key in ("result", "data", "layout", "response", "proposal"):
        nested = raw.get(key)
        if isinstance(nested, dict) and (
            isinstance(nested.get("findings"), list)
            or isinstance(nested.get("moves"), list)
            or isinstance(nested.get("changes"), list)
        ):
            return nested
    return raw


def _normalize_summary(payload: dict[str, Any], raw: dict[str, Any]) -> str:
    """Coerce summary/message (string or stats object) into Polish chat text."""
    for source in (payload, raw):
        value = source.get("summary")
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            parts: list[str] = []
            text = str(value.get("text") or value.get("message") or "").strip()
            if text:
                parts.append(text)
            issues = value.get("issues_found")
            changed = value.get("elements_changed")
            groups = value.get("groups_changed")
            stats: list[str] = []
            if isinstance(issues, (int, float)):
                stats.append(f"problemy: {int(issues)}")
            if isinstance(changed, (int, float)):
                stats.append(f"elementy: {int(changed)}")
            if isinstance(groups, (int, float)):
                stats.append(f"grupy: {int(groups)}")
            if stats:
                parts.append("; ".join(stats))
            if parts:
                return " — ".join(parts)
        message = source.get("message")
        if isinstance(message, str) and message.strip():
            return message.strip()
    status = str(payload.get("status") or raw.get("status") or "").strip()
    if status == "no_changes":
        return "Układ wygląda spójnie — nie proponuję przesunięć."
    return ""


def _slug_group_id(name: str, index: int) -> str:
    slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", (name or "").strip())[:40].strip("-")
    return slug or f"change-{index + 1}"


def _move_from_change_element(
    entry: dict[str, Any],
    *,
    group_delta: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Build a move dict (absolute top/left) from a changes[].elements item."""
    element_id = str(
        entry.get("element_id") or entry.get("id") or entry.get("elementId") or ""
    )
    if not element_id:
        return None

    after = entry.get("after") if isinstance(entry.get("after"), dict) else {}
    before = entry.get("before") if isinstance(entry.get("before"), dict) else {}
    delta = entry.get("delta") if isinstance(entry.get("delta"), dict) else None
    if delta is None and isinstance(group_delta, dict):
        delta = group_delta

    move: dict[str, Any] = {"element_id": element_id}

    if "top" in after or "left" in after:
        if "top" in after:
            move["top"] = _number(after.get("top"))
        if "left" in after:
            move["left"] = _number(after.get("left"))
        if "height" in after:
            move["height"] = _number(after.get("height"))
        if "width" in after:
            move["width"] = _number(after.get("width"))
        return move

    # Apply delta to before (or let validator treat dx/dy against canvas bounds).
    if isinstance(delta, dict) and ("top" in delta or "left" in delta or "dx" in delta or "dy" in delta):
        if "top" in before or "left" in before:
            base_top = _number(before.get("top"), 0.0)
            base_left = _number(before.get("left"), 0.0)
            move["top"] = base_top + _number(delta.get("top", delta.get("dy")), 0.0)
            move["left"] = base_left + _number(delta.get("left", delta.get("dx")), 0.0)
            return move
        move["dy"] = _number(delta.get("top", delta.get("dy")), 0.0)
        move["dx"] = _number(delta.get("left", delta.get("dx")), 0.0)
        return move

    # Bare top/left on the element entry.
    if "top" in entry or "left" in entry:
        if "top" in entry:
            move["top"] = _number(entry.get("top"))
        if "left" in entry:
            move["left"] = _number(entry.get("left"))
        return move

    return None


def _changes_to_findings(changes: list[Any]) -> list[dict[str, Any]]:
    """Map corrector ``changes[]`` groups into internal findings with moves."""
    findings: list[dict[str, Any]] = []
    for index, change in enumerate(changes):
        if not isinstance(change, dict):
            continue
        title = str(
            change.get("group") or change.get("title") or change.get("heading") or f"Zmiana układu #{index + 1}"
        ).strip()[:140]
        reason = str(
            change.get("reason") or change.get("analysis") or change.get("message") or ""
        ).strip()
        severity = str(change.get("severity") or "medium").strip().lower()
        if severity not in _VALID_SEVERITIES:
            severity = "medium"
        group_delta = change.get("delta") if isinstance(change.get("delta"), dict) else None
        elements = change.get("elements")
        if not isinstance(elements, list):
            elements = change.get("moves") if isinstance(change.get("moves"), list) else []

        moves: list[dict[str, Any]] = []
        for entry in elements:
            if not isinstance(entry, dict):
                continue
            # Nested after/before shape, or already a flat move.
            if "after" in entry or "before" in entry or "delta" in entry:
                move = _move_from_change_element(entry, group_delta=group_delta)
            elif "element_id" in entry or "id" in entry:
                # Flat move; optional shared group delta when only ids listed.
                if "top" not in entry and "left" not in entry and isinstance(group_delta, dict):
                    move = {
                        "element_id": str(entry.get("element_id") or entry.get("id") or ""),
                        "dy": _number(group_delta.get("top", group_delta.get("dy")), 0.0),
                        "dx": _number(group_delta.get("left", group_delta.get("dx")), 0.0),
                    }
                else:
                    move = dict(entry)
                    if "element_id" not in move and entry.get("id") is not None:
                        move["element_id"] = str(entry.get("id"))
            else:
                move = _move_from_change_element(entry, group_delta=group_delta)
            if move and move.get("element_id"):
                moves.append(move)

        findings.append({
            "id": _slug_group_id(title, index),
            "severity": severity,
            "title": title,
            "analysis": reason or title,
            "moves": moves,
        })
    return findings


def _extract_findings(raw: dict[str, Any]) -> list[dict[str, Any]]:
    payload = _unwrap_payload(raw)

    changes = payload.get("changes")
    if isinstance(changes, list) and changes:
        return _changes_to_findings(changes)

    for key in ("findings", "issues", "problems"):
        value = payload.get(key)
        if isinstance(value, list) and value:
            return [item for item in value if isinstance(item, dict)]

    moves = payload.get("moves")
    if isinstance(moves, list) and moves:
        return [{
            "id": "layout-moves",
            "severity": "medium",
            "title": "Propozycje układu",
            "analysis": _normalize_summary(payload, raw if isinstance(raw, dict) else {}),
            "moves": moves,
        }]
    return []


def _finding_moves(finding: dict[str, Any]) -> list[dict[str, Any]]:
    for key in ("moves", "patches", "adjustments"):
        value = finding.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def _validated_patches(
    moves_raw: list[dict[str, Any]],
    *,
    bounds_by_id: dict[str, dict[str, Any]],
    raw_by_id: dict[str, dict[str, Any]],
    keep_ids: set[str],
    used_ids: set[str],
    page_width: float,
    page_height: float,
    limit: int,
) -> list[dict[str, Any]]:
    patches: list[dict[str, Any]] = []
    for entry in moves_raw:
        if len(patches) >= limit:
            break
        element_id = str(
            entry.get("element_id") or entry.get("id") or entry.get("elementId") or ""
        )
        if not element_id or element_id in used_ids:
            continue
        original = bounds_by_id.get(element_id)
        raw = raw_by_id.get(element_id)
        if original is None or raw is None:
            continue
        if raw.get("locked") or raw.get("fixedToPage") or element_id in keep_ids:
            continue
        if _is_frozen_identity(raw, original):
            continue

        if "top" in entry or "left" in entry:
            desired_left = _number(entry.get("left"), original["left"])
            desired_top = _number(entry.get("top"), original["top"])
        else:
            desired_left = original["left"] + _number(entry.get("dx") or entry.get("delta_x"), 0.0)
            desired_top = original["top"] + _number(entry.get("dy") or entry.get("delta_y"), 0.0)

        delta_left = max(-MAX_LAYOUT_MOVE_PX, min(MAX_LAYOUT_MOVE_PX, desired_left - original["left"]))
        delta_top = max(-MAX_LAYOUT_MOVE_PX, min(MAX_LAYOUT_MOVE_PX, desired_top - original["top"]))
        new_left = round(original["left"] + delta_left, 2)
        new_top = round(original["top"] + delta_top, 2)
        new_top = max(0.0, min(new_top, page_height - max(original["height"], 1.0)))
        new_left = max(0.0, min(new_left, page_width - max(original["width"] * 0.2, 1.0)))

        patch: dict[str, Any] = {
            "element_id": element_id,
            "left": new_left,
            "top": new_top,
            "page": original["page"],
        }
        # Optional height expand for clipped textareas when GPT requests it.
        if "height" in entry and original.get("category") == "textarea":
            desired_h = _number(entry.get("height"), original["height"])
            if desired_h > original["height"] + EPSILON:
                patch["height"] = round(min(desired_h, page_height - new_top), 2)

        if (
            abs(patch["left"] - original["left"]) <= EPSILON
            and abs(patch["top"] - original["top"]) <= EPSILON
            and "height" not in patch
        ):
            continue

        used_ids.add(element_id)
        patches.append(patch)
    return patches


def compile_layout_gpt_response(
    elements: list[dict[str, Any]],
    gpt_raw: dict[str, Any],
    page_size: dict[str, Any] | None,
) -> tuple[list[dict[str, Any]], list[dict[str, str]], str, str]:
    """Return (layout_groups, layout_issues, summary, error_code)."""
    page_size = page_size or {}
    page_width = _number(page_size.get("width"), 595.0)
    page_height = _number(page_size.get("height"), float(A4_H))
    if page_width <= 0 or page_height <= 0:
        return [], [], "", "invalid_page_size"

    raw = gpt_raw if isinstance(gpt_raw, dict) else {}
    payload = _unwrap_payload(raw)
    summary = _normalize_summary(payload, raw)
    status = str(payload.get("status") or raw.get("status") or "").strip().lower()
    findings = _extract_findings(raw)

    if not findings:
        # Explicit no-op from the corrector or empty change lists.
        if status == "no_changes":
            return [], [], summary or "Układ wygląda spójnie — nie proponuję przesunięć.", ""
        if isinstance(payload.get("changes"), list) and not payload["changes"]:
            return [], [], summary, ""
        if isinstance(payload.get("findings"), list) and not payload["findings"]:
            return [], [], summary, ""
        if isinstance(payload.get("moves"), list) and not payload["moves"]:
            return [], [], summary, ""
        # Pure Q&A answer without geometry patches is still valid.
        if summary:
            return [], [], summary, ""
        return [], [], "", "empty_response"

    keep_ids = {
        str(element_id)
        for element_id in (payload.get("keep_element_ids") or raw.get("keep_element_ids") or [])
        if isinstance(element_id, str)
    }
    all_bounds = extract_bounds(
        elements,
        AUTO_LAYOUT_CATEGORIES | {"line", "rectangle", "circle", "ellipse"},
    )
    bounds_by_id = {item["element_id"]: item for item in all_bounds}
    raw_by_id = {
        str(element.get("element_id")): element
        for element in elements
        if isinstance(element, dict) and element.get("element_id")
    }

    groups: list[dict[str, Any]] = []
    issues: list[dict[str, str]] = []
    used_ids: set[str] = set()
    remaining = MAX_LAYOUT_MOVES

    for index, finding in enumerate(findings[:MAX_LAYOUT_FINDINGS]):
        title = str(finding.get("title") or finding.get("heading") or f"Problem układu #{index + 1}").strip()[:140]
        analysis = str(
            finding.get("analysis")
            or finding.get("reason")
            or finding.get("message")
            or ""
        ).strip()
        severity = str(finding.get("severity") or "medium").strip().lower()
        if severity not in _VALID_SEVERITIES:
            severity = "medium"
        issues.append({"severity": severity, "message": (analysis or title)[:700]})

        moves = _finding_moves(finding)
        if not moves or remaining <= 0:
            continue
        patches = _validated_patches(
            moves,
            bounds_by_id=bounds_by_id,
            raw_by_id=raw_by_id,
            keep_ids=keep_ids,
            used_ids=used_ids,
            page_width=page_width,
            page_height=page_height,
            limit=remaining,
        )
        if not patches:
            continue
        remaining -= len(patches)

        working = {eid: dict(item) for eid, item in bounds_by_id.items()}
        for patch in patches:
            node = working.get(patch["element_id"])
            if not node:
                continue
            node["left"] = patch["left"]
            node["top"] = patch["top"]
            if "height" in patch:
                node["height"] = patch["height"]

        finding_id = str(finding.get("id") or f"finding-{index + 1}")
        finding_id = "".join(ch if ch.isalnum() or ch in "-_" else "-" for ch in finding_id)[:48]
        group = _group(
            group_id=f"layout-{finding_id}",
            title=title,
            reason=(analysis or title)[:800],
            severity=severity,
            patches=patches,
            items=list(working.values()),
            page_width=page_width,
            page_height=page_height,
            allow_overlap=True,
        )
        if group is None:
            continue
        group["target_page"] = min(p.get("page", 1) for p in patches)
        group["page_count"] = max(
            max((el.get("page") or 1) for el in elements if isinstance(el, dict)),
            max(p.get("page", 1) for p in patches),
        )
        groups.append(group)

    return groups, issues, summary, ""
