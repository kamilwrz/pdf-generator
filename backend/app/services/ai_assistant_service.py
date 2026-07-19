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
from app.services.layout_analysis import analyze_layout

_MODEL = os.getenv("AI_ASSISTANT_MODEL", "gpt-5.5")
_client = OpenAI(api_key=OPENAI_API_KEY)

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
            "bold": el.get("bold", False),
            "italic": el.get("italic", False),
            "align": el.get("align", "left"),
        }
        for el in elements
        if el.get("category") in ("text", "textarea") and el.get("content")
    ]


def _extract_typography(elements: list[dict]) -> list[dict]:
    """Typography-only view — NO positional data, so GPT cannot misplace elements."""
    return [
        {
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
        for el in elements
        if el.get("category") in ("text", "textarea") and el.get("content")
    ]


def _gpt(system: str, user: str) -> dict:
    resp = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        reasoning_effort="medium",
        max_completion_tokens=16000,
    )
    content = resp.choices[0].message.content or ""
    if not content.strip():
        raise ValueError(
            f"Model returned empty content (finish_reason={resp.choices[0].finish_reason})"
        )
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.rsplit("```", 1)[0].strip()
    return json.loads(stripped)


def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        return list(DDGS().text(query, max_results=max_results))
    except Exception:
        return []


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

    return {
        "message": str(raw.get("message", "")),
        "rating": raw.get("rating") if isinstance(raw.get("rating"), int) else None,
        "tips": [str(t) for t in raw.get("tips", [])][:8],
        "corrections": corrections,
        "web_sources": [str(s) for s in raw.get("web_sources", [])][:5],
    }


# ── action handlers ────────────────────────────────────────────────────────

def _rate_cv(text: str, elements: list[dict]) -> dict:
    structured = _extract_structured(elements)
    element_count = len(structured)

    system = (
        "You are a senior recruiter and CV coach with 15+ years of experience across tech, "
        "finance, and consulting. You give rigorous, honest, specific feedback. "
        "Return ONLY valid JSON."
    )
    user = f"""Perform a structured rubric-based analysis of the CV below and calculate a precise score.

CV TEXT (all text elements joined):
{text}

ELEMENT COUNT: {element_count} text/textarea elements found on canvas.

════════════════════════════════════════
SCORING RUBRIC — work through each step explicitly before writing the final JSON.

① SECTION COMPLETENESS (0–2 pts)
   Identify which of these sections are present: Contact Info, Summary/Objective,
   Work Experience, Education, Skills/Technologies.
   Score = (sections present / 5) × 2. Round to 1 decimal.

② EXPERIENCE QUALITY (0–3 pts)
   For each job/role entry found:
   - Does it open with a strong action verb? (Led, Built, Designed, Increased…)
   - Does it include at least one quantified result (%, $, number, time saved)?
   Award: 1 pt if >60% of bullets use action verbs, 1 pt if >40% include metrics,
   1 pt if roles show progression or relevance to the target field.

③ LANGUAGE & PROFESSIONALISM (0–2 pts)
   Check for: passive voice ("was responsible for"), clichés ("team player",
   "go-getter", "passionate about"), vague filler, grammar/spelling issues.
   2 pts = none found. 1 pt = minor issues. 0 pts = significant problems.

④ FORMAT & HIERARCHY (0–2 pts)
   Based on element count and content variety: Is there a clear visual hierarchy
   (name > headings > body)? Is length appropriate (1–2 pages)?
   Award up to 2 pts.

⑤ DIFFERENTIATION (0–1 pt)
   Does the CV include something memorable — a standout achievement, rare skill,
   leadership example, or quantified impact that sets this candidate apart?
   1 pt if yes, 0 if generic.

TOTAL = ①+②+③+④+⑤, rounded to nearest integer, clamped 1–10.
════════════════════════════════════════

Return JSON (include the sub-scores in the tips):
{{
  "message": "<3–4 sentences: state the calculated score, name 1–2 concrete strengths, name 1–2 concrete weaknesses. Be direct. Reference specific content found in the CV.>",
  "rating": <calculated total 1-10>,
  "tips": [
    "Score breakdown: Sections ①/2 + Experience ②/3 + Language ③/2 + Format ④/2 + Differentiation ⑤/1 = total/10",
    "<most impactful fix with a before/after example>",
    "<second most impactful fix>",
    "<missing section or element if any>",
    "<quantification opportunity: which role/bullet needs a metric>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _rate_design(elements: list[dict]) -> dict:
    typo = json.dumps(_extract_typography(elements), ensure_ascii=False)

    system = (
        "You are a CV typography and visual design expert. "
        "You ONLY suggest changes to font size, font family, color, bold, italic, and text alignment. "
        "You NEVER touch element positions (left, top, width, height) — those are fixed by the template. "
        "Return ONLY valid JSON."
    )
    user = f"""Analyse the typography and text styling of this CV canvas.

TYPOGRAPHY DATA (no positions — do not infer or suggest any positional changes):
{typo}

════════════════════════════════════════
ANALYSIS STEPS:

① FONT SIZE HIERARCHY
   Is there a clear size progression: name (largest) > section headings > body text?
   Typical good values: name 22–28px, headings 14–16px, body 10–12px.
   Flag elements that break this hierarchy.

② BOLD & EMPHASIS
   Are headings consistently bold? Is bold overused (everything bold = nothing stands out)?

③ COLOR CONSISTENCY
   Are text colors used consistently? Identify any element with an outlier color.

④ ALIGNMENT
   Is body text consistently left-aligned? Are headings consistently aligned?
   Mixed alignment within the same section looks unprofessional.

⑤ OVERALL SCORE
   Based on ①–④, assign a design score 1–10.
════════════════════════════════════════

Return corrections ONLY for clear typography improvements.
Each correction may contain ONLY these fields: fontSize, fontFamily, color, bold, italic, align.
Do NOT include element_id values from the data above unless you are certain they need changing.

Return JSON:
{{
  "message": "<2–3 sentences: state the score and name the most impactful typography issues found>",
  "rating": <1-10>,
  "tips": [
    "Score breakdown: Hierarchy ①/3 + Emphasis ②/2 + Color ③/2 + Alignment ④/2 + Overall ⑤/1",
    "<specific typography fix with element preview>",
    "<second specific fix>"
  ],
  "corrections": [
    {{"element_id": "<id>", "fontSize": 12}},
    {{"element_id": "<id>", "bold": true}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user), allowed_fields=_STYLE_FIELDS)


def _rate_position(text: str, job_description: str) -> dict:
    jd_preview = job_description[:120]
    sources = _ddg_search(f"{jd_preview} required skills qualifications job requirements 2025")
    web_ctx = "\n".join(
        f"- {r.get('title', '')}: {r.get('body', '')[:250]}"
        for r in sources
    )
    web_urls = [r.get("href", "") for r in sources if r.get("href")]

    system = (
        "You are a senior career advisor and hiring manager. "
        "You give an honest, calculated fit assessment between a CV and a job description. "
        "Return ONLY valid JSON."
    )
    user = f"""Calculate how well this CV matches the job description. Score 1–10.

JOB DESCRIPTION:
{job_description[:2000]}

CV CONTENT:
{text}

WEB CONTEXT (industry standards for this role):
{web_ctx or "No web results available."}

════════════════════════════════════════
CALCULATION STEPS:

① REQUIRED SKILLS MATCH (0–4 pts)
   Extract the top 10 required skills/technologies from the job description.
   Count how many appear in the CV (exact or close synonym).
   Score = (matched / 10) × 4.

② EXPERIENCE LEVEL MATCH (0–2 pts)
   Does the CV's years of experience and seniority match what the JD requires?
   2 = perfect match, 1 = close, 0 = significant gap.

③ DOMAIN / INDUSTRY MATCH (0–2 pts)
   Does the candidate's background domain (industry, company type, scale) match?
   2 = strong match, 1 = partial, 0 = different domain.

④ LANGUAGE & KEYWORD MATCH (0–1 pt)
   Does the CV use terminology the JD uses? (ATS-relevant)

⑤ DIFFERENTIATORS (0–1 pt)
   Does the CV show something that makes this candidate stand out for this specific role?

TOTAL = ①+②+③+④+⑤, rounded, clamped 1–10.
════════════════════════════════════════

Return JSON:
{{
  "message": "<3–4 sentences: state the score and its calculation, name the matched skills, name the gaps. Be specific.>",
  "rating": <calculated 1-10>,
  "tips": [
    "Score breakdown: Skills ①/4 + Seniority ②/2 + Domain ③/2 + Keywords ④/1 + Differentiators ⑤/1 = total/10",
    "<list the top 3–5 skills from JD that are MISSING from the CV>",
    "<most impactful CV change to improve fit>",
    "<specific keyword to add to the CV>",
    "<section to tailor or add>"
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
        "You are a professional proofreader specialising in business and CV documents. "
        "Fix ONLY grammar, spelling, and punctuation. Do not change meaning, tone, or structure. "
        "Return ONLY valid JSON."
    )
    user = f"""Proofread every text element below. Fix all grammar, spelling, and punctuation errors.

ELEMENTS:
{json.dumps(structured, ensure_ascii=False)}

RULES:
- Only include elements that actually have errors in the corrections array.
- The "content" value in each correction must be the FULL corrected text (not a snippet).
- Do not improve style or rephrase — only fix errors.
- Count all errors found and report in the message.

Return JSON:
{{
  "message": "<summary: X errors found across Y elements. List the most common error types.>",
  "rating": null,
  "tips": [],
  "corrections": [
    {{"element_id": "<id>", "content": "<full corrected text of this element>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user), allowed_fields=_CONTENT_FIELDS)


def _check_style(text: str, elements: list[dict]) -> dict:
    structured = _extract_structured(elements)

    system = (
        "You are a professional CV writer who specialises in improving the tone, clarity, "
        "and professionalism of CV language. Return ONLY valid JSON."
    )
    user = f"""Analyse the writing style of this CV and rewrite weak elements.

FULL CV TEXT:
{text}

INDIVIDUAL ELEMENTS (for targeted rewrites):
{json.dumps(structured[:30], ensure_ascii=False)}

════════════════════════════════════════
ANALYSIS STEPS:

① ACTIVE vs PASSIVE VOICE
   Find every instance of passive voice ("was responsible for", "were managed by").
   These are the highest-priority rewrites.

② CLICHÉS & WEAK PHRASES
   Flag: "team player", "hardworking", "passionate about", "go-getter",
   "results-driven", "detail-oriented", "synergy". Replace with evidence.

③ VAGUE CLAIMS
   Flag claims without evidence: "improved efficiency", "led projects".
   Add a placeholder metric where appropriate: "improved efficiency by [X%]".

④ PROFESSIONAL TONE
   Is it too informal, too formal, or appropriate for the industry?

Rewrite only elements that genuinely need it. Short elements (names, dates, headings)
should not be rewritten.
════════════════════════════════════════

Return JSON:
{{
  "message": "<2–3 sentences: describe the most common style issues found and the overall tone assessment>",
  "rating": null,
  "tips": [
    "<passive voice instance found + rewrite example>",
    "<cliché found + specific replacement>",
    "<vague claim + how to strengthen it>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<full rewritten text>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user), allowed_fields=_CONTENT_FIELDS)


def _improve_content(elements: list[dict]) -> dict:
    structured = _extract_structured(elements)

    system = (
        "You are a top-tier CV writer. You specialise in turning ordinary job descriptions "
        "into compelling, metric-driven bullet points that pass ATS and impress recruiters. "
        "Return ONLY valid JSON."
    )
    user = f"""Rewrite the CV content below to maximise impact.

ELEMENTS:
{json.dumps(structured[:30], ensure_ascii=False)}

════════════════════════════════════════
REWRITING RULES (apply in order):

① STRONG OPENING VERBS — every bullet must open with a past-tense action verb.
   Prefer: Architected, Launched, Reduced, Increased, Negotiated, Delivered, Automated,
   Scaled, Redesigned, Streamlined. Avoid: Helped, Assisted, Was involved in.

② QUANTIFY EVERYTHING — add a metric to every achievement bullet.
   If the original has no number, add a sensible placeholder: [X%], [N users], [$K].
   Example: "Managed social media" → "Grew social media following by [X%] in [N] months"

③ SPECIFICITY — replace vague tech/tool references with the actual names if inferable.
   "Used databases" → "Optimised PostgreSQL queries reducing latency by [X%]"

④ LENGTH — keep each bullet 1–2 lines. Cut filler. Every word must earn its place.

⑤ SKIP headers, names, contact info, dates — only rewrite experience/skill/summary text.
════════════════════════════════════════

Return JSON:
{{
  "message": "<2–3 sentences summarising what was improved and why>",
  "rating": null,
  "tips": [
    "<general pattern found: e.g., '5 bullets lacked action verbs — all rewritten'>",
    "<metric-placeholder tip: 'Replace [X%] placeholders with your real numbers before sending'>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<fully rewritten element text>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user), allowed_fields=_CONTENT_FIELDS)


def _ats_score(text: str) -> dict:
    system = (
        "You are an ATS (Applicant Tracking System) expert. "
        "You know how Workday, Greenhouse, Lever, and Taleo parse CVs. "
        "Return ONLY valid JSON."
    )
    user = f"""Analyse this CV for ATS compatibility. Score 1–10.

CV TEXT:
{text}

════════════════════════════════════════
CALCULATION STEPS:

① STANDARD SECTION HEADINGS (0–2 pts)
   ATS expects exact or near-exact headings. Check for:
   "Work Experience" / "Experience", "Education", "Skills", "Summary" / "Profile",
   "Certifications", "Languages".
   Score = (standard headings found / 6) × 2.

② KEYWORD DENSITY (0–3 pts)
   Identify the top 5 industry-standard keywords present in the CV
   (e.g., specific technologies, methodologies, soft skills).
   Score = (keywords found / 5) × 3.

③ CONTACT INFO COMPLETENESS (0–1 pt)
   Email, phone, LinkedIn/GitHub, location. 1 pt if ≥3 present, 0.5 if 2, 0 if ≤1.

④ DATE FORMAT CONSISTENCY (0–1 pt)
   Dates should be Month Year or MM/YYYY throughout. 1 pt if consistent, 0 if mixed.

⑤ FORMATTING SAFETY (0–2 pts)
   ATS struggles with: tables, images in text flow, special characters, unusual fonts.
   Based on element structure, award up to 2 pts.

⑥ LENGTH (0–1 pt)
   1–2 pages is optimal. Estimate from word count in text.

TOTAL = ①+②+③+④+⑤+⑥, clamped 1–10.
════════════════════════════════════════

Return JSON:
{{
  "message": "<2–3 sentences: state the score, the main ATS risk factor, and the top keyword gap>",
  "rating": <calculated 1-10>,
  "tips": [
    "Score breakdown: Headings ①/2 + Keywords ②/3 + Contact ③/1 + Dates ④/1 + Format ⑤/2 + Length ⑥/1 = total/10",
    "<non-standard heading found + what to rename it to>",
    "<top 3 missing ATS keywords for this apparent industry/role>",
    "<contact info gap if any>",
    "<date format issue if any>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _chat(message: str, text: str) -> dict:
    system = (
        "You are an expert CV coach. You have the user's full CV content as context. "
        "Give specific, actionable advice grounded in the actual CV text. "
        "If the user asks for a rating or score, calculate it with a rubric (don't just guess). "
        "Keep responses focused and concise — 3–5 sentences for simple questions, "
        "longer for analysis requests. Return ONLY valid JSON."
    )
    user = f"""CV CONTENT:
{text or "(no content on canvas yet)"}

USER QUESTION:
{message}

Return JSON:
{{
  "message": "<your response — specific, grounded in the CV content above>",
  "rating": null,
  "tips": ["<tip if relevant>"],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _analyze_layout(elements: list[dict], page_size: dict | None) -> dict:
    """Return deterministic layout proposals; GPT never chooses coordinates."""
    return analyze_layout(elements, page_size)


# ── public dispatcher ──────────────────────────────────────────────────────

def analyze_action(
    action: str,
    elements: list[dict],
    message: str = "",
    job_description: str = "",
    page_size: dict | None = None,
) -> dict:
    text = _extract_text(elements)

    dispatchers = {
        "rating":          lambda: _rate_cv(text, elements),
        "design_rating":   lambda: _rate_design(elements),
        "position_rating": lambda: _rate_position(text, job_description),
        "grammar":         lambda: _fix_grammar(elements),
        "language":        lambda: _check_style(text, elements),
        "improve":         lambda: _improve_content(elements),
        "ats_score":       lambda: _ats_score(text),
        "chat":            lambda: _chat(message, text),
        "layout":          lambda: _analyze_layout(elements, page_size),
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
