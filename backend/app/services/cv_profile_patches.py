"""Reconstruct profile and canvas changes from bounded field replacements.

This module never calls a model or writes persistent state. Bindings are verified
against the submitted profile and exact visible text; ambiguous layouts select
the existing full-profile workflow before inference. Geometry is never changed.
"""
from __future__ import annotations

from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass
import re

from app.services.scoped_ai import preserves_protected_tokens
from app.services.cv_data import normalize_cv_data


PROFILE_CHANGES_SCHEMA = {
    "name": "cv_profile_changes_v1", "strict": True,
    "schema": {
        "type": "object", "additionalProperties": False,
        "properties": {
            "message": {"type": "string"},
            "tips": {"type": "array", "items": {"type": "string"}, "maxItems": 3},
            "changes": {"type": "array", "items": {
                "type": "object", "additionalProperties": False,
                "properties": {"field_id": {"type": "string"}, "value": {"type": "string"}},
                "required": ["field_id", "value"],
            }},
        },
        "required": ["message", "tips", "changes"],
    },
}

# Remove only presentation markers on elements explicitly marked as bullet lists.
# A minus inside a sentence or a numeric sign is not a list marker.
_MARKER = re.compile(r"^[ \t]*(?:[•*–—-][ \t]+)")
# This conservative lexical guard supplements prompts; it is not a semantic
# verifier. Equivalent wording using a different negation can be rejected.
_NEGATIONS = re.compile(r"\b(?:nie|not|never|no|without|nicht|kein\w*|ohne|pas|jamais|sans|"
                        r"sin|nunca|не|без|non|senza|niet|geen|zonder)\b|n['’]t\b", re.IGNORECASE)


def preserves_field_evidence(before: str, after: str) -> bool:
    """Keep the lexical evidence guard while allowing known Polish declension.

    Python/Pythonie/Pythonem/Pythona name the same tool, so a grammar correction
    must not be rejected as deleting a technology. This finite equivalence is
    not fuzzy matching or a general stemmer and cannot equate different tools.
    """
    def canonical(text):
        return re.sub(r"\bPython(?:ie|em|a)\b", "Python", text, flags=re.IGNORECASE)
    return preserves_protected_tokens(canonical(before), canonical(after))


def _leaves(value, path=()):
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _leaves(child, (*path, index))
    elif isinstance(value, dict):
        for key, child in value.items():
            yield from _leaves(child, (*path, key))


def _editable(path):
    """Allow prose/skill bodies, never identity, dates, headings or record keys."""
    if path == ("summary",):
        return True
    if len(path) == 4 and path[0] == "experience" and path[2] == "bullets":
        return True
    if len(path) == 3 and path[0] == "education" and path[2] == "description":
        return True
    if path and path[0] == "skills":
        return (len(path) == 2 and type(path[1]) is int) or (
            len(path) == 4 and path[2] == "items" and type(path[3]) is int)
    if path and path[0] in {"extra_sections", "custom_sections"}:
        return (len(path) == 4 and path[2] == "items" and type(path[3]) is int) or (
            len(path) == 6 and path[2] == "items" and path[4] == "bullets")
    return False


def _binding_paths(element, leaves):
    bindings = element.get("cvDataBindings")
    if bindings is None or bindings == []:
        return None
    if not isinstance(bindings, list):
        return False
    paths = []
    for binding in bindings:
        path = binding.get("path") if isinstance(binding, dict) else None
        if not isinstance(path, list) or not path or any(type(key) not in {str, int} for key in path):
            return False
        if any(type(key) is int and key < 0 for key in path):
            return False
        path = tuple(path)
        if path not in leaves or path in paths:
            return False
        paths.append(path)
    return paths


@dataclass(frozen=True)
class TextBinding:
    """An exact, non-overlapping source substring backed by one profile leaf."""
    path: tuple
    start: int
    end: int


@dataclass
class ProfileCatalog:
    """Request-local mapping used to rebuild both public result representations."""
    profile: dict
    fields: dict[str, tuple]
    values: dict[tuple, str]
    elements: dict[str, str]
    bindings: dict[str, list[TextBinding]]

    def targets(self):
        """Expose allowed IDs and semantic paths; values already exist in profile."""
        return [{"field_id": field_id, "path": list(path)} for field_id, path in self.fields.items()]

    def apply(self, raw: dict, *, action: str) -> dict:
        """Validate the entire result before returning isolated profile/canvas copies.

        No partial result is returned on failure. Source offsets are applied
        backwards so changed leaves cannot shift each other's positions. Only
        existing string leaves can change, preserving records and array order.
        """
        if not isinstance(raw, dict) or set(raw) != {"message", "tips", "changes"}:
            raise ValueError("Invalid profile change envelope")
        if not isinstance(raw["message"], str) or not isinstance(raw["tips"], list) or (
            len(raw["tips"]) > 3 or any(not isinstance(tip, str) for tip in raw["tips"])
        ) or not isinstance(raw["changes"], list):
            raise ValueError("Invalid profile change fields")
        changes, seen = {}, set()
        for change in raw["changes"]:
            if not isinstance(change, dict) or set(change) != {"field_id", "value"}:
                raise ValueError("Invalid field replacement")
            field_id, value = change["field_id"], change["value"]
            if not isinstance(field_id, str) or field_id not in self.fields or field_id in seen:
                raise ValueError("Unknown or repeated field ID")
            seen.add(field_id)
            if not isinstance(value, str) or not value.strip():
                raise ValueError("Empty or non-text replacement")
            path = self.fields[field_id]
            before, value = self.values[path], value.strip()
            if value == before:
                continue
            if not preserves_field_evidence(before, value):
                raise ValueError("Changed protected evidence")
            if set(m.group().casefold() for m in _NEGATIONS.finditer(before)) != set(
                m.group().casefold() for m in _NEGATIONS.finditer(value)
            ):
                raise ValueError("Changed negation")
            if re.findall(r"\[[^\]]+\]", before) != re.findall(r"\[[^\]]+\]", value):
                raise ValueError("Changed evidence placeholder")
            if len(before.splitlines()) != len(value.splitlines()):
                raise ValueError("Changed paragraph structure")
            if action == "shorten" and len(value) > len(before):
                raise ValueError("Shortening increased field length")
            if path[0] == "skills" and any(value.count(mark) > before.count(mark) for mark in "\n\r•;·"):
                raise ValueError("One skill became multiple items")
            changes[path] = value

        updated = deepcopy(self.profile)
        for path, value in changes.items():
            parent = updated
            for key in path[:-1]:
                parent = parent[key]
            parent[path[-1]] = value
        if normalize_cv_data(updated) != updated:
            raise ValueError("Replacement changed normalized profile structure")
        corrections, rendered_paths = [], set()
        for element_id, bindings in self.bindings.items():
            content = self.elements[element_id]
            for binding in sorted(bindings, key=lambda item: item.start, reverse=True):
                if binding.path in changes:
                    content = content[:binding.start] + changes[binding.path] + content[binding.end:]
                    rendered_paths.add(binding.path)
            if content != self.elements[element_id]:
                corrections.append({"element_id": element_id, "content": content})
        if rendered_paths != set(changes):
            raise ValueError("Profile change has no visible correction")
        return {"message": raw["message"], "tips": raw["tips"], "corrections": corrections,
                "updated_cv_data": updated, "web_sources": []}


def build_profile_catalog(profile: dict, elements: list[dict]) -> ProfileCatalog | None:
    """Bind exact prose to the canvas, or select full-profile inference up front.

    Explicit paths must name an existing leaf and match its visible source text.
    Without a binding, editable text must match exactly one profile leaf.
    Unsupported merged metadata, freeform fields, empty targets and ambiguous
    editable duplicates fall back rather than disappearing from the request.
    """
    leaves = dict(_leaves(profile))

    def editable(path):
        # Language/certificate entries are factual credentials even when their
        # normalized shape resembles an ordinary custom prose section.
        readonly_section = (path[0] == "extra_sections" and len(path) > 1 and
                            profile["extra_sections"][path[1]].get("kind") in {"languages", "certifications"})
        return _editable(path) and not readonly_section

    by_text = defaultdict(list)
    for path, value in leaves.items():
        if value.strip():
            by_text[value].append(path)
    text_elements = [element for element in elements if element.get("category") in {"text", "textarea"}]
    blocked = set()
    for element in text_elements:
        if element.get("locked") or element.get("fixedToPage"):
            explicit = _binding_paths(element, leaves)
            if explicit:
                blocked.update(explicit)
            content = element.get("content", "")
            if isinstance(content, str):
                blocked.update(by_text.get(content.strip(), []))
                for line in content.splitlines():
                    blocked.update(by_text.get(_MARKER.sub("", line).strip(), []))

    fields, bound_elements, source_elements = {}, {}, {}
    seen_ids = set()
    for element in text_elements:
        element_id, content = element.get("element_id"), element.get("content", "")
        if not isinstance(element_id, str) or not element_id or element_id in seen_ids or not isinstance(content, str):
            return None
        seen_ids.add(element_id)
        if element.get("locked") or element.get("fixedToPage"):
            continue
        if not content.strip():
            # Empty text anchors are excluded by the existing provider projection;
            # empty textareas can be intentional targets and must use legacy mode.
            if element.get("category") == "textarea":
                return None
            continue
        explicit = _binding_paths(element, leaves)
        if explicit is False:
            return None
        whole = content.strip()
        candidates = explicit if explicit and len(explicit) == 1 else by_text.get(whole, [])
        if len(candidates) == 1 and leaves[candidates[0]] == whole:
            start = len(content) - len(content.lstrip())
            pieces = [(start, start + len(whole), whole)]
        else:
            pieces, offset = [], 0
            for line in content.splitlines(keepends=True):
                body = line.rstrip("\r\n")
                marker = _MARKER.match(body) if element.get("bulletList") else None
                prefix = marker.end() if marker else 0
                prefix += len(body[prefix:]) - len(body[prefix:].lstrip())
                value = body[prefix:].rstrip()
                if value:
                    pieces.append((offset + prefix, offset + prefix + len(value), value))
                offset += len(line)
        if explicit and len(explicit) != len(pieces):
            return None
        bindings = []
        for index, (start, end, value) in enumerate(pieces):
            paths = [explicit[index]] if explicit else by_text.get(value, [])
            # Aliased contact fields and repeated headings need no write target.
            # Any editable candidate still requires an unambiguous exact match.
            if paths and all(not editable(path) and leaves[path] == value for path in paths):
                continue
            if len(paths) != 1 or leaves[paths[0]] != value:
                return None
            path = paths[0]
            if not editable(path):
                continue
            if path in blocked:
                return None
            bindings.append(TextBinding(path, start, end))
            if path not in fields.values():
                fields[f"f{len(fields)}"] = path
        if bindings:
            bound_elements[element_id] = bindings
            source_elements[element_id] = content
    if not fields:
        return None
    return ProfileCatalog(deepcopy(profile), fields, leaves, source_elements, bound_elements)
