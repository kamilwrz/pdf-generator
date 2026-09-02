"""Ground and normalize model output for job-specific CV tailoring.

Structured Outputs guarantees JSON shape, not factual truth. This module is
the second boundary: it computes the score, rejects unsupported rewrites, and
applies only allowlisted profile paths so identity and employment history
cannot be silently changed by the model.
"""

from __future__ import annotations

from copy import deepcopy
import json
import re
from typing import Any

from app.services.cv_data import normalize_cv_data


JOB_TAILORING_RESPONSE_SCHEMA = {
    "name": "job_tailoring_result",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": [
            "message", "requirements", "dimension_scores", "strengths",
            "priorities", "tips", "evidence_gaps", "corrections",
            "profile_updates",
        ],
        "properties": {
            "message": {"type": "string"},
            "requirements": {
                "type": "array",
                "maxItems": 15,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["id", "text", "kind", "weight", "match_status", "evidence_refs"],
                    "properties": {
                        "id": {"type": "string"},
                        "text": {"type": "string"},
                        "kind": {"type": "string", "enum": ["required", "preferred", "responsibility"]},
                        "weight": {"type": "integer", "minimum": 1, "maximum": 3},
                        "match_status": {"type": "string", "enum": ["matched", "partial", "missing"]},
                        "evidence_refs": {
                            "type": "array",
                            "maxItems": 5,
                            "items": {"type": "string"},
                        },
                    },
                },
            },
            "dimension_scores": {
                "type": "object",
                "additionalProperties": False,
                "required": ["seniority", "domain", "keywords", "differentiators"],
                "properties": {
                    "seniority": {"type": "number", "minimum": 0, "maximum": 2},
                    "domain": {"type": "number", "minimum": 0, "maximum": 2},
                    "keywords": {"type": "number", "minimum": 0, "maximum": 1},
                    "differentiators": {"type": "number", "minimum": 0, "maximum": 1},
                },
            },
            "strengths": {"type": "array", "maxItems": 5, "items": {"type": "string"}},
            "priorities": {
                "type": "array",
                "maxItems": 5,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["title", "description"],
                    "properties": {"title": {"type": "string"}, "description": {"type": "string"}},
                },
            },
            "tips": {"type": "array", "maxItems": 8, "items": {"type": "string"}},
            "evidence_gaps": {
                "type": "array",
                "maxItems": 10,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["requirement_id", "title", "description"],
                    "properties": {
                        "requirement_id": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                    },
                },
            },
            "corrections": {
                "type": "array",
                "maxItems": 30,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["element_id", "before", "content", "reason", "evidence_refs"],
                    "properties": {
                        "element_id": {"type": "string"},
                        "before": {"type": "string"},
                        "content": {"type": "string"},
                        "reason": {"type": "string"},
                        "evidence_refs": {"type": "array", "minItems": 1, "maxItems": 5, "items": {"type": "string"}},
                    },
                },
            },
            "profile_updates": {
                "type": "array",
                "maxItems": 30,
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["path", "before", "after", "evidence_refs"],
                    "properties": {
                        "path": {"type": "string"},
                        "before": {"type": "string"},
                        "after": {"type": "string"},
                        "evidence_refs": {"type": "array", "minItems": 1, "maxItems": 5, "items": {"type": "string"}},
                    },
                },
            },
        },
    },
}

_PLACEHOLDER_RE = re.compile(
    r"(?:\[[^\]]*(?:x|liczb|procent|metryk)[^\]]*\]|<[^>]+>|\bTBD\b|\bTODO\b)",
    re.IGNORECASE,
)
_NUMBER_RE = re.compile(r"(?<![\w])\d+(?:[.,]\d+)?\s*%?(?![\w])")
_ALLOWED_PROFILE_PATH_RE = re.compile(r"^/(summary|experience/\d+/bullets/\d+)$")
_REQUIREMENT_TOKEN_RE = re.compile(r"[A-Za-zÀ-ž][A-Za-zÀ-ž0-9.+#/-]{1,}")
_REQUIREMENT_STOPWORDS = {
    "and", "the", "with", "for", "from", "or", "years", "experience",
    "oraz", "dla", "pracy", "lat", "doświadczenia", "znajomość", "umiejętność",
    "wymagana", "wymagane", "mile", "widziane", "obsługa", "bardzo", "dobra",
}


def _compact(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _source_text(profile: dict | None, elements: list[dict], candidate_notes: str) -> str:
    return _compact(
        " ".join(
            [json.dumps(profile or {}, ensure_ascii=False), candidate_notes]
            + [str(item.get("content") or "") for item in elements if isinstance(item, dict)]
        )
    )


def build_evidence_catalog(elements: list[dict], candidate_notes: str = "") -> dict[str, str]:
    """Map stable evidence identifiers to exact candidate-provided source text.

    Model-generated paraphrases are unsuitable as identifiers because a valid
    bilingual match rarely repeats the complete Polish CV sentence verbatim.
    Canvas IDs and numbered note fragments let the model express semantic
    relevance while the server still verifies that every cited source exists.
    """
    catalog: dict[str, str] = {}
    for item in elements:
        if not isinstance(item, dict) or item.get("element_id") is None:
            continue
        content = _compact(item.get("content"))
        if content:
            catalog[f"canvas:{item['element_id']}"] = content

    note_fragments = re.split(r"(?:\r?\n)+|(?<=[.!?])\s+", str(candidate_notes or ""))
    for index, fragment in enumerate(note_fragments, start=1):
        content = _compact(fragment)
        if content:
            catalog[f"note:{index}"] = content
    return catalog


def _numbers(value: str) -> set[str]:
    return {re.sub(r"\s+", "", match.group(0)).replace(",", ".") for match in _NUMBER_RE.finditer(value)}


def _valid_evidence_refs(refs: object, evidence_catalog: dict[str, str]) -> list[str]:
    if not isinstance(refs, list) or not refs:
        return []
    normalized = [_compact(ref) for ref in refs if _compact(ref)]
    if not normalized or any(ref not in evidence_catalog for ref in normalized):
        return []
    return list(dict.fromkeys(normalized))


def _evidence_excerpt(refs: list[str], evidence_catalog: dict[str, str]) -> str:
    excerpts = []
    for ref in refs[:2]:
        value = evidence_catalog[ref]
        excerpts.append(value if len(value) <= 220 else f"{value[:217].rstrip()}…")
    return " · ".join(excerpts)


def _unsupported_missing_terms(after: str, source: str, requirements: list[dict]) -> set[str]:
    after_folded = after.casefold()
    source_folded = source.casefold()
    unsupported: set[str] = set()
    for requirement in requirements:
        if requirement.get("match_status") != "missing":
            continue
        for token in _REQUIREMENT_TOKEN_RE.findall(str(requirement.get("text") or "")):
            folded = token.casefold().strip("./-+")
            if len(folded) < 2 or folded in _REQUIREMENT_STOPWORDS:
                continue
            if re.search(rf"(?<!\w){re.escape(folded)}(?!\w)", after_folded) and not re.search(
                rf"(?<!\w){re.escape(folded)}(?!\w)", source_folded
            ):
                unsupported.add(token)
    return unsupported


def _is_grounded_rewrite(
    after: str,
    refs: object,
    source: str,
    requirements: list[dict],
    evidence_catalog: dict[str, str],
) -> bool:
    value = _compact(after)
    if not value or _PLACEHOLDER_RE.search(value):
        return False
    if not _numbers(value).issubset(_numbers(source)):
        return False
    if _unsupported_missing_terms(value, source, requirements):
        return False
    return bool(_valid_evidence_refs(refs, evidence_catalog))


def _normalise_requirements(value: object, evidence_catalog: dict[str, str]) -> list[dict]:
    if not isinstance(value, list):
        return []
    requirements: list[dict] = []
    seen: set[str] = set()
    for index, item in enumerate(value[:15]):
        if not isinstance(item, dict):
            continue
        text = _compact(item.get("text"))
        if not text or text.casefold() in seen:
            continue
        seen.add(text.casefold())
        kind = str(item.get("kind") or "required")
        if kind not in {"required", "preferred", "responsibility"}:
            kind = "required"
        status = str(item.get("match_status") or "missing")
        if status not in {"matched", "partial", "missing"}:
            status = "missing"
        evidence_refs = _valid_evidence_refs(item.get("evidence_refs"), evidence_catalog)
        # Structured output constrains the label but cannot prove the claim.
        # Positive matches therefore count only when they reference a real CV
        # element or candidate note. Semantic interpretation remains with the
        # model, while source existence is deterministic and server-enforced.
        if status != "missing" and not evidence_refs:
            status = "missing"
        if status == "missing":
            evidence_refs = []
        default_weight = {"required": 3, "preferred": 2, "responsibility": 1}[kind]
        try:
            weight = max(1, min(3, int(item.get("weight", default_weight))))
        except (TypeError, ValueError):
            weight = default_weight
        requirements.append({
            "id": _compact(item.get("id")) or f"req-{index + 1}",
            "text": text,
            "kind": kind,
            "weight": weight,
            "match_status": status,
            "evidence": _evidence_excerpt(evidence_refs, evidence_catalog),
            "evidence_refs": evidence_refs,
        })
    return requirements


def _requirement_score(requirements: list[dict]) -> float:
    total = sum(item["weight"] for item in requirements)
    if not total:
        return 0.0
    match_value = {"matched": 1.0, "partial": 0.5, "missing": 0.0}
    earned = sum(item["weight"] * match_value[item["match_status"]] for item in requirements)
    return round(4 * earned / total, 1)


def _clamp_score(value: object, maximum: float) -> float:
    try:
        return round(max(0.0, min(maximum, float(value))), 1)
    except (TypeError, ValueError):
        return 0.0


def _read_profile_path(profile: dict, path: str) -> str | None:
    parts = path.strip("/").split("/")
    if parts == ["summary"]:
        return str(profile.get("summary") or "")
    if len(parts) == 4 and parts[0] == "experience" and parts[2] == "bullets":
        try:
            return str(profile["experience"][int(parts[1])]["bullets"][int(parts[3])])
        except (IndexError, KeyError, TypeError, ValueError):
            return None
    return None


def _write_profile_path(profile: dict, path: str, value: str) -> bool:
    parts = path.strip("/").split("/")
    if parts == ["summary"]:
        profile["summary"] = value
        return True
    if len(parts) == 4 and parts[0] == "experience" and parts[2] == "bullets":
        try:
            profile["experience"][int(parts[1])]["bullets"][int(parts[3])] = value
            return True
        except (IndexError, KeyError, TypeError, ValueError):
            return False
    return False


def build_job_tailoring_result(
    raw: dict,
    *,
    elements: list[dict],
    cv_data: dict | None,
    candidate_notes: str = "",
) -> dict:
    """Create a deterministic score and discard every ungrounded change."""
    profile = normalize_cv_data(cv_data) if isinstance(cv_data, dict) else None
    source = _source_text(profile, elements, candidate_notes)
    evidence_catalog = build_evidence_catalog(elements, candidate_notes)
    requirements = _normalise_requirements(raw.get("requirements"), evidence_catalog)
    element_content = {
        str(item.get("element_id")): str(item.get("content") or "")
        for item in elements
        if isinstance(item, dict) and item.get("element_id") is not None
    }
    corrections: list[dict] = []
    rejected = 0
    raw_corrections = raw.get("corrections") if isinstance(raw.get("corrections"), list) else []
    for item in raw_corrections[:30]:
        if not isinstance(item, dict):
            rejected += 1
            continue
        element_id = str(item.get("element_id") or "")
        current = element_content.get(element_id)
        before = str(item.get("before") or "")
        after = _compact(item.get("content"))
        if current is None or before != current or after == current or not _is_grounded_rewrite(
            after, item.get("evidence_refs"), source, requirements, evidence_catalog
        ):
            rejected += 1
            continue
        corrections.append({"element_id": element_id, "content": after})

    updated_profile = deepcopy(profile) if profile else None
    applied_profile_updates = 0
    raw_updates = raw.get("profile_updates") if isinstance(raw.get("profile_updates"), list) else []
    if updated_profile:
        for item in raw_updates[:30]:
            if not isinstance(item, dict):
                continue
            path = str(item.get("path") or "")
            before = str(item.get("before") or "")
            after = _compact(item.get("after"))
            current = _read_profile_path(updated_profile, path)
            if (
                not _ALLOWED_PROFILE_PATH_RE.fullmatch(path)
                or current is None
                or before != current
                or after == current
                or not _is_grounded_rewrite(
                    after,
                    item.get("evidence_refs"),
                    source,
                    requirements,
                    evidence_catalog,
                )
            ):
                continue
            if _write_profile_path(updated_profile, path, after):
                applied_profile_updates += 1
        if applied_profile_updates:
            updated_profile = normalize_cv_data(updated_profile)
        else:
            updated_profile = None

    dimensions = raw.get("dimension_scores") if isinstance(raw.get("dimension_scores"), dict) else {}
    categories = [
        {"id": "requirements", "label": "Wymagania", "score": _requirement_score(requirements), "max": 4},
        {"id": "seniority", "label": "Seniority", "score": _clamp_score(dimensions.get("seniority"), 2), "max": 2},
        {"id": "domain", "label": "Obszar", "score": _clamp_score(dimensions.get("domain"), 2), "max": 2},
        {"id": "keywords", "label": "Słowa kluczowe", "score": _clamp_score(dimensions.get("keywords"), 1), "max": 1},
        {"id": "differentiators", "label": "Wyróżniki", "score": _clamp_score(dimensions.get("differentiators"), 1), "max": 1},
    ]
    rating = max(1, min(10, round(sum(item["score"] for item in categories))))

    evidence_gaps: list[dict] = []
    requirement_statuses = {item["id"]: item["match_status"] for item in requirements}
    raw_gaps = raw.get("evidence_gaps") if isinstance(raw.get("evidence_gaps"), list) else []
    for item in raw_gaps[:10]:
        if not isinstance(item, dict):
            continue
        title = _compact(item.get("title"))
        requirement_id = _compact(item.get("requirement_id"))
        # A model may produce a provisional gap and later cite valid evidence
        # for the same requirement. Do not show those contradictory states.
        if title and requirement_statuses.get(requirement_id) != "matched":
            evidence_gaps.append({
                "requirement_id": requirement_id,
                "title": title,
                "description": _compact(item.get("description")),
            })
    if rejected:
        evidence_gaps.insert(0, {
            "requirement_id": "grounding",
            "title": "Pominięto niepotwierdzone zmiany",
            "description": "Nie zastosowano propozycji zawierających nowe fakty, liczby albo techniki bez potwierdzenia w CV lub notatkach kandydata.",
        })

    return {
        "message": _compact(raw.get("message")),
        "rating": rating,
        "tips": [_compact(item) for item in (raw.get("tips") or []) if _compact(item)][:8],
        "corrections": corrections,
        "categories": categories,
        "strengths": [_compact(item) for item in (raw.get("strengths") or []) if _compact(item)][:5],
        "priorities": [
            {"title": _compact(item.get("title")), "description": _compact(item.get("description"))}
            for item in (raw.get("priorities") or [])[:5]
            if isinstance(item, dict) and _compact(item.get("title"))
        ],
        "web_sources": [],
        "job_requirements": requirements,
        "evidence_gaps": evidence_gaps[:10],
        "updated_cv_data": updated_profile,
    }
