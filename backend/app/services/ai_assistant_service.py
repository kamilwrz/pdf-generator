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
from openai import APIConnectionError, APIError, APIStatusError, APITimeoutError, OpenAI
from app.core.config import AI_PROVIDER_TIMEOUT_SECONDS, OPENAI_API_KEY
from app.services.layout_analysis import (
    extract_bounds,
    resolve_clone_operation,
    resolve_delete_operation,
    resolve_directed_operation,
    resolve_restructure_section,
)
from app.services.layout_gpt import (
    DEFAULT_LAYOUT_QUESTION,
    LAYOUT_CORRECTOR_SYSTEM,
    MAX_LAYOUT_MOVE_PX,
    build_layout_snapshot,
    build_layout_user_prompt,
    compile_layout_gpt_response,
)
from app.services.openai_pricing import (
    empty_usage,
    estimate_cost_pln,
    estimate_cost_usd,
    usage_from_response,
)
from app.services.cv_data import normalize_cv_data
from app.services.ats_readability import (
    AtsReadabilityError,
    analyze_pdf_readability,
    expected_plain_text,
    merge_ats_categories,
    percent_to_rating,
    weighted_overall_percent,
)
from app.services.document_service import make_image_resolver
from app.utils.image_src_to_path import image_src_to_local_path

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
_client = OpenAI(
    api_key=OPENAI_API_KEY,
    max_retries=0,
    timeout=AI_PROVIDER_TIMEOUT_SECONDS,
)

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


def assistant_reservation_cost_pln(action: str, request_bytes: int) -> float:
    """Return a conservative PLN ceiling for a bounded assistant request.

    UTF-8 byte length is used as an intentionally pessimistic prompt-token
    bound and includes extra system-prompt headroom. Completion uses the exact
    provider cap selected by the action. This ceiling is reserved before the
    provider starts; normal metering later settles only the reported usage.
    """
    prompt_token_ceiling = max(1, int(request_bytes)) + 8_192
    cost_usd = estimate_cost_usd(
        _model_for_action(action),
        prompt_token_ceiling,
        _max_completion_tokens_for_action(action),
        service_tier=_service_tier_for_action(action),
    )
    return estimate_cost_pln(cost_usd)


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
        reservation_outcome: str = "release",
        usage: dict | None = None,
    ):
        super().__init__(message)
        self.action = action
        self.elements_count = elements_count
        self.original = original
        # ``release`` is used for confirmed non-2xx/local failures,
        # ``settle_usage`` for a provider response whose payload was unusable,
        # and ``uncertain`` only when the response may have been lost in flight.
        self.reservation_outcome = reservation_outcome
        self.usage = usage
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

# Employment period lines such as "08/2023 – Obecnie" or "01/2023 – 05/2023".
# Used to tag nearby body copy with present vs past verb tense before GPT edits.
_DATE_TOKEN_RE = (
    r"(?:\d{1,2}[./]\d{4}|\d{4}|"
    r"(?:Styczeń|Luty|Marzec|Kwiecień|Maj|Czerwiec|Lipiec|Sierpień|Wrzesień|"
    r"Październik|Listopad|Grudzień|January|February|March|April|May|June|"
    r"July|August|September|October|November|December)\s+\d{4})"
)
_CURRENT_END_TOKEN_RE = (
    r"(?:Obecnie|Present|Currently|\bNow\b|dziś|dzisiaj|do\s+dziś|do\s+teraz)"
)
_EMPLOYMENT_PERIOD_RE = re.compile(
    rf"(?:{_DATE_TOKEN_RE})\s*(?:[–—\-]|do|to)\s*(?:{_CURRENT_END_TOKEN_RE}|{_DATE_TOKEN_RE})",
    re.IGNORECASE,
)

_CURRENT_ROLE_END_RE = re.compile(
    r"(?:Obecnie|Present|Currently|\bNow\b|dziś|dzisiaj|do\s+dziś|do\s+teraz)",
    re.IGNORECASE,
)

_SECTION_HEADER_RE = re.compile(
    r"^(DO[SŚ]WIADCZENIE|EXPERIENCE|WYKSZTA[LŁ]CENIE|EDUCATION|EDUKACJA|"
    r"UMIEJ[EĘ]TNO[SŚ]CI|SKILLS|KOMPETENCJE|PODSUMOWANIE|SUMMARY|PROFIL|"
    r"PROFILE|KONTAKT|CONTACT)\b",
    re.IGNORECASE,
)

# Polish vs English signals for mixed-language CV detection. Templates often
# ship Polish section chrome while imported / edited body copy stays English;
# that mismatch looks unprofessional and must surface in rating feedback.
_PL_DIACRITIC_RE = re.compile(r"[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]")
_PL_LEXICAL_RE = re.compile(
    r"\b(?:oraz|przez|jestem|byłem|byłam|pracowałem|pracowałam|prowadziłem|"
    r"prowadziłam|ukończyłem|ukończyłam|zrealizowałem|obecnie|doświadczenie|"
    r"wykształcenie|podsumowanie|umiejętności|stażysta|analiza|projekt|"
    r"studia|magister|licencjat|uniwersytet)\b",
    re.IGNORECASE,
)
_EN_LEXICAL_RE = re.compile(
    r"\b(?:the|and|with|for|from|into|about|graduated|building|analysis|"
    r"intern|currently|bachelor|degree|university|experience|education|"
    r"summary|skills|models|tools|research|developed|responsible|"
    r"improved|working|project|master)\b",
    re.IGNORECASE,
)
_PL_HEADER_HINTS = (
    "podsumowanie", "doświadczenie", "wykształcenie", "umiejętności",
    "języki", "jezyki", "certyfikaty", "zainteresowania", "profil",
    "edukacja", "kontakt", "kompetencje", "osiągnięcia", "osiagniecia",
)
_EN_HEADER_HINTS = (
    "summary", "experience", "education", "skills", "languages",
    "certifications", "interests", "profile", "contact", "achievements",
    "currently", "professional summary", "work experience",
)
_LANGUAGE_MIX_FEEDBACK_RE = re.compile(
    r"sp[oó]jno[sś]ć\s+j[eę]zykow|"
    r"niesp[oó]jno[sś]ć\s+j[eę]zykow|"
    r"mieszank[aei]\s+j[eę]zyk|"
    r"nag[lł][oó]wk\w*\s+.+\s+(polsk|angielsk)|"
    r"(polsk\w*\s+nag[lł][oó]wk|angielsk\w*\s+tre[sś])|"
    r"ujednoli[cć]\s+j[eę]zyk|"
    r"jeden\s+j[eę]zyk",
    re.IGNORECASE,
)


def _reading_order_key(element: dict) -> tuple:
    """Sort key for canvas reading order (page → top → left)."""
    try:
        page = int(element.get("page") or 1)
    except (TypeError, ValueError):
        page = 1
    try:
        top = float(element.get("top") or 0)
    except (TypeError, ValueError):
        top = 0.0
    try:
        left = float(element.get("left") or 0)
    except (TypeError, ValueError):
        left = 0.0
    return page, top, left


def _is_section_header_line(content: str) -> bool:
    """True for CV section labels that end an experience-tense block."""
    text = " ".join(str(content or "").replace("\\n", " ").split()).strip()
    if not text or len(text) > 48:
        return False
    if _SECTION_HEADER_RE.match(text):
        return True
    # Tracked template labels are often short ALL CAPS without digits.
    if re.search(r"\d", text):
        return False
    letters = [c for c in text if c.isalpha()]
    return len(letters) >= 4 and all(c.isupper() for c in letters)


def _language_signal_scores(text: str) -> tuple[int, int]:
    """Return (polish_score, english_score) lexical/diacritic signals for ``text``."""
    sample = str(text or "")
    if not sample.strip():
        return 0, 0
    pl = len(_PL_DIACRITIC_RE.findall(sample)) * 2 + len(_PL_LEXICAL_RE.findall(sample))
    en = len(_EN_LEXICAL_RE.findall(sample))
    return pl, en


def _header_language_vote(text: str) -> str | None:
    """Classify a short heading as ``pl``, ``en``, or ``None`` when unclear."""
    flat = " ".join(str(text or "").replace("\\n", " ").split()).strip().lower()
    if not flat:
        return None
    if any(hint in flat for hint in _PL_HEADER_HINTS):
        return "pl"
    if any(hint in flat for hint in _EN_HEADER_HINTS):
        return "en"
    pl, en = _language_signal_scores(flat)
    if pl > en and pl > 0:
        return "pl"
    if en > pl and en > 0:
        return "en"
    return None


# Supported CV languages for auto-detection and content corrections. Mirrors the
# translate action's language set so detection, correction, and translation all
# speak the same vocabulary. Order is irrelevant; membership is what matters.
_SUPPORTED_LANGS: tuple[str, ...] = ("pl", "en", "de", "fr", "es", "uk", "it", "nl")

# Cyrillic script is unique among the supported languages to Ukrainian, so its
# mere presence in the body is a strong, cheap signal.
_CYRILLIC_RE = re.compile(r"[Ѐ-ӿ]")

# High-frequency function/domain words per language. These are deliberately
# distinctive: each list avoids short tokens (w, i, a) that collide across
# languages, so a word-boundary count of body copy reliably picks the dominant
# language without a heavyweight NLP dependency. Extend only with words that do
# not appear in another supported language.
_LANG_STOPWORDS: dict[str, tuple[str, ...]] = {
    "pl": ("oraz", "przez", "doświadczenie", "wykształcenie", "umiejętności",
           "obecnie", "firma", "projekt", "prowadziłem", "odpowiadałem", "realizację"),
    "en": ("the", "and", "with", "experience", "education", "skills",
           "currently", "team", "project", "developed", "managed", "delivered"),
    "de": ("und", "der", "die", "das", "mit", "für", "erfahrung", "ausbildung",
           "kenntnisse", "derzeit", "unternehmen", "entwicklung", "berufserfahrung"),
    "fr": ("et", "les", "des", "avec", "pour", "expérience", "compétences",
           "actuellement", "entreprise", "projet", "développement", "gestion"),
    "es": ("los", "las", "con", "para", "experiencia", "habilidades",
           "actualmente", "empresa", "proyecto", "desarrollo", "gestión"),
    "it": ("con", "per", "esperienza", "competenze", "attualmente", "azienda",
           "progetto", "sviluppo", "gestione", "responsabile", "realizzazione"),
    "nl": ("het", "een", "met", "voor", "ervaring", "opleiding", "vaardigheden",
           "momenteel", "bedrijf", "ontwikkeling", "verantwoordelijk"),
    "uk": ("та", "для", "досвід", "освіта", "навички", "наразі", "компанія",
           "проєкт", "розробка", "відповідальність", "реалізацію"),
}

# Minimum weighted score before we trust a detection over the Polish fallback.
_DETECT_MIN_SCORE = 3


def _split_headers_and_body(elements: list[dict]) -> tuple[list[str], list[str]]:
    """Split canvas text into section-header chrome and body copy.

    Shared by language detection and the language-mix rating check so the two
    never diverge on what counts as a header vs. scoreable body text. Applies
    the same exclusions both need: employment-period lines, contact lines
    (emails/URLs), and very short tokens (names, cities) that do not encode
    document language.
    """
    headers: list[str] = []
    body_chunks: list[str] = []
    for el in elements or []:
        if el.get("category") not in ("text", "textarea"):
            continue
        content = str(el.get("content") or "").replace("\\n", "\n").strip()
        if not content:
            continue
        flat = " ".join(content.split())
        if _is_language_chrome_label(flat):
            headers.append(flat)
            continue
        if _is_employment_period_line(flat):
            continue
        if "@" in flat or flat.startswith("http"):
            continue
        if len(flat) < 18:
            continue
        body_chunks.append(flat)
    return headers, body_chunks


def _score_language_signals(text: str) -> dict[str, int]:
    """Return a per-language weighted score for ``text``.

    Word-boundary stopword hits are the base signal; Cyrillic and Polish
    diacritics add script-level weight because they are unique among the
    supported languages. The scores are comparable across languages, so the
    caller can pick the maximum.
    """
    scores = {code: 0 for code in _SUPPORTED_LANGS}
    if not text or not text.strip():
        return scores
    lower = text.lower()
    for code, words in _LANG_STOPWORDS.items():
        for word in words:
            # Word-boundary match so "and" does not fire inside "band".
            scores[code] += len(re.findall(rf"\b{re.escape(word)}\b", lower))
    # Script-level tie-breakers unique to one supported language.
    scores["uk"] += len(_CYRILLIC_RE.findall(text)) * 3
    scores["pl"] += len(_PL_DIACRITIC_RE.findall(text)) * 2
    return scores


def _dominant_language(text: str) -> tuple[str | None, float]:
    """Pick the highest-scoring language and a 0..1 confidence margin.

    Confidence is the winner's share of the top-two total, so a clear winner
    approaches 1.0 and a tie approaches 0.5. Returns ``(None, 0.0)`` when no
    signal crosses ``_DETECT_MIN_SCORE``.
    """
    scores = _score_language_signals(text)
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    top_code, top_score = ranked[0]
    if top_score < _DETECT_MIN_SCORE:
        return None, 0.0
    runner_up = ranked[1][1] if len(ranked) > 1 else 0
    confidence = top_score / (top_score + runner_up) if (top_score + runner_up) else 1.0
    return top_code, confidence


def _detect_cv_language(elements: list[dict]) -> dict:
    """Detect the CV's dominant language from its body copy.

    Business rule: when headers and body disagree (bilingual templates), the
    BODY language wins, because that is the text the content actions rewrite —
    we must never translate the user's own prose against their intent. Section
    headers only inform the ``is_mixed`` flag surfaced to the rating action.

    Falls back to Polish (the product's home market) when the visible text is
    too short to score, so a name-only canvas still behaves predictably.

    @returns ``{"code", "confidence", "body_lang", "header_lang", "is_mixed"}``.
    """
    headers, body_chunks = _split_headers_and_body(elements)

    body_lang, confidence = _dominant_language(" ".join(body_chunks))
    header_lang, _ = _dominant_language(" ".join(headers))

    # `code` is the usable correction language (never None); `body_lang` is the
    # raw detection so the dict stays internally consistent — when body copy is
    # too short to score, body_lang is None and is_mixed is False even if a
    # header language was detected.
    code = body_lang or "pl"
    is_mixed = bool(header_lang and body_lang and header_lang != body_lang)
    return {
        "code": code,
        "confidence": confidence,
        "body_lang": body_lang,      # raw (may be None)
        "header_lang": header_lang,  # raw (may be None)
        "is_mixed": is_mixed,
    }


def _is_language_chrome_label(content: str) -> bool:
    """True for section headings / meta labels used in bilingual-chrome checks.

    Unlike `_header_language_vote`, this must not treat ordinary short English
    bullets (e.g. „Building AI models”) as headings just because they contain
    English lexicon — only known section/meta chrome counts.
    """
    flat = " ".join(str(content or "").replace("\\n", " ").split()).strip()
    if not flat or len(flat) > 48:
        return False
    if _is_section_header_line(flat):
        return True
    lower = flat.lower()
    return any(hint in lower for hint in (*_PL_HEADER_HINTS, *_EN_HEADER_HINTS))


def _detect_language_mix(elements: list[dict]) -> dict | None:
    """Detect Polish/English mismatch between section headers and body copy.

    Polish product templates commonly keep PL chrome (PODSUMOWANIE ZAWODOWE, …)
    while imported English body text stays unchanged. GPT rating rubrics used to
    score only grammar/clichés, so the UI could show Język=0% for typos while
    never naming the more damaging bilingual layout. This heuristic feeds an
    explicit fact into rating/style prompts and guarantees a top priority.

    @returns A descriptor with prompt/feedback copy, or ``None`` when consistent.
    """
    # Shared with `_detect_cv_language` so both stay aligned on what counts as
    # header chrome vs. scoreable body text (short meta labels such as CURRENTLY
    # remain with the headers because they contribute to the bilingual look).
    headers, body_chunks = _split_headers_and_body(elements)

    if not headers or not body_chunks:
        return None

    header_pl = sum(1 for h in headers if _header_language_vote(h) == "pl")
    header_en = sum(1 for h in headers if _header_language_vote(h) == "en")
    body_text = " ".join(body_chunks)
    body_pl, body_en = _language_signal_scores(body_text)

    headers_lang = None
    if header_pl >= 2 and header_pl > header_en:
        headers_lang = "pl"
    elif header_en >= 2 and header_en > header_pl:
        headers_lang = "en"
    elif header_pl >= 1 and header_en == 0:
        headers_lang = "pl"
    elif header_en >= 1 and header_pl == 0:
        headers_lang = "en"

    body_lang = None
    # Require a clear majority so short bilingual skill lists do not false-positive.
    if body_en >= 3 and body_en >= body_pl * 2:
        body_lang = "en"
    elif body_pl >= 3 and body_pl >= body_en * 2:
        body_lang = "pl"

    if not headers_lang or not body_lang or headers_lang == body_lang:
        return None

    header_examples = []
    for h in headers:
        vote = _header_language_vote(h)
        if vote == headers_lang and h not in header_examples:
            header_examples.append(h)
        if len(header_examples) >= 3:
            break
    examples = ", ".join(f"„{ex}”" for ex in header_examples) or "nagłówki sekcji"
    if headers_lang == "pl" and body_lang == "en":
        fact = (
            f"Nagłówki sekcji są po polsku ({examples}), a treść podsumowania/"
            "doświadczenia/wykształcenia jest po angielsku."
        )
        # Body wins: unify toward the language the user actually wrote their
        # content in, or translate headers up to it — never rewrite the user's
        # prose into Polish behind their back.
        fix = (
            "Ujednolić język całego CV do języka treści (angielski): zamień "
            "nagłówki na angielskie (Summary / Experience / Education) albo "
            'świadomie użyj akcji „Przetłumacz CV", jeśli chcesz wersję polską.'
        )
    else:
        fact = (
            f"Nagłówki sekcji są po angielsku ({examples}), a treść jest po polsku."
        )
        fix = (
            "Ujednolić język całego CV: przetłumacz treść na angielski "
            "(Przetłumacz CV → English) albo zamień nagłówki na polskie, "
            "żeby dokument był w jednym języku."
        )
    return {
        "headers_lang": headers_lang,
        "body_lang": body_lang,
        "fact": fact,
        "fix": fix,
        "priority_title": "Ujednolicić język CV",
        "priority_description": f"{fact} {fix}",
        "message_sentence": (
            f"Największy problem profesjonalny to brak spójności językowej: {fact} "
            "Mieszanka języków wygląda nieprofesjonalnie."
        ),
        "tip": f"Spójność językowa: {fix}",
    }


def _language_mix_prompt_block(mix: dict | None, *, for_rating: bool = False) -> str:
    """Format a hard fact block for GPT when bilingual chrome/body is detected."""
    if not mix:
        return ""
    rating_rules = ""
    if for_rating:
        rating_rules = (
            "W kategorii Język przyznaj 0 pkt. "
            "Pierwszy element `priorities` oraz pierwszy tip MUSZĄ dotyczyć ujednolicenia języka "
            "(nagłówki i treść w jednym języku). "
        )
    return (
        "\n════════════════════════════════════════\n"
        "FAKT Z WARSTWY DETERMINISTYCZNEJ (OBOWIĄZKOWY — nie ignoruj):\n"
        f"{mix['fact']}\n"
        "To jest krytyczny błąd profesjonalizmu. "
        "W `message` wymień spójność językową jako główny problem (przed literówkami i stylistyką). "
        f"{rating_rules}"
        f"Proponowana naprawa: {mix['fix']}\n"
        "════════════════════════════════════════\n"
    )


def _feedback_mentions_language_mix(result: dict) -> bool:
    """True when GPT prose already names bilingual header/body inconsistency."""
    chunks = [str(result.get("message") or "")]
    chunks.extend(str(t) for t in (result.get("tips") or []))
    for item in result.get("priorities") or []:
        if isinstance(item, dict):
            chunks.append(str(item.get("title") or ""))
            chunks.append(str(item.get("description") or ""))
        else:
            chunks.append(str(item))
    blob = " ".join(chunks)
    return bool(_LANGUAGE_MIX_FEEDBACK_RE.search(blob))


def _ensure_language_mix_feedback(result: dict, mix: dict | None) -> dict:
    """Guarantee bilingual CVs surface language consistency in the dashboard.

    GPT sometimes scores Język low for typos alone and never names Polish
    headers + English body. When the deterministic detector fires, force the
    language category to 0 and prepend an explicit priority/tip/message lead.
    """
    if not mix or not isinstance(result, dict):
        return result

    categories = list(result.get("categories") or [])
    updated_categories = []
    language_touched = False
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        next_cat = dict(cat)
        if str(next_cat.get("id") or "").lower() == "language":
            next_cat["score"] = 0.0
            language_touched = True
        updated_categories.append(next_cat)
    if language_touched:
        result["categories"] = updated_categories
        total = sum(float(c.get("score") or 0) for c in updated_categories)
        # Keep the coarse 1–10 field aligned with the rubric the UI percentages use.
        result["rating"] = max(1, min(10, int(round(total))))

    if _feedback_mentions_language_mix(result):
        return result

    priority = {
        "title": mix["priority_title"],
        "description": mix["priority_description"],
    }
    priorities = [priority, *(result.get("priorities") or [])]
    result["priorities"] = priorities[:5]

    tips = [mix["tip"], *(result.get("tips") or [])]
    result["tips"] = tips[:8]

    message = str(result.get("message") or "").strip()
    lead = mix["message_sentence"]
    if message:
        result["message"] = f"{lead} {message}"
    else:
        result["message"] = lead
    return result


def _is_employment_period_line(content: str) -> bool:
    """True when the text looks like a job/education date range, not body copy."""
    text = " ".join(str(content or "").replace("\\n", " ").split()).strip()
    if not text or len(text) > 72:
        return False
    if _is_section_header_line(text):
        return False
    return bool(_EMPLOYMENT_PERIOD_RE.search(text))


def _employment_tense_from_period(content: str) -> str:
    """Return ``present`` for current roles, ``past`` for ended date ranges."""
    text = str(content or "")
    if _CURRENT_ROLE_END_RE.search(text):
        return "present"
    return "past"


def _annotate_employment_tense(elements: list[dict]) -> dict[str, str]:
    """Map body ``element_id`` → ``present``/``past`` from the nearest period line.

    Freestyle CVs store the job date as a separate text node above the bullets.
    Walking reading order lets language/improve prompts keep past roles in the
    past tense instead of rewriting every bullet as a current job.
    """
    text_elements = [
        el for el in elements
        if el.get("category") in ("text", "textarea")
        and el.get("element_id")
        and str(el.get("content") or "").strip()
    ]
    text_elements.sort(key=_reading_order_key)

    tense_by_id: dict[str, str] = {}
    active_tense: str | None = None
    for el in text_elements:
        content = str(el.get("content") or "").replace("\\n", "\n").strip()
        flat = " ".join(content.split())
        if _is_section_header_line(flat):
            active_tense = None
            continue
        if _is_employment_period_line(flat):
            active_tense = _employment_tense_from_period(flat)
            continue
        if not active_tense:
            continue
        # Annotate duty bullets (and meta lines) under the active period.
        # Skip contact-like lines; job titles above the next date may briefly
        # inherit the previous tense, which is harmless because titles are
        # rarely rewritten into tensed verbs.
        if "@" in flat or flat.startswith("http"):
            continue
        tense_by_id[str(el["element_id"])] = active_tense
    return tense_by_id


def _extract_text(elements: list[dict]) -> str:
    lines = []
    for el in elements:
        if el.get("category") in ("text", "textarea") and el.get("content"):
            lines.append(el["content"].replace("\\n", " "))
    return "\n".join(lines)


def _compact_inline_runs(content: str, runs) -> list[dict]:
    """Shrink inline decoration runs for GPT prompts.

    The canvas POST body already carries full ``runs``; rating/style extractors
    previously dropped them, so the model only saw the element base colour and
    could not spot a blue word inside an otherwise graphite paragraph.
    """
    if not isinstance(runs, list) or not runs:
        return []
    text = content if isinstance(content, str) else ""
    length = len(text)
    compact: list[dict] = []
    for run in runs:
        if not isinstance(run, dict):
            continue
        try:
            start = int(run.get("start"))
            end = int(run.get("end"))
        except (TypeError, ValueError):
            continue
        if end <= start or start < 0 or end > length:
            continue
        item: dict = {"start": start, "end": end}
        # Short excerpt so the model can name the painted phrase in tips.
        excerpt = text[start:end].replace("\n", " ").strip()
        if excerpt:
            item["text"] = excerpt[:48]
        if run.get("bold") is True:
            item["bold"] = True
        if run.get("italic") is True:
            item["italic"] = True
        if run.get("underline") is True:
            item["underline"] = True
        color = run.get("color")
        if isinstance(color, str) and color.strip():
            item["color"] = color.strip()
        # Skip empty overlays that only repeat base style with no marks.
        if len(item) <= 2:
            continue
        compact.append(item)
        if len(compact) >= 24:
            break
    return compact


def _extract_structured(elements: list[dict]) -> list[dict]:
    tense_by_id = _annotate_employment_tense(elements)
    items = []
    for el in elements:
        category = el.get("category")
        # An empty textarea can be the intended target of "write a summary".
        # Keep it in the model context so the response carries a real
        # correction keyed to the existing element instead of prose only in
        # the chat message. Empty text nodes remain excluded because canvas
        # contact/identity anchors use them as non-editable metadata.
        if category not in ("text", "textarea"):
            continue
        if category == "text" and not el.get("content"):
            continue
        element_id = el.get("element_id")
        content = el.get("content", "")
        item = {
            "element_id": element_id,
            "category": el.get("category"),
            "content": content,
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
        inline_runs = _compact_inline_runs(content, el.get("runs"))
        if inline_runs:
            item["runs"] = inline_runs
        # Present/past tag for duty bullets under dated experience blocks.
        tense = tense_by_id.get(str(element_id)) if element_id is not None else None
        if tense:
            item["employment_tense"] = tense
        items.append(item)
    return items


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
        "polygon": "[wielokąt]",
        "path": "[krzywa]",
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
            **({"filled": bool(el.get("filled", False))} if category in {"circle", "ellipse", "polygon", "rectangle"} else {}),
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
        content = el.get("content") or ""
        item = {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "fontSize": el.get("fontSize"),
            "fontFamily": el.get("fontFamily"),
            "color": el.get("color"),
            "bold": el.get("bold"),
            "italic": el.get("italic"),
            "align": el.get("align"),
            "preview": content[:60],
        }
        inline_runs = _compact_inline_runs(content, el.get("runs"))
        if inline_runs:
            # Per-span colour/bold overrides — required to catch accidental
            # painted words that still share the element's base `color`.
            item["runs"] = inline_runs
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
        # A concrete HTTP status proves that no assistant response was accepted,
        # so its reservation can be released immediately. Timeouts and broken
        # connections are different: the provider may have completed the call
        # after our client lost the response, and remain conservatively pending.
        response_lost = isinstance(exc, (APITimeoutError, APIConnectionError))
        confirmed_non_2xx = isinstance(exc, APIStatusError)
        raise AIServiceError(
            f"OpenAI request failed: {type(exc).__name__}",
            original=exc,
            reservation_outcome=(
                "release" if confirmed_non_2xx or not response_lost else "uncertain"
            ),
        ) from exc

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
                reservation_outcome="settle_usage",
                usage=usage,
            )
        raise AIServiceError(
            f"Model returned empty content (finish_reason={finish_reason})",
            reservation_outcome="settle_usage",
            usage=usage,
        )
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.rsplit("```", 1)[0].strip()
    try:
        parsed = json.loads(stripped)
    except json.JSONDecodeError as exc:
        raise AIServiceError(
            f"OpenAI returned malformed JSON: {exc}",
            original=exc,
            reservation_outcome="settle_usage",
            usage=usage,
        ) from exc
    if not isinstance(parsed, dict):
        raise AIServiceError(
            "OpenAI returned JSON with a non-object root",
            reservation_outcome="settle_usage",
            usage=usage,
        )
    return parsed, usage


def _safe_result_with_usage(
    raw: dict,
    usage: dict,
    *,
    allowed_fields: set,
) -> dict:
    """Normalize a provider object without losing known metering on bad shape.

    Once a provider response and its usage have arrived, nested schema errors
    are billable failed responses rather than confirmed pre-provider failures.
    Converting those errors here prevents the route's generic local-error path
    from releasing credits after the model has already completed.
    """
    try:
        return _safe_result(raw, allowed_fields=allowed_fields)
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise AIServiceError(
            "OpenAI returned an invalid assistant response shape",
            original=exc,
            reservation_outcome="settle_usage",
            usage=usage,
        ) from exc


def _gpt_result(
    system: str,
    user: str,
    *,
    action: str = "",
    allowed_fields: set | None = None,
) -> dict:
    raw, usage = _gpt(system, user, action=action)
    result = _safe_result_with_usage(
        raw,
        usage,
        allowed_fields=allowed_fields or _ALLOWED_FIELDS,
    )
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
    """Normalise GPT output and reject destructive content replacements.

    Content-editing actions may rephrase or shorten existing elements, but they
    must never turn an element into an empty input. Removing a record is a
    separate, explicitly reviewed operation; allowing an empty string here lets
    a malformed model response silently erase CV content.
    """
    raw_corrections = raw.get("corrections", [])
    raw_tips = raw.get("tips", [])
    raw_sources = raw.get("web_sources", [])
    if not isinstance(raw_corrections, list):
        raise ValueError("corrections must be a list")
    if not isinstance(raw_tips, list):
        raise ValueError("tips must be a list")
    if not isinstance(raw_sources, list):
        raise ValueError("web_sources must be a list")

    corrections = []
    for c in raw_corrections:
        if not isinstance(c, dict) or not c.get("element_id"):
            continue
        patch = {"element_id": c["element_id"]}
        for k, v in c.items():
            if k in allowed_fields:
                if k == "content" and not str(v or "").strip():
                    continue
                patch[k] = v
        if len(patch) > 1:
            corrections.append(patch)

    # Drop legacy "Rozkład oceny: …" tip strings — scores live in `categories`.
    tips = []
    for tip in raw_tips:
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
        "web_sources": [str(s) for s in raw_sources][:5],
        "categories": _normalize_categories(raw.get("categories")),
        "strengths": strengths,
        "priorities": priorities,
    }


# ── action handlers ────────────────────────────────────────────────────────

def _rate_cv(text: str, elements: list[dict]) -> dict:
    """Overall CV quality rating (content-focused) with tips and optional patches."""
    structured = _extract_structured(elements)
    element_count = len(structured)
    language_mix = _detect_language_mix(elements)
    mix_block = _language_mix_prompt_block(language_mix, for_rating=True)

    system = (
        "Jesteś starszym rekruterem i coachem CV z ponad 15-letnim doświadczeniem w branży "
        "technologicznej, finansowej i konsultingowej. Udzielasz rygorystycznych, szczerych i konkretnych opinii. "
        "Spójność językowa CV (jeden język w nagłówkach i treści) jest krytycznym sygnałem profesjonalizmu — "
        "mieszanka polski/angielski jest poważniejsza niż pojedyncze literówki. "
        "Nie wpisuj liczby oceny w `message` (ani jako X/10, ani jako procent) — interfejs pokazuje ją osobno. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeprowadź ustrukturyzowaną analizę poniższego CV według rubryki i oblicz dokładną ocenę.

TEKST CV (połączone wszystkie elementy tekstowe):
{text}

LICZBA ELEMENTÓW: na kanwie znaleziono {element_count} elementów text/textarea.
{mix_block}
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
   Najpierw sprawdź SPÓJNOŚĆ JĘZYKOWĄ całego dokumentu:
   - Czy nagłówki sekcji (np. PODSUMOWANIE ZAWODOWE / DOŚWIADCZENIE / WYKSZTAŁCENIE vs
     Summary / Experience / Education) są w tym samym języku co treść pod nimi?
   - Czy etykiety meta (np. „Obecnie” vs „CURRENTLY”) nie psują jednolitego języka?
   - Mieszanka PL/EN (polskie nagłówki + angielska treść lub odwrotnie) = 0 pkt w tej kategorii
     i MUSI być pierwszym priorytetem w `message` / `priorities` / `tips`, przed literówkami.
   Dopiero potem sprawdź: stronę bierną, frazesy, ogólniki oraz błędy gramatyczne i ortograficzne.
   2 pkt = jeden spójny język i brak istotnych problemów.
   1 pkt = jeden język, ale drobne problemy stylistyczne/ortograficzne.
   0 pkt = niespójność językowa albo istotne błędy językowe.

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
  "message": "<3–4 zdania: wskaż 1–2 konkretne mocne strony oraz 1–2 konkretne słabe strony. Jeśli jest niespójność językowa nagłówków i treści — nazwij ją jako główny problem. Bądź bezpośredni. Odnoś się do konkretnych treści z CV. Bez liczby oceny.>",
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
    result = _gpt_result(system, user, action="rating")
    return _ensure_language_mix_feedback(result, language_mix)


def _rate_design(elements: list[dict], page_size: dict | None = None) -> dict:
    """Rate typography and visual consistency only — no private geometry cap.

    Overlaps / clipped boxes / out-of-bounds are handled by **Układ**, not by
    silently capping this score at 5/10. ``page_size`` is accepted for API
    compatibility with other rating actions.
    """
    _ = page_size  # kept for analyze_action signature parity; unused here
    typo = json.dumps(_extract_typography(elements), ensure_ascii=False)
    protected_ids = _protected_typography_ids(elements)

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
   Czy kolory tekstu są używane konsekwentnie? Sprawdź zarówno `color` elementu, jak i opcjonalne
   `runs[]` (kolor/bold/italic na fragmencie `text`). Pojedyncze słowo w odstającym kolorze
   (np. niebieski run w grafitowym akapicie) to niespójność — wskaż je w tipach/priorytetach.

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
    {{"id": "alignment", "label": "Wyrównanie", "score": <0-2>, "max": 2}}
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

    # Drop a redundant "Ocena ogólna" category if the model still emits one —
    # the dashboard badge already shows the overall percent.
    result["categories"] = [
        cat for cat in (result.get("categories") or [])
        if str(cat.get("id") or "").lower() not in {"overall", "ocena_ogolna"}
    ]

    # A low visual score must be supported by a concrete, editable discrepancy.
    # Once template chrome and the intentional primary identity are excluded,
    # an empty correction list means the model found no actionable inconsistency.
    # Keep the baseline at 8 instead of returning an unsubstantiated low score.
    if not result.get("corrections") and isinstance(result.get("rating"), int):
        result["rating"] = max(result["rating"], 8)
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


def _fix_grammar(elements: list[dict], language_code: str = "pl") -> dict:
    """Propose content-only grammar/spelling corrections per text element.

    ``language_code`` fixes the language of the corrected `content` so an
    English or German CV is not silently rewritten into Polish. Advice fields
    remain Polish (see `_content_language_directive`).
    """
    structured = _extract_structured(elements)

    system = (
        "Jesteś profesjonalnym korektorem specjalizującym się w dokumentach biznesowych i CV. "
        "Poprawiaj WYŁĄCZNIE gramatykę, ortografię i interpunkcję. Nie zmieniaj znaczenia, tonu, "
        "czasu gramatycznego ani osoby. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
    user = f"""Sprawdź korektę każdego poniższego elementu tekstowego. Popraw wszystkie błędy gramatyczne, ortograficzne i interpunkcyjne.

ELEMENTY:
{json.dumps(structured, ensure_ascii=False)}

ZASADY:
- W tablicy corrections uwzględniaj tylko elementy, które rzeczywiście zawierają błędy.
- Wartość "content" w każdej poprawce musi zawierać PEŁNY poprawiony tekst (nie fragment).
- Nie ulepszaj stylu ani nie parafrazuj — tylko poprawiaj błędy.
- Nie zmieniaj czasu gramatycznego (przeszły ↔ teraźniejszy) ani osoby.
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


_TENSE_RULES_PL = """\
CZAS GRAMATYCZNY STANOWISK (OBOWIĄZKOWE — naruszenie = błąd):
- Pole `employment_tense` przy elemencie: `present` = aktualna rola, `past` = zakończona.
- `present` / data końcowa „Obecnie”/„Present”/„Now”: czas TERAŹNIEJSZY (Tworzę, Prowadzę, Weryfikuję).
- `past` / konkretna data końcowa (np. 05/2023, 12/2022): czas PRZESZŁY (Tworzyłem, Prowadziłem, Weryfikowałem).
- NIGDY nie zamieniaj czasu przeszłego zakończonej roli na teraźniejszy.
- NIGDY nie zamieniaj czasu teraźniejszego aktualnej roli na przeszły.
- Gdy brak `employment_tense`: zachowaj oryginalny czas i osobę z treści elementu.
- Zachowaj osobę gramatyczną oryginału (1. os. lub bezosobowa), chyba że poprawiasz jawny błąd.
"""


def _check_style(text: str, elements: list[dict], language_code: str = "pl") -> dict:
    """Language/style review with content patches where safe.

    ``language_code`` keeps rewrites in the CV language; advice stays Polish.
    """
    structured = _extract_structured(elements)
    language_mix = _detect_language_mix(elements)
    mix_block = _language_mix_prompt_block(language_mix)

    system = (
        "Jesteś profesjonalnym autorem CV specjalizującym się w poprawianiu tonu, jasności "
        "i profesjonalizmu języka w CV. "
        "Najpierw upewnij się, że nagłówki i treść są w jednym języku — mieszanka PL/EN "
        "jest poważniejszym błędem niż frazesy czy strona bierna. "
        "Czas gramatyczny obowiązków MUSI odpowiadać dacie stanowiska: zakończone role = przeszły, "
        "aktualne (Obecnie) = teraźniejszy. Nigdy nie ujednolicaj wszystkich opisów do jednego czasu. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
    user = f"""Przeanalizuj styl językowy tego CV i przeredaguj słabe elementy.

PEŁNY TEKST CV:
{text}

POJEDYNCZE ELEMENTY (do ukierunkowanych przeredagowań; respektuj `employment_tense`):
{json.dumps(structured[:40], ensure_ascii=False)}
{mix_block}
════════════════════════════════════════
{_tense_rules_for(language_code)}
ETAPY ANALIZY:

① SPÓJNOŚĆ JĘZYKOWA (najwyższy priorytet)
   Jeśli nagłówki są po polsku, a treść po angielsku (lub odwrotnie), nazwij to w `message`
   i w tipach jako główny problem. Przeredaguj treść do jednego języka zgodnego z nagłówkami
   (dla polskich nagłówków szablonu — na polski). Etykiety meta w stylu „CURRENTLY” też ujednolić
   (np. „Obecnie”), o ile nie są fixedToPage/locked.

② STRONA CZYNNA A BIERNA
   Znajdź każde użycie strony biernej („byłem odpowiedzialny”, „było zarządzane przez”).
   Po aktywizacji ZACHOWAJ czas z `employment_tense`.

③ FRAZESY I SŁABE SFORMUŁOWANIA
   Oznacz: „gracz zespołowy”, „pracowity”, „pasjonuję się”, „osoba z inicjatywą”,
   „nastawiony na wyniki”, „dbający o szczegóły”, „synergia”. Zastąp je dowodami.

④ OGÓLNIKOWE STWIERDZENIA
   Oznacz twierdzenia bez dowodów: „poprawiłem efektywność”, „prowadziłem projekty”.
   Tam, gdzie to właściwe, dodaj zastępczą metrykę: „poprawiłem efektywność o [X%]”.

⑤ PROFESJONALNY TON
   Czy ton jest zbyt nieformalny, zbyt formalny czy odpowiedni dla branży?

Przeredagowuj tylko elementy, które rzeczywiście tego wymagają. Krótkie elementy (imiona i nazwiska, daty)
nie powinny być przeredagowywane, chyba że to etykieta meta psująca spójność językową (np. CURRENTLY).
Nie „odświeżaj” zakończonych stanowisk do czasu teraźniejszego.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania: opisz najczęstsze problemy; jeśli jest niespójność językowa — wymień ją jako pierwszą>",
  "rating": null,
  "tips": [
    "<spójność językowa lub przykład strony biernej + przeredagowanie>",
    "<znaleziony frazes + konkretna zamiana>",
    "<ogólnikowe twierdzenie + sposób jego wzmocnienia>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny przeredagowany tekst w języku CV>"}}
  ],
  "web_sources": []
}}"""
    result = _gpt_result(system, user, action="language", allowed_fields=_CONTENT_FIELDS)
    if language_mix and not _feedback_mentions_language_mix(result):
        tips = [language_mix["tip"], *(result.get("tips") or [])]
        result["tips"] = tips[:8]
        message = str(result.get("message") or "").strip()
        lead = language_mix["message_sentence"]
        result["message"] = f"{lead} {message}".strip() if message else lead
    return result


def _improve_content(elements: list[dict], language_code: str = "pl") -> dict:
    """Suggest stronger CV wording without changing layout geometry.

    ``language_code`` keeps rewrites in the CV language; advice stays Polish.
    """
    structured = _extract_structured(elements)
    full_text = _extract_text(elements)
    language_mix = _detect_language_mix(elements)
    mix_block = _language_mix_prompt_block(language_mix)

    system = (
        "Jesteś wysokiej klasy autorem CV. Specjalizujesz się w przekształcaniu zwykłych opisów obowiązków "
        "w przekonujące, oparte na metrykach punkty, które przechodzą przez ATS i robią wrażenie na rekruterach. "
        "Zachowuj spójność językową z treścią CV (nie zmieniaj języka treści). "
        "Czas gramatyczny obowiązków MUSI odpowiadać dacie stanowiska (`employment_tense` / Obecnie vs data końcowa). "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
    user = f"""Przeredaguj poniższą treść CV, aby maksymalizować jej siłę oddziaływania.

PEŁNY TEKST CV (kontekst dat stanowisk):
{full_text}

ELEMENTY (respektuj `employment_tense`):
{json.dumps(structured[:40], ensure_ascii=False)}
{mix_block}
════════════════════════════════════════
{_tense_rules_for(language_code)}
ZASADY PRZEREDAGOWANIA (stosuj po kolei):

① SPÓJNOŚĆ JĘZYKOWA — jeśli treść jest w innym języku niż nagłówki, najpierw ujednolić język
   (zachowaj język treści CV, nie tłumacz jej na inny język), a dopiero potem wzmacniaj metryki.

② MOCNE CZASOWNIKI NA POCZĄTKU — każdy punkt zaczyna się od czasownika działania
   w czasie zgodnym z `employment_tense` (nie ujednolicaj wszystkich ról do jednego czasu).
   Dla `past`: mocny czasownik dokonany w czasie przeszłym; dla `present`: w czasie teraźniejszym.
   (Użyj czasowników w języku CV — nie tłumacz treści na inny język.)
   Unikaj: Pomagałem/Pomagam, Wspierałem/Wspieram, Byłem zaangażowany (zbyt słabe).

③ KWANTYFIKUJ WSZYSTKO — dodaj metrykę do każdego punktu opisującego osiągnięcie.
   Jeśli oryginał nie zawiera liczby, dodaj sensowny symbol zastępczy: [X%], [N użytkowników], [K zł].
   Przykład (rola zakończona): „Zarządzałem mediami społecznościowymi” → „Zwiększyłem liczbę obserwujących o [X%] w ciągu [N] miesięcy”

④ KONKRETNOŚĆ — zastępuj ogólne odniesienia do technologii/narzędzi ich rzeczywistymi nazwami, jeśli można je wywnioskować.
   „Używałem baz danych” → „Zoptymalizowałem zapytania PostgreSQL, zmniejszając opóźnienia o [X%]”

⑤ DŁUGOŚĆ — zachowaj 1–2 wiersze na punkt. Usuń wypełniacze. Każde słowo musi być uzasadnione.

⑥ POMIJAJ nagłówki sekcji, imiona i nazwiska, dane kontaktowe oraz daty — przeredagowuj tylko tekst doświadczenia, umiejętności i podsumowania.
   Wyjątek: krótkie etykiety meta psujące spójność (np. CURRENTLY → Obecnie) wolno poprawić.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania podsumowujące, co poprawiono i dlaczego; wspomnij ujednolicenie języka, jeśli dotyczy>",
  "rating": null,
  "tips": [
    "<znaleziony ogólny wzorzec, np. „5 punktów nie miało czasowników działania — wszystkie przeredagowano”>",
    "<wskazówka dotycząca zastępczych metryk: „Przed wysłaniem zastąp symbole [X%] rzeczywistymi wartościami”>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny przeredagowany tekst elementu w języku CV>"}}
  ],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="improve", allowed_fields=_CONTENT_FIELDS)


def _shorten_content(elements: list[dict], language_code: str = "pl") -> dict:
    """Suggest content-only cuts so an over-long CV fits on fewer pages.

    Unlike ``_improve_content`` (which strengthens wording and may add
    placeholder metrics), this action only shortens: it condenses, merges, or
    removes the least important fragments without inventing new facts. It
    returns the same ``corrections`` shape so the frontend renders the familiar
    Przed/Po review cards, and it never touches geometry, headings, names,
    contact data, or dates (those stay in ``_CONTENT_FIELDS`` scope only).

    ``language_code`` keeps the shortened `content` in the CV language.
    """
    structured = _extract_structured(elements)
    full_text = _extract_text(elements)

    system = (
        "Jesteś redaktorem CV specjalizującym się w zwięzłości. Skracasz zbyt długie CV, "
        "aby zmieściło się na mniejszej liczbie stron, nie tracąc ważnych informacji zawodowych. "
        "NIE wymyślasz nowych danych, liczb ani osiągnięć — wyłącznie skracasz, łączysz lub usuwasz to, co najmniej istotne. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        + _content_language_directive(language_code)
    )
    user = f"""CV jest zbyt długie. Znajdź fragmenty, które można skrócić, połączyć lub usunąć bez utraty ważnych informacji zawodowych.
Priorytetem jest zejście o jedną stronę.

PEŁNY TEKST CV (kontekst):
{full_text}

ELEMENTY (edytuj tylko treść doświadczenia, umiejętności, podsumowania i sekcji dodatkowych):
{json.dumps(structured[:40], ensure_ascii=False)}

════════════════════════════════════════
ZASADY SKRACANIA (stosuj po kolei):

① NIE WYMYŚLAJ — nie dodawaj faktów, liczb, technologii ani osiągnięć, których nie ma w oryginale. Zachowaj prawdziwość CV.

② SKRACAJ PODSUMOWANIE — jeśli ma więcej niż 3 wiersze, zredukuj do 2–3 najmocniejszych zdań.

③ ŁĄCZ PODOBNE PUNKTY — w jednym doświadczeniu połącz powtarzające się lub pokrewne punkty w jeden zwięzły.
   Usuń wypełniacze i oczywistości. Zachowaj punkty z konkretnymi osiągnięciami/metrykami.

④ OGRANICZAJ DŁUGIE LISTY — bardzo długie listy umiejętności lub zainteresowań skróć do najistotniejszych pozycji.

⑤ POMIJAJ nagłówki, imiona i nazwiska, dane kontaktowe oraz daty — ich nie skracaj.

⑥ Każda poprawka to KOMPLETNY nowy tekst danego elementu (nie fragment). Jeśli element ma zostać usunięty w całości, zwróć dla niego pusty string "".
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania: ile miejsca można odzyskać i co skrócono>",
  "rating": null,
  "tips": [
    "<ogólny wzorzec, np. „Podsumowanie miało 5 wierszy — skrócono do 3”>",
    "<wskazówka, np. „Sprawdź, czy skrócone punkty nadal oddają Twoje najważniejsze osiągnięcia”>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny skrócony tekst elementu w języku CV, lub \\"\\" aby usunąć>"}}
  ],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="shorten", allowed_fields=_CONTENT_FIELDS)


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


# Language-neutral tense rule for non-Polish CVs. It states the finished-vs-
# current rule WITHOUT Polish verb samples, so the model does not drift the
# rewrite toward Polish while still respecting employment tense.
_TENSE_RULES_NEUTRAL = """\
VERB TENSE FOR ROLES (MANDATORY — a violation is an error):
- Field `employment_tense` on an element: `present` = current role, `past` = ended.
- `present` / end date "Obecnie"/"Present"/"Now": use PRESENT tense.
- `past` / a concrete end date (e.g. 05/2023, 12/2022): use PAST tense.
- NEVER switch an ended role's past tense to present, or a current role's present to past.
- When `employment_tense` is absent: keep the element's original tense and grammatical person.
"""


def _tense_rules_for(lang_code: str) -> str:
    """Pick the tense-rule prompt block for the target correction language.

    Polish keeps its verb-sample rules; every other language gets the neutral
    variant so we never inject Polish verbs into a non-Polish rewrite.
    """
    return _TENSE_RULES_PL if (lang_code or "pl") == "pl" else _TENSE_RULES_NEUTRAL


def _content_language_directive(lang_code: str) -> str:
    """Build the prompt directive fixing the language of each response field.

    Correction `content` must be in the CV language; advice fields (`message`,
    `tips`, `priorities`) stay Polish because the app serves the Polish market
    and users read guidance in Polish. Unknown codes fall back to Polish.
    """
    code = (lang_code or "pl").strip().lower()
    lang_name = _TRANSLATE_LANGUAGE_NAMES.get(code, "polski")
    if code == "pl" or lang_name == "polski":
        return (
            "Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, "
            "zwracaj po polsku."
        )
    return (
        f"Pole `content` w każdej poprawce zwracaj w języku: {lang_name} "
        f"(kod: {code}) — to język CV użytkownika. "
        "Pola `message`, `tips` i `priorities` ZAWSZE zwracaj po polsku."
    )


def _rewrite_profile_content(
    action: str,
    elements: list[dict],
    cv_data: dict,
    *,
    language_code: str,
    target_language: str = "",
) -> dict:
    """Propose canvas patches and one canonical profile for a content action.

    Canvas text is a presentation of `cv_data`, not a stable persistence
    contract: templates can add bullets, combine dates, or reorder records.
    Returning the profile alongside reviewable patches keeps the next template
    fill consistent after the user accepts every proposed change.
    """
    profile = normalize_cv_data(cv_data)
    action_rules = {
        "grammar": "Popraw wyłącznie gramatykę, ortografię i interpunkcję.",
        "language": "Popraw styl i jasność języka, bez zmieniania faktów.",
        "improve": "Wzmocnij profesjonalny opis bez wymyślania faktów ani metryk.",
        "shorten": "Skróć treść zachowując najważniejsze fakty; puste pole jest dozwolone tylko gdy usunięcie jest uzasadnione.",
        "translate": f"Przetłumacz pełną treść na język: {_TRANSLATE_LANGUAGE_NAMES.get(target_language, target_language)}.",
    }
    rule = action_rules[action]
    structured = _extract_structured(elements)
    system = (
        "Jesteś redaktorem CV. Zwracasz wyłącznie poprawny JSON. "
        "Nie zmieniaj danych osobowych, nazw firm, adresów e-mail, telefonów, "
        "URL-i, dat, identyfikatorów, kluczy JSON ani struktury tablic."
    )
    user = f"""Wykonaj akcję: {action}.
{rule}

KANONICZNY PROFIL CV:
{json.dumps(profile, ensure_ascii=False)}

ELEMENTY PŁÓTNA:
{json.dumps(structured, ensure_ascii=False)}

ZASADY:
- Zwróć `updated_cv_data` jako kompletny profil po zmianach, zachowując jego klucze i strukturę.
- `corrections` zawiera pełne nowe treści widocznych elementów do indywidualnego podglądu.
- Nie zmieniaj geometrii ani stylów elementów.
- Wartości `content` oraz `updated_cv_data` mają być w języku: {language_code}.

Zwróć JSON:
{{
  "message": "<krótkie podsumowanie po polsku>",
  "tips": [],
  "corrections": [{{"element_id": "<id>", "content": "<pełna nowa treść>"}}],
  "updated_cv_data": {{"<kompletny profil po zmianach>"}},
  "web_sources": []
}}"""
    raw, usage = _gpt(system, user, action=action)
    result = _safe_result_with_usage(
        raw,
        usage,
        allowed_fields=_CONTENT_FIELDS,
    )
    result["usage"] = usage
    updated = raw.get("updated_cv_data")
    if isinstance(updated, dict):
        result["updated_cv_data"] = normalize_cv_data(updated)
    return result


def _translate_cv(
    elements: list[dict],
    target_language: str,
    cv_data: dict | None = None,
) -> dict:
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
    structured_profile = normalize_cv_data(cv_data) if isinstance(cv_data, dict) else None
    profile_instruction = ""
    if structured_profile is not None:
        profile_instruction = f"""

KANONICZNY PROFIL CV:
{json.dumps(structured_profile, ensure_ascii=False)}

Zwróć `translated_cv_data` zawierające kompletną kopię tego profilu. Zachowaj
identyczne klucze, tablice, kolejność rekordów i wartości nietekstowe. Tłumacz
wyłącznie wartości tekstowe istotne dla CV; nie tłumacz imion, nazw firm,
adresów e-mail, telefonów, URL-i ani kodów poziomów językowych."""

    user = f"""Przetłumacz treść CV na język: {lang_name} (kod: {lang}).

ELEMENTY DO TŁUMACZENIA:
{json.dumps(structured, ensure_ascii=False)}
{profile_instruction}

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
  "translated_cv_data": {{"<pełny przetłumaczony profil albo null>"}},
  "web_sources": []
}}"""
    raw, usage = _gpt(system, user, action="translate")
    result = _safe_result_with_usage(
        raw,
        usage,
        allowed_fields=_CONTENT_FIELDS,
    )
    result["usage"] = usage
    translated = raw.get("translated_cv_data")
    if isinstance(translated, dict):
        # Normalize the model output before persisting it, preserving the same
        # contract that `/ai/fill_template` consumes on every template.
        result["translated_cv_data"] = normalize_cv_data(translated)
    return _strip_protected_corrections(result, protected_ids)


def _ats_score(
    elements: list[dict],
    page_size: dict | None = None,
    template_id: str | None = None,
    *,
    image_resolver=None,
) -> dict:
    """Score ATS readability from a rendered PDF plus content-only LLM review.

    Deterministic layer (ReportLab → PyMuPDF): text extractability, contact
    fields, content order, and length. LLM layer: standard headings and
    keywords only — never decorative lines, ordinals, or visual chrome.

    Overall ``rating`` is recomputed from weighted categories in code so the
    dashboard cannot show 100% while subscores average ~92%.

    @raises AtsReadabilityError
        When PDF render or text extraction fails (caller must not charge credits).
    """
    resolver = image_resolver or image_src_to_local_path
    try:
        det = analyze_pdf_readability(elements, page_size, resolver)
    except AtsReadabilityError:
        raise

    # Prefer extracted PDF text for the content review; fall back to canvas text
    # with decorative chrome already stripped by expected_plain_text.
    pdf_text = (det.get("pdf_text") or "").strip()
    canvas_text = expected_plain_text(elements)
    review_text = pdf_text if len(pdf_text) >= 40 else canvas_text
    parsing_note = (
        f"Odczyt tekstu z PDF: {next((c['score'] for c in det['categories'] if c['id'] == 'text_extract'), 0)}/100. "
        f"Kontakt: {next((c['score'] for c in det['categories'] if c['id'] == 'contact'), 0)}/100. "
        f"Kolejność: {next((c['score'] for c in det['categories'] if c['id'] == 'section_order'), 0)}/100. "
        f"Długość (słowa w PDF): {next((c['score'] for c in det['categories'] if c['id'] == 'length'), 0)}/100."
    )
    template_note = f"Szablon: {template_id}." if template_id else ""

    system = (
        "Jesteś ekspertem od ATS (systemów śledzenia kandydatów). "
        "Wiesz, jak Workday, Greenhouse, Lever i Taleo analizują CV. "
        "Backend już zweryfikował techniczny odczyt PDF — NIE oceniaj dekoracji wizualnych "
        "(linie, ordinalne numery 01/02, ramki, tła, ikony, sidebar). "
        "Oceń WYŁĄCZNIE treść: standardowe nagłówki sekcji i słowa kluczowe. "
        "Nie wpisuj liczby oceny w `message` (ani jako X/10, ani jako procent) — interfejs pokazuje ją osobno. "
        "Pole `rating` ustaw na 0 (backend nadpisze wynik). "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeanalizuj treść CV pod kątem nagłówków i słów kluczowych istotnych dla ATS.

TEKST CV (z finalnego PDF lub oczyszczonego canvasu):
{review_text}

FAKTY Z WARSTWY TECHNICZNEJ (nie zmieniaj ich; nie karaj za dekoracje):
{parsing_note}
{template_note}

════════════════════════════════════════
OCEN TYLKO TE KATEGORIE (skala 0–100 każda):

① NAGŁÓWKI SEKCJI (id: headers)
   Standardowe lub bliskie: „Doświadczenie zawodowe” / „Doświadczenie”, „Wykształcenie”,
   „Umiejętności”, „Podsumowanie” / „Profil”, „Certyfikaty”, „Języki”.
   100 = większość standardowych obecna; 50 = mieszanka; 20 = nietypowe/brak.

② SŁOWA KLUCZOWE (id: keywords)
   Gęstość konkretnych kompetencji branżowych widocznych w tekście.
   100 = bogaty, konkretny język; 50 = ogólne sformułowania; 20 = bardzo ubogo.

NIE zwracaj kategorii: text_extract, contact, section_order, length, format, dates.
NIE obniżaj oceny za linie, numery sekcji, ikony ani układ graficzny.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania: główne ryzyko treściowe dla ATS (nagłówki/słowa kluczowe). Bez liczby oceny.>",
  "rating": 0,
  "categories": [
    {{"id": "headers", "label": "Nagłówki", "score": <0-100>, "max": 100}},
    {{"id": "keywords", "label": "Słowa kluczowe", "score": <0-100>, "max": 100}}
  ],
  "strengths": ["<mocna strona treści pod ATS>"],
  "priorities": [
    {{"title": "<główne ryzyko treściowe>", "description": "<konkretna poprawka>"}}
  ],
  "tips": [
    "<niestandardowy nagłówek + proponowana nazwa, jeśli dotyczy>",
    "<brakujące słowa kluczowe dla widocznej branży/roli>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    llm = _gpt_result(system, user, action="ats_score")
    merged = merge_ats_categories(det["categories"], llm.get("categories") or [])
    overall_pct = weighted_overall_percent(merged)
    llm["categories"] = merged
    llm["rating"] = percent_to_rating(overall_pct)
    # Keep prose free of invented overall scores; dashboard owns the number.
    return llm


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

    result = _safe_result_with_usage(
        raw,
        usage,
        allowed_fields=_ALLOWED_FIELDS,
    )
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
    cv_language: str = "",
    cv_data: dict | None = None,
    db=None,
    image_resolver=None,
) -> dict:
    """Dispatch one assistant button/chat action and return a UI-ready dict.

    ``cv_language`` optionally overrides auto-detection for the content-editing
    actions (grammar/language/improve/shorten). When empty, the CV language is
    detected from the canvas so corrections come back in the CV's language while
    advice stays Polish. The resolved code is echoed back as ``cv_language`` so
    the UI selector can reflect what was actually used.

    Unknown actions return an empty Polish error payload without calling GPT.
    `AIServiceError` is re-raised with action/element context filled in for logs.
    `AtsReadabilityError` from ``ats_score`` is converted to ``AIServiceError``
    with a user-facing Polish message so credits are not charged.
    """
    text = _extract_text(elements)
    # Prefer the DB-backed resolver so user-uploaded `/images/{id}/content`
    # paths resolve during ATS PDF render; fall back to filesystem/template paths.
    ats_resolver = (
        image_resolver
        or (make_image_resolver(db) if db is not None else image_src_to_local_path)
    )

    # Resolve the correction language once: an explicit override always wins
    # (the UI selector lets a user force a language); otherwise auto-detect
    # from the canvas. Unsupported override values fall back to detection
    # rather than silently failing.
    override = (cv_language or "").strip().lower()
    if override in _SUPPORTED_LANGS:
        resolved_language = override
    else:
        resolved_language = _detect_cv_language(elements)["code"]
    profile_content_action = (
        action in {"grammar", "language", "improve", "shorten", "translate"}
        and isinstance(cv_data, dict)
    )

    dispatchers = {
        "rating":          lambda: _rate_cv(text, elements),
        "design_rating":   lambda: _rate_design(elements, page_size),
        "position_rating": lambda: _rate_position(text, job_description),
        "grammar":         lambda: _rewrite_profile_content(
            "grammar", elements, cv_data, language_code=resolved_language,
        ) if profile_content_action else _fix_grammar(elements, resolved_language),
        "language":        lambda: _rewrite_profile_content(
            "language", elements, cv_data, language_code=resolved_language,
        ) if profile_content_action else _check_style(text, elements, resolved_language),
        "improve":         lambda: _rewrite_profile_content(
            "improve", elements, cv_data, language_code=resolved_language,
        ) if profile_content_action else _improve_content(elements, resolved_language),
        "shorten":         lambda: _rewrite_profile_content(
            "shorten", elements, cv_data, language_code=resolved_language,
        ) if profile_content_action else _shorten_content(elements, resolved_language),
        "ats_score":       lambda: _ats_score(
            elements,
            page_size,
            template_id,
            image_resolver=ats_resolver,
        ),
        "translate":       lambda: _rewrite_profile_content(
            "translate", elements, cv_data, language_code=target_language,
            target_language=target_language,
        ) if profile_content_action else _translate_cv(elements, target_language, cv_data),
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
            "cv_language": resolved_language,
        }
    try:
        result = fn()
        # A translation changes the CV's working language to its target. Echo
        # that target so later grammar/style actions do not reuse the source
        # language selected before translation. Other actions keep the
        # detected or explicitly selected correction language.
        if isinstance(result, dict):
            translated_language = (target_language or "").strip().lower()
            if action == "translate" and translated_language in _SUPPORTED_LANGS:
                result["cv_language"] = translated_language
            else:
                result.setdefault("cv_language", resolved_language)
        return result
    except AtsReadabilityError as exc:
        raise AIServiceError(
            str(exc),
            action=action,
            elements_count=len(elements),
            original=exc,
            user_message=exc.user_message,
            reservation_outcome="release",
        ) from exc
    except AIServiceError as exc:
        exc.action = exc.action or action
        exc.elements_count = exc.elements_count or len(elements)
        raise
