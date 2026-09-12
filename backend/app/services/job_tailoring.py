"""Ground and normalize model output for job-specific CV tailoring.

Structured Outputs guarantees JSON shape, not factual truth. This module is
the second boundary: it computes the score, rejects unsupported rewrites, and
applies only allowlisted profile paths so identity and employment history
cannot be silently changed by the model.
"""

from __future__ import annotations

from copy import deepcopy
import json
import math
import re

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
                    "required": ["requirement_id", "title", "description"],
                    "properties": {
                        "requirement_id": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                    },
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

# The analysis action never returns applicable edits; document creation belongs
# to the interview's verified preview workflow.
JOB_ANALYSIS_RESPONSE_SCHEMA = deepcopy(JOB_TAILORING_RESPONSE_SCHEMA)
JOB_ANALYSIS_RESPONSE_SCHEMA['name'] = 'job_analysis_result'
for _field in ('corrections', 'profile_updates'):
    JOB_ANALYSIS_RESPONSE_SCHEMA['schema']['required'].remove(_field)
    del JOB_ANALYSIS_RESPONSE_SCHEMA['schema']['properties'][_field]


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


def _profile_evidence(profile: dict) -> dict[str, str]:
    """Index authored profile leaves, excluding presentation and duplicate views.

    Paths refer to the normalized profile supplied to the model. A section's
    heading or skill category describes grouping, not a candidate capability;
    only its item content may be cited. The derived ``extra_sections`` view is
    excluded because its content already lives in the editable canonical fields.
    """
    catalog: dict[str, str] = {}

    def collect(value: object, path: str) -> None:
        if isinstance(value, str):
            content = _compact(value)
            if content:
                catalog[f"cv:{path}"] = content
        elif isinstance(value, list):
            for index, item in enumerate(value):
                collect(item, f"{path}/{index}")
        elif isinstance(value, dict):
            for key, item in value.items():
                if key in {"category", "layout", "kind", "placement", "section_type", "bulletList"}:
                    continue
                # The custom-section title labels a collection. Nested record
                # titles identify real projects, publications, or voluntary work.
                if key == "title" and re.fullmatch(r"/custom_sections/\d+", path):
                    continue
                # Education's legacy detail is normally a generated display
                # string. Retain it only when it is the sole legacy description.
                if key == "detail" and any(value.get(field) for field in ("school", "city", "description", "bullets")):
                    continue
                collect(item, f"{path}/{key}")

    for field in (
        "title", "summary", "address", "website", "github", "linkedin",
        "experience", "education", "skills", "languages", "custom_sections",
    ):
        collect(profile.get(field), f"/{field}")
    return catalog


def build_evidence_catalog(
    elements: list[dict],
    candidate_notes: str = "",
    cv_data: dict | None = None,
) -> dict[str, str]:
    """Map stable evidence identifiers to exact candidate-provided source text.

    Model-generated paraphrases are unsuitable as identifiers because a valid
    bilingual match rarely repeats the complete Polish CV sentence verbatim.
    Canvas IDs, numbered note fragments, and ``cv:/path`` references to authored
    normalized profile fields let the model express semantic relevance while the
    server verifies that every cited source exists. Input data is not mutated;
    invalid profiles raise the same validation errors as ``normalize_cv_data``.
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
    if isinstance(cv_data, dict):
        catalog.update(_profile_evidence(normalize_cv_data(cv_data)))
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


def _feedback_text(value: object) -> str:
    return _compact(value) if isinstance(value, str) else ""


def _comparison_key(value: str) -> str:
    """Ignore surface formatting without conflating different technical terms.

    Remove sentence-ending punctuation and spaces around commas/semicolons,
    while preserving semantic punctuation in C++, C#, .NET, and AND/OR clauses.
    This deliberately does not infer synonyms or equivalent requirements.
    """
    key = re.sub(r"\s*([,;:!?])\s*", r"\1", _compact(value).casefold())
    return key.rstrip(".!?,;:").rstrip()


def _normalise_requirements(
    value: object, evidence_catalog: dict[str, str]
) -> tuple[list[dict], dict[str, str]]:
    """Return distinct criteria and a safe mapping of model IDs to canonical IDs.

    The first occurrence owns the status and weight for an exactly repeated
    criterion, so repetition cannot add scoring weight. An ID reused for
    different texts is ambiguous: its feedback is discarded instead of being
    attached to whichever criterion happens to be last in a dictionary.
    """
    if not isinstance(value, list):
        return [], {}
    unique_items: dict[str, dict] = {}
    id_targets: dict[str, set[str]] = {}
    for item in value:
        if not isinstance(item, dict):
            continue
        key = _comparison_key(_feedback_text(item.get("text")))
        if not key:
            continue
        unique_items.setdefault(key, item)
        original_id = _feedback_text(item.get("id"))
        if original_id:
            id_targets.setdefault(original_id, set()).add(key)

    requirements: list[dict] = []
    canonical_ids: dict[str, str] = {}
    reserved_ids = set(id_targets)
    for index, (key, item) in enumerate(list(unique_items.items())[:15]):
        text = _feedback_text(item.get("text"))
        original_id = _feedback_text(item.get("id"))
        if original_id and len(id_targets[original_id]) == 1:
            canonical_id = original_id
        else:
            suffix = index + 1
            canonical_id = f"req-{suffix}"
            while canonical_id in reserved_ids:
                suffix += 1
                canonical_id = f"req-{suffix}"
        reserved_ids.add(canonical_id)
        canonical_ids[key] = canonical_id
        kind = str(item.get("kind") or "required")
        if kind not in {"required", "preferred", "responsibility"}:
            kind = "required"
        status = str(item.get("match_status") or "missing")
        if status not in {"matched", "partial", "missing"}:
            status = "missing"
        evidence_refs = _valid_evidence_refs(item.get("evidence_refs"), evidence_catalog)
        # Structured output constrains the label but cannot prove the claim.
        # Positive matches therefore count only when they reference a real CV
        # element, profile field, or candidate note. Interpretation remains with the
        # model, while source existence is deterministic and server-enforced.
        if status != "missing" and not evidence_refs:
            status = "missing"
        if status == "missing":
            evidence_refs = []
        default_weight = {"required": 3, "preferred": 2, "responsibility": 1}[kind]
        try:
            weight = max(1, min(3, int(item.get("weight", default_weight))))
        except (TypeError, ValueError, OverflowError):
            weight = default_weight
        requirements.append({
            "id": canonical_id,
            "text": text,
            "kind": kind,
            "weight": weight,
            "match_status": status,
            "evidence": _evidence_excerpt(evidence_refs, evidence_catalog),
            "evidence_refs": evidence_refs,
        })
    aliases = {
        original_id: canonical_ids[next(iter(targets))]
        for original_id, targets in id_targets.items()
        if len(targets) == 1 and next(iter(targets)) in canonical_ids
    }
    return requirements, aliases


def _requirement_score(requirements: list[dict]) -> float:
    total = sum(item["weight"] for item in requirements)
    if not total:
        return 0.0
    match_value = {"matched": 1.0, "partial": 0.5, "missing": 0.0}
    earned = sum(item["weight"] * match_value[item["match_status"]] for item in requirements)
    return round(4 * earned / total, 1)


def _clamp_score(value: object, maximum: float) -> float:
    try:
        number = float(value)
        return round(max(0.0, min(maximum, number)), 1) if math.isfinite(number) else 0.0
    except (TypeError, ValueError, OverflowError):
        return 0.0


def _normalise_feedback(
    value: object,
    requirements: list[dict],
    aliases: dict[str, str],
    *,
    maximum: int,
    seen_descriptions: set[str],
) -> list[dict]:
    """Keep actionable, unique feedback linked to a real unresolved criterion.

    Heavier criteria are considered first. Description keys are shared between
    priorities and evidence gaps, preventing the same recommendation from being
    repeated across panels. Each panel may still explain a different aspect of
    one criterion once, such as an editorial action and the evidence it needs.
    """
    if not isinstance(value, list):
        return []
    by_id = {item["id"]: item for item in requirements}
    candidates = []
    for item in value:
        if not isinstance(item, dict):
            continue
        requirement_id = aliases.get(_feedback_text(item.get("requirement_id")))
        requirement = by_id.get(requirement_id)
        title = _feedback_text(item.get("title"))
        description = _feedback_text(item.get("description"))
        if (
            requirement is not None
            and requirement["match_status"] in {"partial", "missing"}
            and _comparison_key(title)
            and _comparison_key(description)
        ):
            candidates.append({"requirement_id": requirement_id, "title": title, "description": description})
    candidates.sort(key=lambda item: -by_id[item["requirement_id"]]["weight"])

    result: list[dict] = []
    seen_requirements: set[str] = set()
    for item in candidates:
        key = _comparison_key(item["description"])
        if item["requirement_id"] in seen_requirements or key in seen_descriptions:
            continue
        seen_requirements.add(item["requirement_id"])
        seen_descriptions.add(key)
        result.append(item)
        if len(result) == maximum:
            break
    return result


def _normalise_text_list(value: object, *, maximum: int, seen: set[str]) -> list[str]:
    """Reject malformed collections and remove empty or repeated model prose."""
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        text = _feedback_text(item)
        key = _comparison_key(text)
        if key and key not in seen:
            seen.add(key)
            result.append(text)
            if len(result) == maximum:
                break
    return result


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
    evidence_catalog = build_evidence_catalog(elements, candidate_notes, cv_data)
    requirements, requirement_aliases = _normalise_requirements(raw.get("requirements"), evidence_catalog)
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

    seen_descriptions: set[str] = set()
    priorities = _normalise_feedback(
        raw.get("priorities"), requirements, requirement_aliases,
        maximum=5, seen_descriptions=seen_descriptions,
    )
    evidence_gaps = _normalise_feedback(
        raw.get("evidence_gaps"), requirements, requirement_aliases,
        maximum=10, seen_descriptions=seen_descriptions,
    )
    if rejected:
        evidence_gaps.insert(0, {
            "requirement_id": "grounding",
            "title": "Pominięto niepotwierdzone zmiany",
            "description": "Nie zastosowano propozycji zawierających nowe fakty, liczby albo techniki bez potwierdzenia w CV lub notatkach kandydata.",
        })

    return {
        "message": _compact(raw.get("message")),
        "rating": rating,
        "tips": _normalise_text_list(raw.get("tips"), maximum=8, seen=seen_descriptions),
        "corrections": corrections,
        "categories": categories,
        "strengths": _normalise_text_list(raw.get("strengths"), maximum=5, seen=set()),
        "priorities": priorities,
        "web_sources": [],
        "job_requirements": requirements,
        "evidence_gaps": evidence_gaps[:10],
        "updated_cv_data": updated_profile,
    }
