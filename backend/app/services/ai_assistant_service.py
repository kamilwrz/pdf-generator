"""
AI Assistant service — powers the floating AI chat panel.

Each action receives the current canvas elements, builds a focused prompt,
calls GPT, and returns a structured response the frontend can render
(message text, rating, tips, element-level correction patches).
"""
import json
import os
from openai import OpenAI
from app.core.config import OPENAI_API_KEY

_MODEL = os.getenv("AI_ASSISTANT_MODEL", "gpt-5.4-mini")
_client = OpenAI(api_key=OPENAI_API_KEY)


# ── helpers ────────────────────────────────────────────────────────────────

def _extract_text(elements: list[dict]) -> str:
    lines = []
    for el in elements:
        if el.get("category") in ("text", "textarea") and el.get("content"):
            lines.append(el["content"].replace("\\n", " "))
    return "\n".join(lines)


def _extract_structured(elements: list[dict]) -> list[dict]:
    """Minimal text-element spec for content/grammar/style corrections."""
    return [
        {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "content": el.get("content", ""),
            "fontSize": el.get("fontSize"),
            "bold": el.get("bold", False),
            "italic": el.get("italic", False),
            "align": el.get("align", "left"),
        }
        for el in elements
        if el.get("category") in ("text", "textarea") and el.get("content")
    ]


def _extract_design(elements: list[dict]) -> list[dict]:
    """Visual properties for layout/design corrections."""
    return [
        {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "left": el.get("left"),
            "top": el.get("top"),
            "width": el.get("width"),
            "height": el.get("height"),
            "fontSize": el.get("fontSize"),
            "fontFamily": el.get("fontFamily"),
            "color": el.get("color"),
            "bold": el.get("bold"),
            "align": el.get("align"),
            "zIndex": el.get("zIndex"),
            "page": el.get("page", 1),
            "preview": (el.get("content") or "")[:40],
        }
        for el in elements
    ]


def _gpt(system: str, user: str) -> dict:
    resp = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=2000,
    )
    return json.loads(resp.choices[0].message.content)


def _ddg_search(query: str, max_results: int = 4) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        return list(DDGS().text(query, max_results=max_results))
    except Exception:
        return []


def _safe_result(raw: dict) -> dict:
    """Normalise GPT output into the AssistantResponse shape."""
    return {
        "message": str(raw.get("message", "")),
        "rating": raw.get("rating") if isinstance(raw.get("rating"), int) else None,
        "tips": [str(t) for t in raw.get("tips", [])][:8],
        "corrections": [c for c in raw.get("corrections", []) if isinstance(c, dict) and c.get("element_id")],
        "web_sources": [str(s) for s in raw.get("web_sources", [])][:5],
    }


# ── action handlers ────────────────────────────────────────────────────────

def _rate_cv(text: str) -> dict:
    system = (
        "You are an expert CV reviewer with 15+ years of hiring experience. "
        "Return ONLY valid JSON."
    )
    user = f"""Rate the following CV (1-10) and give specific, actionable tips.

CV TEXT:
{text}

Return JSON:
{{
  "message": "<2-3 sentence overall assessment>",
  "rating": <1-10>,
  "tips": ["<specific tip 1>", "<specific tip 2>", "<specific tip 3>"],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _rate_design(elements: list[dict]) -> dict:
    design = json.dumps(_extract_design(elements), ensure_ascii=False)
    system = (
        "You are a visual CV design expert. Analyse layout, typography, and spacing. "
        "The canvas is A4 (595 × 842 pt). Content starts after a 300 px sidebar. "
        "Return ONLY valid JSON."
    )
    user = f"""Analyse the visual design of this CV canvas and suggest improvements.

ELEMENTS (positions, sizes, fonts, colors):
{design}

Return JSON with corrections that fix alignment or styling issues:
{{
  "message": "<2-3 sentence design assessment>",
  "rating": <1-10>,
  "tips": ["<design tip 1>", "<design tip 2>"],
  "corrections": [
    {{"element_id": "<id>", "align": "center"}},
    {{"element_id": "<id>", "fontSize": 12}}
  ],
  "web_sources": []
}}
Only include corrections where you see a clear improvement. Empty array is fine."""
    return _safe_result(_gpt(system, user))


def _rate_position(text: str, job_description: str) -> dict:
    sources = _ddg_search(f"{job_description[:120]} required skills qualifications 2025")
    web_ctx = "\n".join(
        f"- {r.get('title','')}: {r.get('body','')[:200]}"
        for r in sources
    )
    web_urls = [r.get("href", "") for r in sources if r.get("href")]
    system = (
        "You are a career advisor helping candidates assess their CV fit for a specific role. "
        "Return ONLY valid JSON."
    )
    user = f"""Rate how well this CV fits the job description (1-10).

JOB DESCRIPTION:
{job_description[:1500]}

CV CONTENT:
{text}

INDUSTRY CONTEXT (from web):
{web_ctx or 'No web results available.'}

Return JSON:
{{
  "message": "<assessment with strengths and gaps>",
  "rating": <1-10>,
  "tips": [
    "<missing skill or qualification>",
    "<how to better tailor the CV>",
    "<keyword to add>"
  ],
  "corrections": [],
  "web_sources": {json.dumps(web_urls[:3])}
}}"""
    result = _safe_result(_gpt(system, user))
    if not result["web_sources"] and web_urls:
        result["web_sources"] = web_urls[:3]
    return result


def _fix_grammar(elements: list[dict]) -> dict:
    structured = _extract_structured(elements)
    system = (
        "You are a professional proofreader. Fix ONLY grammar, spelling, and punctuation errors. "
        "Do not change meaning or style. Return ONLY valid JSON."
    )
    user = f"""Check every text element for grammar and spelling errors.

ELEMENTS:
{json.dumps(structured, ensure_ascii=False)}

Return a correction patch for EVERY element with errors.
If an element has no errors, omit it from corrections.

Return JSON:
{{
  "message": "<summary of issues found>",
  "rating": null,
  "tips": [],
  "corrections": [
    {{"element_id": "<id>", "content": "<corrected full text>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _check_style(text: str, elements: list[dict]) -> dict:
    structured = _extract_structured(elements)
    system = (
        "You are a professional CV writer. Improve writing style, tone, and clarity. "
        "Return ONLY valid JSON."
    )
    user = f"""Analyse the writing style of this CV and suggest improvements.

FULL TEXT:
{text}

TEXT ELEMENTS (for targeted corrections):
{json.dumps(structured[:30], ensure_ascii=False)}

Evaluate: professional tone, active vs passive voice, clarity, conciseness.
Return corrections only for elements that genuinely need rewriting.

Return JSON:
{{
  "message": "<style assessment>",
  "rating": null,
  "tips": ["<style tip 1>", "<style tip 2>"],
  "corrections": [
    {{"element_id": "<id>", "content": "<improved text>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _improve_content(elements: list[dict]) -> dict:
    structured = _extract_structured(elements)
    system = (
        "You are an expert CV writer who specialises in high-impact bullet points. "
        "Return ONLY valid JSON."
    )
    user = f"""Rewrite CV bullet points and descriptions to be more impactful.

Rules:
- Start bullets with strong action verbs (Led, Built, Launched, Increased…)
- Add quantifiable metrics where sensible ([X%] placeholder if unknown)
- Keep the original meaning — don't invent facts
- Only rewrite elements that genuinely benefit from improvement

TEXT ELEMENTS:
{json.dumps(structured[:30], ensure_ascii=False)}

Return JSON:
{{
  "message": "<summary of improvements>",
  "rating": null,
  "tips": ["<general writing tip 1>", "<general writing tip 2>"],
  "corrections": [
    {{"element_id": "<id>", "content": "<improved bullet / text>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _ats_score(text: str) -> dict:
    system = (
        "You are an ATS (Applicant Tracking System) optimisation expert. "
        "Return ONLY valid JSON."
    )
    user = f"""Analyse this CV for ATS compatibility (score 1-10).

CV TEXT:
{text}

Evaluate:
- Common ATS-friendly keywords present
- Standard section headings used
- No problematic formatting (tables, columns, graphics)
- Contact info completeness
- Date formats

Return JSON:
{{
  "message": "<ATS analysis>",
  "rating": <1-10>,
  "tips": [
    "<add keyword: ...>",
    "<rename section to standard name>",
    "<other ATS tip>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _chat(message: str, text: str) -> dict:
    system = (
        "You are a helpful CV assistant. You have access to the user's current CV content. "
        "Give specific, actionable advice. Keep responses concise (3-5 sentences). "
        "Return ONLY valid JSON."
    )
    user = f"""CV CONTENT:
{text or '(no content on canvas yet)'}

USER QUESTION:
{message}

Return JSON:
{{
  "message": "<your helpful response>",
  "rating": null,
  "tips": [],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


# ── public dispatcher ──────────────────────────────────────────────────────

def analyze_action(
    action: str,
    elements: list[dict],
    message: str = "",
    job_description: str = "",
) -> dict:
    text = _extract_text(elements)

    dispatchers = {
        "rating":          lambda: _rate_cv(text),
        "design_rating":   lambda: _rate_design(elements),
        "position_rating": lambda: _rate_position(text, job_description),
        "grammar":         lambda: _fix_grammar(elements),
        "language":        lambda: _check_style(text, elements),
        "improve":         lambda: _improve_content(elements),
        "ats_score":       lambda: _ats_score(text),
        "chat":            lambda: _chat(message, text),
    }

    fn = dispatchers.get(action)
    if fn is None:
        return {
            "message": f"Unknown action: {action}",
            "rating": None,
            "tips": [],
            "corrections": [],
            "web_sources": [],
        }
    return fn()
