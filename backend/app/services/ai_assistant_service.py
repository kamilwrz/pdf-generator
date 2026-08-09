"""
AI Assistant service — powers the floating AI chat panel.

Each action receives the current canvas elements, builds a focused prompt,
calls GPT, and returns a structured response the frontend can render
(message text, rating, tips, element-level correction patches).

Safety invariants:
- Style/content corrections may only patch `_ALLOWED_FIELDS` (never left/top/
  width/height/page). Positional edits go through layout_analysis review cards.
- Template chrome (`fixedToPage` / `locked`) must not be rewritten by design
  rating or destructive AI operations.
- Provider failures raise `AIServiceError` for the app-level handler.
"""
import json
import os
import re
from openai import OpenAI, APIError
from app.core.config import OPENAI_API_KEY
from app.services.layout_analysis import (
    extract_bounds,
    resolve_clone_operation,
    resolve_delete_operation,
    resolve_directed_operation,
    resolve_restructure_section,
    summarize_geometry_issues,
)
from app.services.layout_gpt import (
    DEFAULT_LAYOUT_QUESTION,
    LAYOUT_CORRECTOR_SYSTEM,
    MAX_LAYOUT_MOVE_PX,
    build_layout_snapshot,
    build_layout_user_prompt,
    compile_layout_gpt_response,
)
from app.services.openai_pricing import empty_usage, usage_from_response

# Default assistant model for ratings / chat / grammar / ATS / …
_MODEL = os.getenv("AI_ASSISTANT_MODEL", "gpt-5.4-mini")
# Layout uses the cost-efficient GPT-5.6 Luna model. Operators can override
# this default through AI_LAYOUT_MODEL without changing the action dispatcher.
_LAYOUT_MODEL = os.getenv("AI_LAYOUT_MODEL", "gpt-5.6-luna")
# Luna supports none/low/medium/high — use the ceiling by default for Układ.
# Pair with AI_LAYOUT_MAX_COMPLETION_TOKENS (default 48k) so hidden reasoning
# does not empty the visible JSON budget on full A4 snapshots.
_LAYOUT_REASONING_EFFORT = (
    os.getenv("AI_LAYOUT_REASONING_EFFORT", "high").strip().lower() or "high"
)
# Fast mode (service_tier fast/priority) ~2× Luna token price for lower latency.
# Set AI_LAYOUT_SERVICE_TIER=default (or empty) to bill/run Standard processing.
_LAYOUT_SERVICE_TIER_RAW = os.getenv("AI_LAYOUT_SERVICE_TIER", "fast").strip().lower()
# Reasoning models spend completion budget on hidden thinking before any JSON
# appears. OpenAI recommends ~25k+ headroom for reasoning + visible output;
# full-canvas layout with effort=high regularly exhausted the old 16k cap and
# returned empty content that the UI showed as "assistant unavailable".
_DEFAULT_MAX_COMPLETION_TOKENS = 16_000
_LAYOUT_MAX_COMPLETION_TOKENS = int(
    os.getenv("AI_LAYOUT_MAX_COMPLETION_TOKENS", "48000")
)
_client = OpenAI(api_key=OPENAI_API_KEY)

_EMPTY_REASONING_BUDGET_MESSAGE = (
    "Analiza układu wyczerpała limit odpowiedzi modelu (zbyt dużo „myślenia” "
    "przy pełnym JSON A4). Spróbuj węższego zlecenia — np. tylko odstępy pod "
    "nagłówkami albo między wpisami — albo uruchom pełną korektę ponownie."
)


def _model_for_action(action: str) -> str:
    """Pick the OpenAI model id for this assistant action."""
    if action == "layout":
        return _LAYOUT_MODEL
    return _MODEL


def _max_completion_tokens_for_action(action: str) -> int:
    """Completion budget including reasoning tokens for this action."""
    if action == "layout":
        return max(_LAYOUT_MAX_COMPLETION_TOKENS, _DEFAULT_MAX_COMPLETION_TOKENS)
    return _DEFAULT_MAX_COMPLETION_TOKENS


def _reasoning_effort_for_action(action: str) -> str:
    """Pick reasoning effort. Layout defaults to high (Luna's maximum)."""
    if action == "layout":
        # gpt-5.6-luna accepts none/low/medium/high. Keep xhigh/max in the
        # allow-list for env overrides if the model id is swapped upward.
        allowed = {"none", "minimal", "low", "medium", "high", "xhigh", "max"}
        if _LAYOUT_REASONING_EFFORT in allowed:
            return _LAYOUT_REASONING_EFFORT
        return "high"
    return "medium"


def _service_tier_for_action(action: str) -> str | None:
    """Optional Fast mode tier for layout; None means Standard (omit param)."""
    if action != "layout":
        return None
    raw = _LAYOUT_SERVICE_TIER_RAW
    if raw in {"", "auto", "default", "standard", "none", "off"}:
        return None
    if raw in {"fast", "priority"}:
        return raw
    # Unknown override — keep Fast as the product default for Układ.
    return "fast"


class AIServiceError(Exception):
    """Raised when the AI Assistant's OpenAI call fails in an expected way
    (timeout, rate limit, connection error, malformed/empty response).
    Caught by the app-level exception_handler in main.py, which logs full
    context server-side and returns a safe Polish message."""

    def __init__(
        self,
        message: str,
        *,
        action: str = "",
        elements_count: int = 0,
        original: Exception | None = None,
        user_message: str | None = None,
    ):
        super().__init__(message)
        self.action = action
        self.elements_count = elements_count
        self.original = original
        # Optional safe, user-facing Polish copy. When set, the HTTP handler
        # returns it instead of the generic "temporarily unavailable" text.
        self.user_message = user_message

# Fields that corrections are ALLOWED to patch.
# Positional fields (left, top, width, height, zIndex, page) are intentionally
# excluded — letting GPT touch those caused elements to overlap icons.
_CONTENT_FIELDS  = {"content"}
_STYLE_FIELDS    = {"fontSize", "fontFamily", "color", "bold", "italic", "align"}
_ALLOWED_FIELDS  = _CONTENT_FIELDS | _STYLE_FIELDS


# ── helpers ────────────────────────────────────────────────────────────────

def _extract_text(elements: list[dict]) -> str:
    lines = []
    for el in elements:
        if el.get("category") in ("text", "textarea") and el.get("content"):
            lines.append(el["content"].replace("\\n", " "))
    return "\n".join(lines)


def _extract_structured(elements: list[dict]) -> list[dict]:
    return [
        {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "content": el.get("content", ""),
            "fontSize": el.get("fontSize"),
            "lineHeight": el.get("lineHeight"),
            "fontFamily": el.get("fontFamily"),
            # Always emit color so style-match prompts can read peers; missing
            # values fall back to the canvas default ink used by the editor.
            "color": el.get("color") or "#2B2B2B",
            "bold": el.get("bold", False),
            "italic": el.get("italic", False),
            "align": el.get("align", "left"),
        }
        for el in elements
        if el.get("category") in ("text", "textarea") and el.get("content")
    ]


def _extract_positional(elements: list[dict]) -> list[dict]:
    """Content, style, and geometry plus geometry-only visual elements.

    Text is the only editable content. Images, lines, rectangles, circles, and ellipses are also
    emitted for chat commands so the AI can explicitly place every visible
    canvas element without being allowed to invent raw coordinates.
    """
    bounds_by_id = {b["element_id"]: b for b in extract_bounds(elements)}
    structured = _extract_structured(elements)
    for item in structured:
        bounds = bounds_by_id.get(item["element_id"])
        if bounds:
            item["left"] = bounds["left"]
            item["top"] = bounds["top"]
            item["width"] = bounds["width"]
            item["height"] = bounds["height"]
            item["page"] = bounds["page"]
            if bounds.get("fixedToPage"):
                item["fixedToPage"] = True
            if bounds.get("locked"):
                item["locked"] = True

    included_ids = {item["element_id"] for item in structured}
    visual_labels = {
        "image": "[obraz]",
        "line": "[linia]",
        "rectangle": "[prostokąt]",
        "circle": "[koło]",
        "ellipse": "[elipsa]",
    }
    for el in elements:
        element_id = el.get("element_id")
        category = el.get("category")
        if category not in visual_labels or element_id in included_ids:
            continue
        bounds = bounds_by_id.get(element_id)
        if not bounds:
            continue
        structured.append({
            "element_id": element_id,
            "category": category,
            "content": visual_labels[category],
            "color": el.get("backgroundColor"),
            "borderWidth": el.get("borderWidth"),
            "left": bounds["left"],
            "top": bounds["top"],
            "width": bounds["width"],
            "height": bounds["height"],
            "page": bounds["page"],
            **({"filled": bool(el.get("filled", False))} if category in {"circle", "ellipse"} else {}),
            **({"fixedToPage": True} if bounds.get("fixedToPage") else {}),
            **({"locked": True} if bounds.get("locked") else {}),
        })
    return structured


def _primary_identity_id(elements: list[dict]) -> str | None:
    """Return the largest editable one-line text element used as template identity.

    The bundled templates deliberately contrast the candidate's name with the
    body typeface, commonly using a serif face for the name and a sans-serif
    face elsewhere. This semantic marker prevents the design rater from
    treating that intentional contrast as an inconsistent font choice.
    """
    candidates: list[tuple[float, str]] = []
    for element in elements:
        element_id = element.get("element_id")
        if (
            not element_id
            or element.get("category") != "text"
            or not str(element.get("content") or "").strip()
            or "\n" in str(element.get("content") or "")
            or element.get("fixedToPage")
            or element.get("locked")
        ):
            continue
        try:
            font_size = float(element.get("fontSize") or 0)
        except (TypeError, ValueError):
            continue
        if font_size >= 16:
            candidates.append((font_size, str(element_id)))

    return max(candidates, default=(0.0, ""))[1] or None


def _extract_typography(elements: list[dict]) -> list[dict]:
    """Build a style-only view with the intentional primary identity marked."""
    primary_identity_id = _primary_identity_id(elements)
    items = []
    for el in elements:
        if el.get("category") not in ("text", "textarea") or not el.get("content"):
            continue
        item = {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "fontSize": el.get("fontSize"),
            "fontFamily": el.get("fontFamily"),
            "color": el.get("color"),
            "bold": el.get("bold"),
            "italic": el.get("italic"),
            "align": el.get("align"),
            "preview": (el.get("content") or "")[:60],
        }
        if el.get("fixedToPage"):
            item["fixedToPage"] = True
        if el.get("locked"):
            item["locked"] = True
        if el.get("element_id") == primary_identity_id:
            item["templateRole"] = "primary_identity"
        items.append(item)
    return items


def _protected_typography_ids(elements: list[dict]) -> set[str]:
    """Return template chrome, locked text, and the primary identity element."""
    protected_ids = {
        el.get("element_id")
        for el in elements
        if el.get("element_id") and (el.get("fixedToPage") or el.get("locked"))
    }
    if primary_identity_id := _primary_identity_id(elements):
        protected_ids.add(primary_identity_id)
    return protected_ids


def _strip_protected_corrections(result: dict, protected_ids: set[str]) -> dict:
    if not protected_ids:
        return result
    corrections = [
        patch for patch in result.get("corrections", [])
        if isinstance(patch, dict) and patch.get("element_id") not in protected_ids
    ]
    if corrections == result.get("corrections", []):
        return result
    return {**result, "corrections": corrections}


def _gpt(system: str, user: str, *, action: str = "") -> tuple[dict, dict]:
    """Call the assistant model and return (parsed_json, usage_cost)."""
    model = _model_for_action(action)
    reasoning_effort = _reasoning_effort_for_action(action)
    max_completion_tokens = _max_completion_tokens_for_action(action)
    service_tier = _service_tier_for_action(action)
    create_kwargs: dict = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
        "reasoning_effort": reasoning_effort,
        "max_completion_tokens": max_completion_tokens,
    }
    # Fast mode: lower latency at ~2× Luna token rates. Metering uses the same
    # tier so credits stay aligned with OpenAI Fast mode pricing.
    if service_tier:
        create_kwargs["service_tier"] = service_tier
    try:
        resp = _client.chat.completions.create(**create_kwargs)
    except APIError as exc:
        # Covers APITimeoutError, RateLimitError, APIConnectionError, and any
        # other openai SDK failure — all are subclasses of APIError.
        raise AIServiceError(f"OpenAI request failed: {type(exc).__name__}", original=exc) from exc

    usage = usage_from_response(
        resp,
        model=model,
        action=action,
        service_tier=service_tier,
    )
    choice = resp.choices[0]
    content = choice.message.content or ""
    finish_reason = getattr(choice, "finish_reason", None)
    if not content.strip():
        # High-effort layout often burns the whole completion budget on hidden
        # reasoning tokens and finishes with length + empty visible JSON.
        # Surface a recoverable tip instead of the generic "unavailable" copy.
        if finish_reason == "length" or action == "layout":
            user_message = (
                _EMPTY_REASONING_BUDGET_MESSAGE
                if action == "layout"
                else (
                    "Model wyczerpał limit odpowiedzi. Spróbuj ponownie albo "
                    "uprość polecenie."
                )
            )
            raise AIServiceError(
                f"Model returned empty content (finish_reason={finish_reason}, "
                f"max_completion_tokens={max_completion_tokens})",
                action=action,
                user_message=user_message,
            )
        raise AIServiceError(
            f"Model returned empty content (finish_reason={finish_reason})"
        )
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.rsplit("```", 1)[0].strip()
    try:
        return json.loads(stripped), usage
    except json.JSONDecodeError as exc:
        raise AIServiceError(f"OpenAI returned malformed JSON: {exc}", original=exc) from exc


def _gpt_result(
    system: str,
    user: str,
    *,
    action: str = "",
    allowed_fields: set | None = None,
) -> dict:
    raw, usage = _gpt(system, user, action=action)
    result = _safe_result(raw, allowed_fields=allowed_fields or _ALLOWED_FIELDS)
    result["usage"] = usage
    return result


def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        return list(DDGS().text(query, max_results=max_results))
    except Exception:
        return []


def _normalize_categories(raw_categories) -> list[dict]:
    """Keep structured score breakdown for the rating dashboard UI.

    Each category needs a stable id, a Polish label, and numeric score/max so
    the frontend can render percentages without parsing tip strings.
    """
    if not isinstance(raw_categories, list):
        return []
    categories: list[dict] = []
    for item in raw_categories[:8]:
        if not isinstance(item, dict):
            continue
        cat_id = str(item.get("id") or "").strip()
        label = str(item.get("label") or "").strip()
        if not cat_id or not label:
            continue
        try:
            score = float(item.get("score"))
            max_score = float(item.get("max"))
        except (TypeError, ValueError):
            continue
        if max_score <= 0:
            continue
        # Clamp to the declared max so a model glitch cannot break the UI scale.
        score = max(0.0, min(score, max_score))
        categories.append({
            "id": cat_id,
            "label": label,
            "score": score,
            "max": max_score,
        })
    return categories


def _normalize_strengths(raw_strengths) -> list[str]:
    """Normalise short strength bullets for the rating dashboard."""
    if not isinstance(raw_strengths, list):
        return []
    return [str(s).strip() for s in raw_strengths if str(s).strip()][:5]


def _normalize_priorities(raw_priorities) -> list[dict]:
    """Normalise improvement priorities (title + optional description)."""
    if not isinstance(raw_priorities, list):
        return []
    priorities: list[dict] = []
    for item in raw_priorities[:5]:
        if isinstance(item, str) and item.strip():
            priorities.append({"title": item.strip(), "description": ""})
            continue
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        priorities.append({
            "title": title,
            "description": str(item.get("description") or "").strip(),
        })
    return priorities


# Matches prose scores like "8/10" or "8 / 10". The UI dashboard shows
# percentages (`rating * 10`), so leftover "/10" copy confuses users.
_SCORE_OVER_TEN_RE = re.compile(r"\b([1-9]|10)\s*/\s*10\b")


def _scrub_ten_scale_from_text(text: str) -> str:
    """Rewrite X/10 score mentions to X0% so prose matches the dashboard."""

    def _to_percent(match: re.Match) -> str:
        value = int(match.group(1))
        return f"{value * 10}%"

    return _SCORE_OVER_TEN_RE.sub(_to_percent, text)


def _safe_result(raw: dict, allowed_fields: set = _ALLOWED_FIELDS) -> dict:
    """Normalise GPT output. Strips any positional fields from corrections."""
    corrections = []
    for c in raw.get("corrections", []):
        if not isinstance(c, dict) or not c.get("element_id"):
            continue
        patch = {"element_id": c["element_id"]}
        for k, v in c.items():
            if k in allowed_fields:
                patch[k] = v
        if len(patch) > 1:
            corrections.append(patch)

    # Drop legacy "Rozkład oceny: …" tip strings — scores live in `categories`.
    tips = []
    for tip in raw.get("tips", []):
        text = str(tip).strip()
        if not text:
            continue
        if text.lower().startswith("rozkład oceny"):
            continue
        tips.append(_scrub_ten_scale_from_text(text))

    message = _scrub_ten_scale_from_text(str(raw.get("message", "")))
    strengths = [
        _scrub_ten_scale_from_text(s)
        for s in _normalize_strengths(raw.get("strengths"))
    ]
    priorities = []
    for item in _normalize_priorities(raw.get("priorities")):
        priorities.append({
            "title": _scrub_ten_scale_from_text(item["title"]),
            "description": _scrub_ten_scale_from_text(item["description"]),
        })

    return {
        "message": message,
        "rating": raw.get("rating") if isinstance(raw.get("rating"), int) else None,
        "tips": tips[:8],
        "corrections": corrections,
        "web_sources": [str(s) for s in raw.get("web_sources", [])][:5],
        "categories": _normalize_categories(raw.get("categories")),
        "strengths": strengths,
        "priorities": priorities,
    }


# ── action handlers ────────────────────────────────────────────────────────

def _rate_cv(text: str, elements: list[dict]) -> dict:
    """Overall CV quality rating (content-focused) with tips and optional patches."""
    structured = _extract_structured(elements)
    element_count = len(structured)

    system = (
        "Jesteś starszym rekruterem i coachem CV z ponad 15-letnim doświadczeniem w branży "
        "technologicznej, finansowej i konsultingowej. Udzielasz rygorystycznych, szczerych i konkretnych opinii. "
        "Nie wpisuj liczby oceny w `message` (ani jako X/10, ani jako procent) — interfejs pokazuje ją osobno. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeprowadź ustrukturyzowaną analizę poniższego CV według rubryki i oblicz dokładną ocenę.

TEKST CV (połączone wszystkie elementy tekstowe):
{text}

LICZBA ELEMENTÓW: na kanwie znaleziono {element_count} elementów text/textarea.

════════════════════════════════════════
RUBRYKA OCENY — przeanalizuj wyraźnie każdy etap przed zapisaniem końcowego JSON.

① KOMPLETNOŚĆ SEKCJI (0–2 pkt)
   Określ, które z sekcji są obecne: dane kontaktowe, podsumowanie/cel,
   doświadczenie zawodowe, wykształcenie, umiejętności/technologie.
   Wynik = (liczba obecnych sekcji / 5) × 2. Zaokrąglij do 1 miejsca po przecinku.

② JAKOŚĆ DOŚWIADCZENIA (0–3 pkt)
   Dla każdego wpisu dotyczącego stanowiska/roli:
   - Czy zaczyna się od mocnego czasownika działania? (Prowadziłem, Zbudowałem, Zaprojektowałem, Zwiększyłem…)
   - Czy zawiera co najmniej jeden mierzalny rezultat (%, zł, liczba, zaoszczędzony czas)?
   Przyznaj: 1 pkt, jeśli >60% punktów używa czasowników działania, 1 pkt, jeśli >40% zawiera metryki,
   1 pkt, jeśli role pokazują rozwój lub związek z docelową branżą.

③ JĘZYK I PROFESJONALIZM (0–2 pkt)
   Sprawdź: stronę bierną („byłem odpowiedzialny”), frazesy („gracz zespołowy”,
   „osoba z inicjatywą”, „pasjonuję się”), ogólniki oraz błędy gramatyczne i ortograficzne.
   2 pkt = brak problemów. 1 pkt = drobne problemy. 0 pkt = istotne problemy.

④ FORMAT I HIERARCHIA (0–2 pkt)
   Na podstawie liczby elementów i różnorodności treści: czy istnieje wyraźna hierarchia wizualna
   (imię > nagłówki > tekst główny)? Czy długość jest odpowiednia (1–2 strony)?
   Przyznaj do 2 pkt.

⑤ WYRÓŻNIENIE (0–1 pkt)
   Czy CV zawiera coś zapadającego w pamięć — wyjątkowe osiągnięcie, rzadką umiejętność,
   przykład przywództwa lub mierzalny wpływ wyróżniający kandydata?
   1 pkt, jeśli tak; 0 pkt, jeśli treść jest ogólna.

SUMA = ①+②+③+④+⑤, zaokrąglona do najbliższej liczby całkowitej, w zakresie 1–10.
════════════════════════════════════════

Zwróć JSON. Wyniki cząstkowe umieść TYLKO w `categories` (nie w tipach).
Nie dodawaj wskazówki zaczynającej się od „Rozkład oceny”.
W `message` NIE podawaj oceny liczbowej (zakazane: „8/10”, „80%”, „ocena 8”).
Interfejs wyświetla ocenę osobno jako procent.
{{
  "message": "<3–4 zdania: wskaż 1–2 konkretne mocne strony oraz 1–2 konkretne słabe strony. Bądź bezpośredni. Odnoś się do konkretnych treści z CV. Bez liczby oceny.>",
  "rating": <obliczona suma 1-10>,
  "categories": [
    {{"id": "completeness", "label": "Kompletność", "score": <0-2>, "max": 2}},
    {{"id": "experience", "label": "Doświadczenie", "score": <0-3>, "max": 3}},
    {{"id": "language", "label": "Język", "score": <0-2>, "max": 2}},
    {{"id": "structure", "label": "Struktura", "score": <0-2>, "max": 2}},
    {{"id": "standout", "label": "Wyróżnienie", "score": <0-1>, "max": 1}}
  ],
  "strengths": ["<mocna strona 1>", "<mocna strona 2>"],
  "priorities": [
    {{"title": "<krótki tytuł poprawki>", "description": "<1 zdanie z przykładem przed/po>"}}
  ],
  "tips": [
    "<najważniejsza poprawka z przykładem przed/po>",
    "<druga najważniejsza poprawka>",
    "<brakująca sekcja lub element, jeśli występuje>",
    "<możliwość kwantyfikacji: która rola/punkt wymaga metryki>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="rating")


def _rate_design(elements: list[dict], page_size: dict | None = None) -> dict:
    """Rate typography and visual consistency with a private safety score cap."""
    typo = json.dumps(_extract_typography(elements), ensure_ascii=False)
    protected_ids = _protected_typography_ids(elements)
    geometry = summarize_geometry_issues(elements, page_size)
    hard_faults = (
        geometry["overlaps"]
        + geometry["clips"]
        + geometry["decoration_hits"]
        + geometry["out_of_bounds"]
    )

    system = (
        "Jesteś ekspertem od typografii i projektowania wizualnego CV. "
        "CV jest zbudowane na gotowym szablonie produktowym — jego rozmiary czcionek, "
        "etykiety 8–9 px, metadane i numery stron są świadomym wyborem projektowym. "
        "Kontrast kroju pomiędzy głównym imieniem i nazwiskiem a tekstem CV jest również "
        "świadomym elementem szablonu, a nie niespójnością. "
        "Sugerujesz WYŁĄCZNIE zmiany rozmiaru i kroju czcionki, koloru, pogrubienia, kursywy oraz wyrównania tekstu. "
        "NIGDY nie zmieniasz pozycji elementów (left, top, width, height) — są ustalone przez szablon. "
        "NIGDY nie krytykuj absolutnych rozmiarów czcionek szablonu ani nie proponuj ich powiększania "
        "tylko dlatego, że są mniejsze niż w klasycznych CV. "
        "NIGDY nie proponuj corrections dla elementów z fixedToPage=true ani locked=true. "
        "Oceniaj wyłącznie typografię i spójność wizualną, bez opisywania geometrii dokumentu. "
        "Nie wpisuj liczby oceny w `message`, ponieważ interfejs wyświetla ją osobno. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeanalizuj typografię i styl tekstu na tej kanwie CV.

DANE TYPOGRAFICZNE (bez pozycji — nie sugeruj zmian left/top/width/height):
{typo}

════════════════════════════════════════
KONTEKST PRODUKTOWY (OBOWIĄZKOWY):
- To ocena CV w edytorze szablonów. Typografia startowa pochodzi z szablonu, nie z błędu użytkownika.
- Małe czcionki (np. 8–9 px etykiet sidebara, kontaktu, „OBSZARY”, numerów stron) są normalne i poprawne.
- Nie obniżaj oceny za „zbyt małą czcionkę”, jeśli rozmiary są spójne w ramach systemu szablonu.
- Krytykuj wyłącznie niespójność: złamaną hierarchię, mieszane wyrównanie, odstające kolory, przypadkowe bold.
- Elementy z fixedToPage=true / locked=true to chrome szablonu — pomiń je w message, tips i corrections.
- Element z templateRole="primary_identity" jest największym napisem tożsamościowym, zwykle imieniem i nazwiskiem.
  Jego inny fontFamily, większy rozmiar i pogrubienie są celowym kontrastem szablonu: nie krytykuj ich, nie
  proponuj dla niego corrections i nie obniżaj za nie oceny.
- Ocena 8–10 oznacza spójny szablon bez jednoznacznej, możliwej do wskazania poprawki. Ocena 6–7 wymaga co
  najmniej jednej konkretnej niespójności. Ocena 1–5 jest zarezerwowana dla wielu wyraźnych błędów typografii,
  niezależnych od celowej różnicy kroju w nagłówku tożsamościowym.

ETAPY ANALIZY:

① HIERARCHIA (względem siebie, nie względem uniwersalnych px)
   Czy widać względną progresję: imię/nazwisko > nagłówki sekcji > tekst główny > etykiety meta?
   Nie wymagaj konkretnych zakresów px. Wskaż tylko elementy, które ŁAMIĄ istniejącą hierarchię szablonu.

② POGRUBIENIE I WYRÓŻNIENIE
   Czy nagłówki są konsekwentnie pogrubione? Czy pogrubienie jest nadużywane (jeśli wszystko jest pogrubione, nic się nie wyróżnia)?

③ SPÓJNOŚĆ KOLORÓW
   Czy kolory tekstu są używane konsekwentnie? Zidentyfikuj elementy o odstającym kolorze względem palety szablonu.

④ WYRÓWNANIE
   Czy tekst główny jest konsekwentnie wyrównany do lewej? Czy nagłówki są wyrównane konsekwentnie?
   Mieszane wyrównanie w jednej sekcji wygląda nieprofesjonalnie.

⑤ OCENA OGÓLNA
   Na podstawie punktów ①–④ przyznaj ocenę projektu w skali 1–10.
════════════════════════════════════════

Zwracaj poprawki WYŁĄCZNIE dla jednoznacznych niespójności względem reszty szablonu.
Każda poprawka może zawierać WYŁĄCZNIE pola: fontSize, fontFamily, color, bold, italic, align.
Nie proponuj zwiększania fontSize „dla czytelności”, jeśli element pasuje do peera w szablonie.
Nie uwzględniaj wartości element_id z danych powyżej, jeśli nie masz pewności, że wymagają zmiany.

Zwróć JSON. Wyniki cząstkowe umieść TYLKO w `categories` (nie w tipach).
Nie dodawaj wskazówki zaczynającej się od „Rozkład oceny”.
{{
  "message": "<2–3 zdania o hierarchii, wyróżnieniach, kolorach i wyrównaniu. Nie podawaj liczby oceny ani geometrii dokumentu.>",
  "rating": <1-10>,
  "categories": [
    {{"id": "hierarchy", "label": "Hierarchia", "score": <0-3>, "max": 3}},
    {{"id": "emphasis", "label": "Wyróżnienie", "score": <0-2>, "max": 2}},
    {{"id": "color", "label": "Kolor", "score": <0-2>, "max": 2}},
    {{"id": "alignment", "label": "Wyrównanie", "score": <0-2>, "max": 2}},
    {{"id": "overall", "label": "Ocena ogólna", "score": <0-1>, "max": 1}}
  ],
  "strengths": ["<mocna strona typografii>"],
  "priorities": [
    {{"title": "<krótki tytuł poprawki>", "description": "<konkretna niespójność>"}}
  ],
  "tips": [
    "<konkretna poprawka typografii z podglądem elementu>",
    "<druga konkretna poprawka>"
  ],
  "corrections": [
    {{"element_id": "<id>", "bold": true}},
    {{"element_id": "<id>", "align": "left"}}
  ],
  "web_sources": []
}}"""
    result = _gpt_result(system, user, action="design_rating", allowed_fields=_STYLE_FIELDS)
    result = _strip_protected_corrections(result, protected_ids)

    # A low visual score must be supported by a concrete, editable discrepancy.
    # Once template chrome and the intentional primary identity are excluded,
    # an empty correction list means the model found no actionable inconsistency.
    # Keep the baseline at 8 instead of returning an unsubstantiated low score.
    if hard_faults == 0 and not result.get("corrections") and isinstance(result.get("rating"), int):
        result["rating"] = max(result["rating"], 8)

    # Keep structural faults out of the design report, but never let a document
    # with unreadable or off-page content receive a high visual-design score.
    if hard_faults > 0:
        capped = min(int(result["rating"]) if isinstance(result.get("rating"), int) else 5, 5)
        result["rating"] = max(1, capped)
    return result


def _rate_position(text: str, job_description: str) -> dict:
    """Score CV fit against a job description, optionally using web context."""
    jd_preview = job_description[:120]
    sources = _ddg_search(f"{jd_preview} required skills qualifications job requirements 2025")
    web_ctx = "\n".join(
        f"- {r.get('title', '')}: {r.get('body', '')[:250]}"
        for r in sources
    )
    web_urls = [r.get("href", "") for r in sources if r.get("href")]

    system = (
        "Jesteś starszym doradcą zawodowym i managerem rekrutującym. "
        "Przygotowujesz szczerą, obliczoną ocenę dopasowania CV do opisu stanowiska. "
        "Nie wpisuj liczby oceny w `message` (ani jako X/10, ani jako procent) — interfejs pokazuje ją osobno. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Oblicz, jak dobrze to CV pasuje do opisu stanowiska. Oceń je w skali 1–10.

OPIS STANOWISKA:
{job_description[:2000]}

TREŚĆ CV:
{text}

KONTEKST Z INTERNETU (standardy branżowe dla tej roli):
{web_ctx or "Brak dostępnych wyników z internetu."}

════════════════════════════════════════
ETAPY OBLICZEŃ:

① DOPASOWANIE WYMAGANYCH UMIEJĘTNOŚCI (0–4 pkt)
   Wyodrębnij 10 najważniejszych wymaganych umiejętności/technologii z opisu stanowiska.
   Policz, ile z nich występuje w CV (dokładnie lub jako bliski synonim).
   Wynik = (liczba dopasowanych / 10) × 4.

② DOPASOWANIE POZIOMU DOŚWIADCZENIA (0–2 pkt)
   Czy liczba lat doświadczenia i poziom seniority w CV odpowiadają wymaganiom opisu stanowiska?
   2 = idealne dopasowanie, 1 = bliskie, 0 = istotna luka.

③ DOPASOWANIE OBSZARU / BRANŻY (0–2 pkt)
   Czy doświadczenie kandydata w danym obszarze (branża, typ firmy, skala) jest dopasowane?
   2 = silne dopasowanie, 1 = częściowe, 0 = inny obszar.

④ DOPASOWANIE JĘZYKA I SŁÓW KLUCZOWYCH (0–1 pkt)
   Czy CV używa terminologii z opisu stanowiska? (istotne dla ATS)

⑤ WYRÓŻNIKI (0–1 pkt)
   Czy CV pokazuje coś, co wyróżnia tego kandydata na tym konkretnym stanowisku?

SUMA = ①+②+③+④+⑤, zaokrąglona, w zakresie 1–10.
════════════════════════════════════════

Zwróć JSON. Wyniki cząstkowe umieść TYLKO w `categories` (nie w tipach).
Nie dodawaj wskazówki zaczynającej się od „Rozkład oceny”.
W `message` NIE podawaj oceny liczbowej (zakazane: „8/10”, „80%”). Interfejs pokazuje ją osobno.
{{
  "message": "<3–4 zdania: opisz dopasowanie jakościowo, wymień dopasowane umiejętności oraz luki. Bądź konkretny. Bez liczby oceny.>",
  "rating": <obliczona ocena 1-10>,
  "categories": [
    {{"id": "skills", "label": "Umiejętności", "score": <0-4>, "max": 4}},
    {{"id": "seniority", "label": "Seniority", "score": <0-2>, "max": 2}},
    {{"id": "domain", "label": "Obszar", "score": <0-2>, "max": 2}},
    {{"id": "keywords", "label": "Słowa kluczowe", "score": <0-1>, "max": 1}},
    {{"id": "differentiators", "label": "Wyróżniki", "score": <0-1>, "max": 1}}
  ],
  "strengths": ["<dopasowana umiejętność lub mocna strona względem oferty>"],
  "priorities": [
    {{"title": "<brakująca umiejętność lub luka>", "description": "<jak uzupełnić w CV>"}}
  ],
  "tips": [
    "<wymień 3–5 najważniejszych umiejętności z opisu stanowiska, których BRAKUJE w CV>",
    "<najważniejsza zmiana CV poprawiająca dopasowanie>",
    "<konkretne słowo kluczowe do dodania do CV>",
    "<sekcja do dopasowania lub dodania>"
  ],
  "corrections": [],
  "web_sources": {json.dumps(web_urls[:3])}
}}"""
    result = _gpt_result(system, user, action="position_rating")
    if not result["web_sources"] and web_urls:
        result["web_sources"] = web_urls[:3]
    return result


def _fix_grammar(elements: list[dict]) -> dict:
    """Propose content-only grammar/spelling corrections per text element."""
    structured = _extract_structured(elements)

    system = (
        "Jesteś profesjonalnym korektorem specjalizującym się w dokumentach biznesowych i CV. "
        "Poprawiaj WYŁĄCZNIE gramatykę, ortografię i interpunkcję. Nie zmieniaj znaczenia, tonu ani struktury. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Sprawdź korektę każdego poniższego elementu tekstowego. Popraw wszystkie błędy gramatyczne, ortograficzne i interpunkcyjne.

ELEMENTY:
{json.dumps(structured, ensure_ascii=False)}

ZASADY:
- W tablicy corrections uwzględniaj tylko elementy, które rzeczywiście zawierają błędy.
- Wartość "content" w każdej poprawce musi zawierać PEŁNY poprawiony tekst (nie fragment).
- Nie ulepszaj stylu ani nie parafrazuj — tylko poprawiaj błędy.
- Policz wszystkie znalezione błędy i podaj ich liczbę w message.

Zwróć JSON:
{{
  "message": "<podsumowanie: znaleziono X błędów w Y elementach. Wymień najczęstsze rodzaje błędów.>",
  "rating": null,
  "tips": [],
  "corrections": [
    {{"element_id": "<id>", "content": "<full corrected text of this element>"}}
  ],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="grammar", allowed_fields=_CONTENT_FIELDS)


def _check_style(text: str, elements: list[dict]) -> dict:
    """Polish language/style review with content patches where safe."""
    structured = _extract_structured(elements)

    system = (
        "Jesteś profesjonalnym autorem CV specjalizującym się w poprawianiu tonu, jasności "
        "i profesjonalizmu języka w CV. Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        "Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Przeanalizuj styl językowy tego CV i przeredaguj słabe elementy.

PEŁNY TEKST CV:
{text}

POJEDYNCZE ELEMENTY (do ukierunkowanych przeredagowań):
{json.dumps(structured[:30], ensure_ascii=False)}

════════════════════════════════════════
ETAPY ANALIZY:

① STRONA CZYNNA A BIERNA
   Znajdź każde użycie strony biernej („byłem odpowiedzialny”, „było zarządzane przez”).
   To przeredagowania o najwyższym priorytecie.

② FRAZESY I SŁABE SFORMUŁOWANIA
   Oznacz: „gracz zespołowy”, „pracowity”, „pasjonuję się”, „osoba z inicjatywą”,
   „nastawiony na wyniki”, „dbający o szczegóły”, „synergia”. Zastąp je dowodami.

③ OGÓLNIKOWE STWIERDZENIA
   Oznacz twierdzenia bez dowodów: „poprawiłem efektywność”, „prowadziłem projekty”.
   Tam, gdzie to właściwe, dodaj zastępczą metrykę: „poprawiłem efektywność o [X%]”.

④ PROFESJONALNY TON
   Czy ton jest zbyt nieformalny, zbyt formalny czy odpowiedni dla branży?

Przeredagowuj tylko elementy, które rzeczywiście tego wymagają. Krótkie elementy (imiona i nazwiska, daty, nagłówki)
nie powinny być przeredagowywane.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania: opisz najczęstsze znalezione problemy stylistyczne i ogólną ocenę tonu>",
  "rating": null,
  "tips": [
    "<znaleziony przykład strony biernej + przykład przeredagowania>",
    "<znaleziony frazes + konkretna zamiana>",
    "<ogólnikowe twierdzenie + sposób jego wzmocnienia>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny przeredagowany tekst po polsku>"}}
  ],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="language", allowed_fields=_CONTENT_FIELDS)


def _improve_content(elements: list[dict]) -> dict:
    """Suggest stronger CV wording without changing layout geometry."""
    structured = _extract_structured(elements)

    system = (
        "Jesteś wysokiej klasy autorem CV. Specjalizujesz się w przekształcaniu zwykłych opisów obowiązków "
        "w przekonujące, oparte na metrykach punkty, które przechodzą przez ATS i robią wrażenie na rekruterach. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Przeredaguj poniższą treść CV, aby maksymalizować jej siłę oddziaływania.

ELEMENTY:
{json.dumps(structured[:30], ensure_ascii=False)}

════════════════════════════════════════
ZASADY PRZEREDAGOWANIA (stosuj po kolei):

① MOCNE CZASOWNIKI NA POCZĄTKU — każdy punkt musi zaczynać się od czasownika działania w czasie przeszłym.
   Preferuj: Zaprojektowałem, Uruchomiłem, Zredukowałem, Zwiększyłem, Wynegocjowałem, Dostarczyłem, Zautomatyzowałem,
   Skalowałem, Przeprojektowałem, Usprawniłem. Unikaj: Pomagałem, Wspierałem, Byłem zaangażowany.

② KWANTYFIKUJ WSZYSTKO — dodaj metrykę do każdego punktu opisującego osiągnięcie.
   Jeśli oryginał nie zawiera liczby, dodaj sensowny symbol zastępczy: [X%], [N użytkowników], [K zł].
   Przykład: „Zarządzałem mediami społecznościowymi” → „Zwiększyłem liczbę obserwujących w mediach społecznościowych o [X%] w ciągu [N] miesięcy”

③ KONKRETNOŚĆ — zastępuj ogólne odniesienia do technologii/narzędzi ich rzeczywistymi nazwami, jeśli można je wywnioskować.
   „Używałem baz danych” → „Zoptymalizowałem zapytania PostgreSQL, zmniejszając opóźnienia o [X%]”

④ DŁUGOŚĆ — zachowaj 1–2 wiersze na punkt. Usuń wypełniacze. Każde słowo musi być uzasadnione.

⑤ POMIJAJ nagłówki, imiona i nazwiska, dane kontaktowe oraz daty — przeredagowuj tylko tekst doświadczenia, umiejętności i podsumowania.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania podsumowujące, co poprawiono i dlaczego>",
  "rating": null,
  "tips": [
    "<znaleziony ogólny wzorzec, np. „5 punktów nie miało czasowników działania — wszystkie przeredagowano”>",
    "<wskazówka dotycząca zastępczych metryk: „Przed wysłaniem zastąp symbole [X%] rzeczywistymi wartościami”>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny przeredagowany tekst elementu po polsku>"}}
  ],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="improve", allowed_fields=_CONTENT_FIELDS)


_TRANSLATE_LANGUAGE_NAMES = {
    "pl": "polski",
    "en": "angielski",
    "de": "niemiecki",
    "fr": "francuski",
    "es": "hiszpański",
    "uk": "ukraiński",
    "it": "włoski",
    "nl": "niderlandzki",
}


def _translate_cv(elements: list[dict], target_language: str) -> dict:
    """Translate editable CV text into ``target_language`` via content patches.

    Geometry and template chrome stay untouched. Proper names, emails, phones,
    and URLs must be preserved so the user can accept patches like grammar.
    """
    lang = (target_language or "").strip().lower()
    lang_name = _TRANSLATE_LANGUAGE_NAMES.get(lang)
    if not lang_name:
        return {
            "message": "Nieobsługiwany język tłumaczenia.",
            "rating": None,
            "tips": [],
            "corrections": [],
            "categories": [],
            "strengths": [],
            "priorities": [],
            "web_sources": [],
        }

    # Skip locked / fixed chrome so translation never rewrites template furniture.
    # `_extract_structured` omits chrome flags, so resolve protection from the
    # original canvas elements (id or element_id, depending on the client).
    protected_ids = {
        str(el.get("element_id") or el.get("id"))
        for el in elements
        if el.get("fixedToPage") or el.get("locked")
    }
    structured = [
        el for el in _extract_structured(elements)
        if str(el.get("element_id")) not in protected_ids
    ]

    system = (
        "Jesteś profesjonalnym tłumaczem CV i dokumentów rekrutacyjnych. "
        "Tłumaczysz treść elementów tekstowych na język docelowy, zachowując znaczenie, "
        "ton zawodowy i strukturę punktów. "
        "Zwracasz WYŁĄCZNIE prawidłowy JSON. "
        "Pola message i tips zwracaj po polsku; pole content w corrections musi być "
        "w języku docelowym."
    )
    user = f"""Przetłumacz treść CV na język: {lang_name} (kod: {lang}).

ELEMENTY DO TŁUMACZENIA:
{json.dumps(structured, ensure_ascii=False)}

ZASADY:
- W corrections uwzględniaj tylko elementy, których treść faktycznie trzeba zmienić.
- Wartość "content" musi zawierać PEŁNY przetłumaczony tekst elementu (nie fragment).
- Nie zmieniaj left/top/width/height ani stylów — tylko content.
- Zachowuj nazwy własne (imiona, nazwiska firm, produktów), adresy e-mail, telefony i URL.
- Nagłówki sekcji też tłumacz, jeśli są zwykłym tekstem użytkownika.
- Nie tłumacz elementów, które już są w pełni w języku docelowym (pomiń je).
- NIGDY nie proponuj corrections dla elementów z fixedToPage=true ani locked=true.

Zwróć JSON:
{{
  "message": "<2–3 zdania po polsku: ile elementów przetłumaczono i na jaki język>",
  "rating": null,
  "tips": [
    "<krótka wskazówka po polsku, np. sprawdź nazwy własne przed wysyłką>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny tekst w języku docelowym>"}}
  ],
  "web_sources": []
}}"""
    result = _gpt_result(system, user, action="translate", allowed_fields=_CONTENT_FIELDS)
    return _strip_protected_corrections(result, protected_ids)


def _ats_score(text: str) -> dict:
    """Estimate ATS friendliness from plain CV text."""
    system = (
        "Jesteś ekspertem od ATS (systemów śledzenia kandydatów). "
        "Wiesz, jak Workday, Greenhouse, Lever i Taleo analizują CV. "
        "Nie wpisuj liczby oceny w `message` (ani jako X/10, ani jako procent) — interfejs pokazuje ją osobno. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeanalizuj to CV pod kątem zgodności z ATS. Oceń je w skali 1–10.

TEKST CV:
{text}

════════════════════════════════════════
ETAPY OBLICZEŃ:

① STANDARDOWE NAGŁÓWKI SEKCJI (0–2 pkt)
   ATS oczekuje dokładnych lub zbliżonych standardowych nagłówków. Sprawdź:
   „Doświadczenie zawodowe” / „Doświadczenie”, „Wykształcenie”, „Umiejętności”, „Podsumowanie” / „Profil”,
   „Certyfikaty”, „Języki”.
   Wynik = (liczba znalezionych standardowych nagłówków / 6) × 2.

② GĘSTOŚĆ SŁÓW KLUCZOWYCH (0–3 pkt)
   Zidentyfikuj 5 najważniejszych standardowych dla branży słów kluczowych obecnych w CV
   (np. konkretne technologie, metodyki, kompetencje miękkie).
   Wynik = (liczba znalezionych słów kluczowych / 5) × 3.

③ KOMPLETNOŚĆ DANYCH KONTAKTOWYCH (0–1 pkt)
   E-mail, telefon, LinkedIn/GitHub, lokalizacja. 1 pkt, jeśli obecne są ≥3; 0,5 pkt, jeśli 2; 0 pkt, jeśli ≤1.

④ SPÓJNOŚĆ FORMATU DAT (0–1 pkt)
   Daty powinny konsekwentnie mieć format miesiąc rok lub MM/RRRR. 1 pkt, jeśli są spójne; 0 pkt, jeśli są mieszane.

⑤ BEZPIECZEŃSTWO FORMATOWANIA (0–2 pkt)
   ATS ma trudności z: tabelami, obrazami w przepływie tekstu, znakami specjalnymi i nietypowymi czcionkami.
   Na podstawie struktury elementów przyznaj do 2 pkt.

⑥ DŁUGOŚĆ (0–1 pkt)
   Optymalna długość to 1–2 strony. Oszacuj ją na podstawie liczby słów w tekście.

SUMA = ①+②+③+④+⑤+⑥, w zakresie 1–10.
════════════════════════════════════════

Zwróć JSON. Wyniki cząstkowe umieść TYLKO w `categories` (nie w tipach).
Nie dodawaj wskazówki zaczynającej się od „Rozkład oceny”.
W `message` NIE podawaj oceny liczbowej (zakazane: „8/10”, „80%”). Interfejs pokazuje ją osobno.
{{
  "message": "<2–3 zdania: główne ryzyko związane z ATS i najważniejsza luka w słowach kluczowych. Bez liczby oceny.>",
  "rating": <obliczona ocena 1-10>,
  "categories": [
    {{"id": "headers", "label": "Nagłówki", "score": <0-2>, "max": 2}},
    {{"id": "keywords", "label": "Słowa kluczowe", "score": <0-3>, "max": 3}},
    {{"id": "contact", "label": "Kontakt", "score": <0-1>, "max": 1}},
    {{"id": "dates", "label": "Daty", "score": <0-1>, "max": 1}},
    {{"id": "format", "label": "Format", "score": <0-2>, "max": 2}},
    {{"id": "length", "label": "Długość", "score": <0-1>, "max": 1}}
  ],
  "strengths": ["<mocna strona pod ATS>"],
  "priorities": [
    {{"title": "<główne ryzyko ATS>", "description": "<konkretna poprawka>"}}
  ],
  "tips": [
    "<znaleziony niestandardowy nagłówek + proponowana nazwa>",
    "<3 najważniejsze brakujące słowa kluczowe ATS dla widocznej branży/roli>",
    "<brak w danych kontaktowych, jeśli występuje>",
    "<problem z formatem dat, jeśli występuje>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="ats_score")


_MAX_CHAT_HISTORY = 12
_MAX_HISTORY_CHARS = 1500


def _normalize_chat_history(history: list | None) -> list[dict]:
    """Keep a short, safe transcript of the current UI session for the model."""
    if not isinstance(history, list):
        return []
    normalized: list[dict] = []
    for item in history[-_MAX_CHAT_HISTORY:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in ("user", "assistant"):
            continue
        content = str(item.get("content") or item.get("text") or "").strip()
        if not content:
            continue
        normalized.append({"role": role, "content": content[:_MAX_HISTORY_CHARS]})
    return normalized


def _chat(
    message: str,
    elements: list[dict],
    page_size: dict | None,
    history: list | None = None,
) -> dict:
    structured = _extract_positional(elements)
    session_history = _normalize_chat_history(history)

    system = (
        "Jesteś ekspertem i coachem CV w aplikacji CV STUDIO. Masz pełną treść, styl i pozycję (px, 1:1 z PDF) "
        "każdego elementu CV użytkownika jako kontekst oraz historię bieżącej sesji czatu. "
        "NAJPIERW oceń, czy BIEŻĄCA WIADOMOŚĆ UŻYTKOWNIKA mieści się w zakresie aplikacji "
        "(in_scope). Zakres DOZWOLONY obejmuje wyłącznie: treść i układ CV / resume, "
        "edycję elementów na płótnie, styl typografii i design dokumentu, "
        "przygotowanie do aplikacji o pracę, ATS, listy motywacyjne powiązane z CV, "
        "ocenę profilu kandydata względem oferty, karierę w kontekście dokumentów aplikacyjnych "
        "oraz pytania o funkcje edytora CV STUDIO. "
        "Poza zakresem (in_scope=false) są m.in.: ogólna wiedza, pogawędki, programowanie niezwiązane z CV, "
        "matematyka, polityka, rozrywka, przepisy, medycyna, finanse osobiste poza kontekstem CV, "
        "inne produkty, a także prośby o treść niezwiązaną z dokumentami aplikacyjnymi. "
        "Gdy in_scope=false: (a) w message krótko wyjaśnij, że nie możesz się wypowiadać na ten temat, "
        "bo wykracza poza zakres CV STUDIO (CV i szukanie pracy), (b) poproś o pytanie lub zadanie "
        "dotyczące CV / edycji dokumentu / aplikacji o pracę, (c) NIE odpowiadaj merytorycznie na "
        "pytanie spoza zakresu, (d) ustaw corrections na [], a position_operation, structure_operation, "
        "delete_operation i clone_operation na null, tips na []. "
        "Gdy użytkownik odnosi się do wcześniejszej wiadomości („to”, „tamto”, „jak wcześniej”, "
        "„co przed chwilą zmieniłeś”), użyj HISTORII SESJI. Aktualny stan płótna (ELEMENTY CV) "
        "ma pierwszeństwo, jeśli rozmowa i płótno się rozjeżdżają. Wiadomość użytkownika w zakresie może być:\n"
        "(1) PYTANIEM — odpowiedz konkretnie w message, zostaw corrections jako pustą listę "
        "i position_operation jako null.\n"
        "(2) POLECENIEM edycji treści lub stylu (np. \"zmień rozmiar czcionki nagłówków na 13px\", "
        "\"popraw sekcję wykształcenie\", \"zmień kolor czcionki w wykształceniu aby pasował do "
        "reszty sekcji\") — znajdź pasujące elementy i zwróć po jednej poprawce w corrections. "
        "Poprawka może zawierać WYŁĄCZNIE pola: content, fontSize, fontFamily, color, bold, italic, "
        "align. NIGDY nie zwracaj left/top/width/height/zIndex/page w corrections.\n"
        "  - Każdy element tekstowy w kontekście MA pole color (hex) oraz fontFamily — odczytaj je. "
        "Przy poleceniach typu „dopasuj kolor do innych sekcji / sidebara / nagłówków” NIE odmawiaj "
        "i NIE proś użytkownika o hex: porównaj kolory sąsiednich sekcji o tej samej roli "
        "(np. nagłówek sekcji sidebara vs nagłówek WYKSZTAŁCENIE, treść vs treść) i ustaw color "
        "na najczęściej używany lub najbliższy wizualnie hex z tych peerów. Jeśli sekcja ma kilka "
        "ról (nagłówek + treść), dopasuj każdą rolę osobno.\n"
        "(3) POLECENIEM dotyczącym POZYCJI elementów (np. \"przesuń nagłówki sekcji o 50px w lewo\", "
        "\"wyrównaj te elementy na x=50\", \"rozłóż wpisy w sekcji doświadczenia równomiernie\") — "
        "zwróć position_operation zamiast corrections:\n"
        "  - Elementy typu image, line, rectangle, circle i ellipse są prawidłowymi celami poleceń pozycji. "
        "Przesuwaj je tylko wtedy, gdy użytkownik wyraźnie o to prosi; nie traktuj dekoracji "
        "jako elementów do automatycznej korekty.\n"
        "  {\"type\": \"shift\"|\"align\"|\"distribute\"|\"space\"|\"move_to_page\"|\"move_to_sidebar\", \"target_element_ids\": [\"...\"] LUB "
        "\"target_groups\": [[\"...\"], [\"...\"]], "
        "\"dx\": <liczba>, \"dy\": <liczba>, \"gap\": <liczba nieujemna>, \"axis\": \"x\"|\"y\", "
        "\"anchor\": \"start\"|\"center\"|\"end\", \"target\": <liczba lub pomiń>, "
        "\"target_page\": <numer strony>, \"reference_element_id\": \"...\", "
        "\"align_element_ids\": [\"...\"]}\n"
        "  - target_element_ids: użyj, gdy polecenie dotyczy pojedynczych elementów (np. nagłówków).\n"
        "  - target_groups: użyj ZAMIAST target_element_ids, gdy polecenie dotyczy CAŁYCH BLOKÓW "
        "złożonych z kilku elementów (np. \"rozłóż wpisy o pracę równomiernie\", gdzie każdy wpis to "
        "osobny tytuł stanowiska + firma/daty + opis). Każda wewnętrzna lista to identyfikatory "
        "elementów tworzących jeden blok — znajdź bloki na podstawie bliskości pozycji i wzorca "
        "treści (powtarzający się układ: tytuł, potem firma/daty, potem opis, dla każdego wpisu). "
        "Blok porusza się jako całość — jego elementy zachowują wzajemny układ. Nie łącz "
        "target_groups z target_element_ids w tym samym poleceniu.\n"
        "  - shift: przesunięcie względne (dx, dy) w px wybranych elementów lub bloków. "
        "Python PRZYTNIE przesunięcie, jeśli spowodowałoby nachodzenie na treść, która NIE jest "
        "w target_element_ids / target_groups (np. „przesuń resztę w górę, zachowaj górny akapit” — "
        "nie dodawaj zachowanego akapitu do celów; podaj ujemne dy, a silnik zatrzyma ruch przed "
        "nim). Gdy użytkownik chce stały odstęp od zachowanego elementu, preferuj space z gap.\n"
        "  - align: ustawia wybrane elementy lub bloki na wspólnej wartości jednej osi (axis) przy "
        "zakotwiczeniu (anchor: start = lewa/górna krawędź, center = środek, end = prawa/dolna "
        "krawędź). Jeśli użytkownik podał konkretną wartość (np. \"na x=50\"), podaj ją jako target. "
        "Jeśli chodzi tylko o wzajemne wyrównanie bez podanej wartości, pomiń target. PRZED zwróceniem "
        "align sprawdź na podstawie podanych pozycji (left/top), czy wskazane elementy już mają "
        "zgodną wartość na tej osi (identyczną lub w granicach 1px) — jeśli tak, NIE zwracaj "
        "position_operation; zamiast tego w message napisz, że są już wyrównane, więc nie ma czego zmieniać.\n"
        "  - distribute: równomiernie rozkłada odstępy między co najmniej 3 wybranymi elementami lub "
        "blokami wzdłuż osi (axis). Dla axis=\"y\" (domyślnie przy ujednolicaniu odstępów pionowych): "
        "pierwszy element/blok zostaje na miejscu, a Python WYLICZA równe odstępy w dostępnym miejscu "
        "na stronie — od pierwszego do następnej treści w tej samej kolumnie albo do dolnego marginesu "
        "strony (ostatni może się przesunąć). Używaj tego dla poleceń typu „ujednolić odstępy”, "
        "„rozłóż równomiernie sekcje/wpisy”, „wyrównaj odstępy pionowe”. Dla całych sekcji lub wpisów "
        "o pracę ZAWSZE użyj target_groups (każdy blok = nagłówek+treść albo stanowisko+firma+opis), "
        "żeby nie rozrywać wnętrza bloku. Dla axis=\"x\" pierwszy i ostatni pozostają na miejscu.\n"
        "  - space: ustawia DOKŁADNY odstęp między krawędziami kolejnych elementów lub bloków "
        "na wartość gap w px; pierwszy element/blok zostaje na miejscu, a Python wylicza różne "
        "przesunięcia dla pozostałych. Użyj tego dla poleceń typu „ustaw odstępy 10 px”. "
        "Dla elementów WEWNĄTRZ jednego bloku (np. stanowisko + firma/daty + opis PwC) użyj "
        "target_element_ids z trzema identyfikatorami. Dla odstępu MIĘDZY całymi blokami użyj "
        "target_groups z co najmniej dwiema grupami.\n"
        "  - move_to_page: przenosi wskazany element albo cały logiczny blok na inną stronę. Podaj "
        "\"target_page\" jako numer strony. Gdy z elementem muszą przejść powiązane elementy "
        "(np. nagłówek sekcji, wpisy i ich dekoracje), umieść je razem w target_element_ids albo "
        "w jednej target_groups — Python zachowa ich wzajemne pozycje. Jeżeli użytkownik chce "
        "wyrównać część przenoszonych elementów do elementu referencyjnego, podaj dodatkowo "
        "\"reference_element_id\", \"align_element_ids\", \"axis\" i \"anchor\". Domyślnie użyj "
        "axis=\"x\" i anchor=\"start\", aby wyrównać lewe krawędzie. Element referencyjny może "
        "być przenoszonym elementem albo elementem już obecnym na stronie docelowej. Jeśli "
        "pojedynczy element jest częścią wpisu (np. okres edukacji), a jego tytuł lub uczelnia "
        "jest już na stronie docelowej, ZAWSZE użyj tego powiązanego elementu jako "
        "reference_element_id i dodaj przenoszony element do align_element_ids. Nie przenoś "
        "elementów z fixedToPage=true ani locked=true; są to tła, stałe dekoracje stron "
        "lub pozycje zablokowane przez użytkownika.\n"
        "  - move_to_sidebar: przenosi nagłówek sekcji i jej pola tekstowe do istniejącego sidebara "
        "na wskazanej stronie. Użyj go dla poleceń typu „przenieś JĘZYKI pod OBSZARY w sidebarze”. "
        "Podaj target_element_ids z nagłówkiem i wszystkimi polami treści tej sekcji, target_page "
        "(zwykle 1), reference_element_id wskazujący NAJNIŻEJ położony element istniejącej sekcji "
        "sidebara (dla „pod OBSZARY” będzie to lista obszarów, nie sam nagłówek) oraz gap w px. "
        "Python ustali szerokość sidebara na podstawie elementu referencyjnego, zawinie tekstarea "
        "do tej szerokości i ułoży wskazane pola pionowo jako jedną bezpieczną zmianę. Jeśli pod "
        "elementem referencyjnym jest już inna treść sidebara, Python sam odsunie ją niżej (także na "
        "kolejną stronę), aby zrobić miejsce — ciasny sidebar ani kolizja z istniejącą treścią NIE są "
        "powodem odmowy. Możesz jednym poleceniem przenieść kilka sekcji naraz (np. UMIEJĘTNOŚCI, "
        "JĘZYKI i WYKSZTAŁCENIE) — podaj wszystkie ich nagłówki i pola treści w target_element_ids. "
        "Nie używaj move_to_sidebar dla obrazów, figur ani dekoracji — obejmuj nim tylko text i textarea.\n"
        "(4) POLECENIE przebudowy sekcji (np. „sformatuj wykształcenie jako osobne pola”) zwraca "
        "structure_operation zamiast corrections i position_operation. Format:\n"
        "  {\"type\":\"restructure_section\", \"source_element_id\":\"...\", \"blocks\":["
        "{\"role\":\"heading\"|\"entry_title\"|\"entry_meta\"|\"body\"|\"list\", \"content\":\"...\"}]}\n"
        "  - source_element_id wskazuje JEDEN istniejący, odblokowany element text albo textarea "
        "z całą treścią sekcji. blocks ma 2–12 pól i zachowuje DOKŁADNIE całą treść źródłową "
        "w tej samej kolejności: nie skracaj, nie tłumacz i nie dodawaj słów.\n"
        "  - Użyj heading dla nazwy sekcji, entry_title dla tytułu wpisu, entry_meta dla dat lub "
        "instytucji, body dla opisu i list dla punktów. NIE podawaj nowych ID, kategorii canvas, "
        "współrzędnych, stylów, stron ani rozmiarów — Python bezpiecznie wyliczy elementy i reflow. "
        "Jeśli po przebudowie zabraknie miejsca, Python sam odsunie treść poniżej sekcji o wymaganą "
        "odległość (także na kolejne strony) — ciasny układ ani kolizja z treścią poniżej NIE są "
        "powodem odmowy przebudowy.\n"
        "(5) POLECENIE usunięcia elementów (np. „usuń wszystkie elementy ze strony 2 oprócz tła”) "
        "zwraca delete_operation zamiast corrections, position_operation i structure_operation:\n"
        "  {\"type\":\"delete_elements\", \"target_element_ids\":[\"...\" ]}\n"
        "  - Podaj wyłącznie istniejące ID elementów, które użytkownik wyraźnie chce usunąć. Przy "
        "poleceniu „wszystkie na stronie X oprócz Y” wylicz wszystkie zwykłe elementy z tej strony "
        "oprócz wskazanych wyjątków.\n"
        "  - NIGDY nie podawaj elementów z fixedToPage=true ani locked=true: są to chronione tła, "
        "stopki i pozycje użytkownika. Nie podawaj współrzędnych, stron, stylów ani nowych specyfikacji. "
        "Usunięcie zawsze wymaga osobnego zatwierdzenia użytkownika w UI.\n"
        "(5b) POLECENIE klonowania elementów (np. „sklonuj tę linię i umieść pod nagłówkiem UMIEJĘTNOŚCI”, "
        "„zrób kopię bloku obok”, „powiel dekorację pod nową sekcją”) zwraca clone_operation:\n"
        "  {\"type\":\"clone_elements\", \"clones\":[{"
        "\"source_element_id\":\"...\","
        "\"reference_element_id\":\"...\" (wymagane gdy placement≠offset),"
        "\"placement\":\"below\"|\"above\"|\"left\"|\"right\"|\"offset\","
        "\"gap\":<px, domyślnie 8>, \"dx\":<px>, \"dy\":<px>,"
        "\"align\":\"start\"|\"center\"|\"end\", \"match_size\":\"none\"|\"width\"|\"height\"|\"both\""
        "}]}\n"
        "  - source_element_id to ISTNIEJĄCY element (text, textarea, line, rectangle, circle, ellipse, image). "
        "Python skopiuje jego styl i rozmiar — NIE podawaj left/top/color/width ręcznie.\n"
        "  - placement below/above/left/right ustawia kopię względem reference_element_id z odstępem gap. "
        "placement=offset robi klasyczny duplikat względem źródła o (dx, dy); wtedy reference pomiń.\n"
        "  - align wyrównuje kopię do referencji na osi poprzecznej (np. below+start = ta sama lewa krawędź). "
        "match_size=width przydaje się przy liniach pod nagłówkiem (szerokość linii = szerokość nagłówka).\n"
        "  - Możesz podać wiele pozycji w clones (max 20). Nie klonuj fixedToPage ani locked.\n"
        "NIGDY sam nie podawaj wartości left/top — Python obliczy rzeczywiste współrzędne na "
        "podstawie bieżącej, aktualnej pozycji elementów i sam odrzuci operację, jeśli wyszłaby "
        "poza stronę.\n"
        "(6) Jeśli polecenie wymaga zmiany rozmiaru elementów w sposób inny niż przeniesienie tekstowej "
        "sekcji do sidebara, lub usunięcia wielu stron (np. \"zmieść CV na "
        "jednej stronie\"), albo jest zbyt niejednoznaczne, by bezpiecznie określić elementy "
        "docelowe i operację — NIE zgaduj. W message wyjaśnij ograniczenie lub zadaj pytanie "
        "doprecyzowujące, zostaw corrections puste i position_operation jako null.\n"
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    history_block = (
        json.dumps(session_history, ensure_ascii=False)
        if session_history
        else "[]"
    )
    user = f"""ELEMENTY CV (id, typ, treść, styl, pozycja i rozmiar w px):
{json.dumps(structured, ensure_ascii=False)}

HISTORIA SESJI CZATU (od najstarszej; bez bieżącej wiadomości):
{history_block}

BIEŻĄCA WIADOMOŚĆ UŻYTKOWNIKA:
{message}

Zwróć JSON:
{{
  "in_scope": true,
  "message": "<Twoja odpowiedź — konkretna, oparta na elementach i historii sesji; przy in_scope=false: odmowa zakresu + prośba o pytanie o CV>",
  "rating": null,
  "tips": ["<wskazówka lub osiągalna alternatywa, jeśli istotna>"],
  "corrections": [],
  "position_operation": null,
  "structure_operation": null,
  "delete_operation": null,
  "clone_operation": null,
  "web_sources": []
}}"""
    raw, usage = _gpt(system, user, action="chat")
    # Out-of-scope replies still bill tokens (usage below), but must never mutate the canvas.
    in_scope = raw.get("in_scope")
    if in_scope is False or (isinstance(in_scope, str) and in_scope.strip().lower() in {"false", "0", "no"}):
        refuse = str(raw.get("message") or "").strip() or (
            "Nie mogę wypowiadać się na ten temat — wykracza poza zakres CV STUDIO "
            "(CV, edycja dokumentu i aplikowanie o pracę). Zadaj proszę pytanie lub zadanie "
            "związane z Twoim CV."
        )
        return {
            "message": refuse,
            "rating": None,
            "tips": [],
            "corrections": [],
            "web_sources": [],
            "layout_groups": [],
            "layout_issues": [],
            "structure_groups": [],
            "structure_issues": [],
            "deletion_groups": [],
            "deletion_issues": [],
            "clone_groups": [],
            "clone_issues": [],
            "usage": usage,
        }

    result = _safe_result(raw)
    result["usage"] = usage

    directive = raw.get("position_operation")
    if isinstance(directive, dict):
        resolved = resolve_directed_operation(elements, directive, page_size)
        result["layout_groups"] = resolved["layout_groups"]
        result["layout_issues"] = resolved["layout_issues"]
    else:
        result["layout_groups"] = []
        result["layout_issues"] = []

    structure_directive = raw.get("structure_operation")
    if isinstance(structure_directive, dict):
        structure_group = resolve_restructure_section(elements, structure_directive, page_size)
        if structure_group is None:
            result["structure_groups"] = []
            result["structure_issues"] = [{
                "severity": "warning",
                "message": (
                    "Nie można bezpiecznie przebudować tej sekcji — treść nie pokrywa się "
                    "ze źródłem, koliduje z zablokowanym elementem albo nie mieści się na stronie."
                ),
            }]
        else:
            result["structure_groups"] = [structure_group]
            result["structure_issues"] = []
    else:
        result["structure_groups"] = []
        result["structure_issues"] = []

    delete_directive = raw.get("delete_operation")
    if isinstance(delete_directive, dict):
        delete_group = resolve_delete_operation(elements, delete_directive)
        if delete_group is None:
            result["deletion_groups"] = []
            result["deletion_issues"] = [{
                "severity": "warning",
                "message": (
                    "Nie można bezpiecznie przygotować usunięcia — wskazano nieznany, "
                    "zablokowany lub chroniony element."
                ),
            }]
        else:
            result["deletion_groups"] = [delete_group]
            result["deletion_issues"] = []
    else:
        result["deletion_groups"] = []
        result["deletion_issues"] = []

    clone_directive = raw.get("clone_operation")
    if isinstance(clone_directive, dict):
        clone_group = resolve_clone_operation(elements, clone_directive, page_size)
        if clone_group is None:
            result["clone_groups"] = []
            result["clone_issues"] = [{
                "severity": "warning",
                "message": (
                    "Nie można bezpiecznie sklonować wskazanych elementów — brak źródła, "
                    "blokada, chronione tło albo pozycja wychodzi poza stronę."
                ),
            }]
        else:
            result["clone_groups"] = [clone_group]
            result["clone_issues"] = []
    else:
        result["clone_groups"] = []
        result["clone_issues"] = []

    return result


def _layout_session(
    message: str,
    elements: list[dict],
    page_size: dict | None,
    history: list | None = None,
    template_id: str | None = None,
) -> dict:
    """GPT layout corrector: full A4 JSON in, changes → canvas review cards out."""
    snapshot = build_layout_snapshot(elements, page_size, template_id=template_id)
    if snapshot.get("movable_count", 0) < 1:
        return {
            "message": "Brak mierzalnych elementów na płótnie do analizy układu.",
            "rating": None,
            "tips": [],
            "corrections": [],
            "layout_groups": [],
            "layout_issues": [],
            "web_sources": [],
            "usage": empty_usage(
                model=_LAYOUT_MODEL,
                action="layout",
                service_tier=_service_tier_for_action("layout"),
            ),
        }

    question = (message or "").strip() or DEFAULT_LAYOUT_QUESTION
    session_history = _normalize_chat_history(history)
    history_block = ""
    if session_history:
        history_block = "HISTORIA SESJI UKŁADU:\n" + json.dumps(
            session_history, ensure_ascii=False
        ) + "\n\n"

    user = build_layout_user_prompt(snapshot, question, history_block)
    raw, usage = _gpt(LAYOUT_CORRECTOR_SYSTEM, user, action="layout")
    usage_payload = usage if isinstance(usage, dict) else {}
    groups, issues, summary, error = compile_layout_gpt_response(elements, raw, page_size)

    if error == "empty_response":
        return {
            "message": "Model nie zwrócił użytecznej analizy układu. Spróbuj ponownie lub doprecyzuj pytanie.",
            "rating": None,
            "tips": [
                "Tryb Układ: korektor geometrii dostaje pełny JSON A4 przy każdym pytaniu.",
            ],
            "corrections": [],
            "layout_groups": [],
            "layout_issues": [{"severity": "warning", "message": error}],
            "web_sources": [],
            "usage": usage_payload,
        }

    if error in {"incomplete_text_inventory", "unknown_element_ref"}:
        retry_reason = (
            "każdy element text i textarea"
            if error == "incomplete_text_inventory"
            else "wyłącznie referencje e1…eN przekazane w bieżącym snapshotcie"
        )
        return {
            "message": summary,
            "rating": None,
            "tips": [
                "Dla bezpieczeństwa odrzucono całą odpowiedź zamiast udostępniać częściowy ruch sekcji.",
                f"Uruchom Układ ponownie — model musi rozliczyć {retry_reason}.",
            ],
            "corrections": [],
            "layout_groups": [],
            "layout_issues": issues,
            "web_sources": [],
            "usage": usage_payload,
        }

    message_out = summary or (
        "Przygotowałem propozycje korekt układu. Każdą zmianę możesz obejrzeć "
        "przed zastosowaniem."
        if groups
        else "Układ CV wygląda spójnie — nie proponuję zmian."
    )
    inventory = raw.get("section_inventory")
    inventory_sections = len(inventory) if isinstance(inventory, list) else 0
    tips = [
        "Możesz dopytać o dowolną sekcję lub obejrzeć podgląd przed zastosowaniem zmiany.",
    ]
    if inventory_sections:
        tips.append(
            "Sprawdzono układ treści we wszystkich rozpoznanych sekcjach CV."
        )
    tips.extend([
        "Karty poniżej pozwalają sprawdzić każdą zmianę przed jej zastosowaniem.",
        "Treść, dane osobowe i zablokowane elementy pozostają bez zmian.",
    ])
    return {
        "message": message_out,
        "rating": None,
        "tips": tips,
        "corrections": [],
        "layout_groups": groups,
        "layout_issues": issues,
        "web_sources": [],
        "usage": usage_payload,
    }


# ── public dispatcher ──────────────────────────────────────────────────────

def analyze_action(
    action: str,
    elements: list[dict],
    message: str = "",
    job_description: str = "",
    page_size: dict | None = None,
    history: list | None = None,
    template_id: str | None = None,
    target_language: str = "",
) -> dict:
    """Dispatch one assistant button/chat action and return a UI-ready dict.

    Unknown actions return an empty Polish error payload without calling GPT.
    `AIServiceError` is re-raised with action/element context filled in for logs.
    """
    text = _extract_text(elements)

    dispatchers = {
        "rating":          lambda: _rate_cv(text, elements),
        "design_rating":   lambda: _rate_design(elements, page_size),
        "position_rating": lambda: _rate_position(text, job_description),
        "grammar":         lambda: _fix_grammar(elements),
        "language":        lambda: _check_style(text, elements),
        "improve":         lambda: _improve_content(elements),
        "ats_score":       lambda: _ats_score(text),
        "translate":       lambda: _translate_cv(elements, target_language),
        "chat":            lambda: _chat(message, elements, page_size, history),
        "layout":          lambda: _layout_session(
            message, elements, page_size, history, template_id=template_id
        ),
    }

    fn = dispatchers.get(action)
    if fn is None:
        return {
            "message": f"Nieznana akcja: {action}",
            "rating": None,
            "tips": [],
            "corrections": [],
            "web_sources": [],
        }
    try:
        return fn()
    except AIServiceError as exc:
        exc.action = exc.action or action
        exc.elements_count = exc.elements_count or len(elements)
        raise
