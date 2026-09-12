"""Request-local UI language; independent of CV language and persisted evidence."""
from __future__ import annotations

from contextvars import ContextVar
import json
from pathlib import Path

ui_language: ContextVar[str] = ContextVar("ui_language", default="pl")
_MESSAGES = json.loads((Path(__file__).with_name("locales") / "messages.json").read_text(encoding="utf-8"))


def resolve_language(header: str = "") -> str:
    """Pick a supported language by HTTP preference; unrecognised input keeps PL."""
    preferences = []
    for order, item in enumerate(header.split(",")):
        parts = item.strip().split(";")
        language = parts[0].strip().lower().split("-")[0]
        quality = 1.0
        for parameter in parts[1:]:
            if parameter.strip().startswith("q="):
                try:
                    quality = float(parameter.strip()[2:])
                except ValueError:
                    quality = 0.0
        if language in {"pl", "en"} and 0 < quality <= 1:
            preferences.append((-quality, order, language))
    return min(preferences)[2] if preferences else "pl"


class LocalisedMessage(str):
    """String-compatible message carrying its public translation key."""
    def __new__(cls, value: str, key: str, params: dict):
        instance = super().__new__(cls, value)
        instance.message_key = key
        instance.params = params
        return instance


def message(key: str, **params) -> LocalisedMessage:
    """Resolve a trusted message key without interpreting any user-authored text."""
    text = _MESSAGES[key][ui_language.get()]
    return LocalisedMessage(text.format(**params), key, params)


def ui_language_policy() -> str:
    """Final provider policy overrides legacy Polish-only guidance, not CV facts."""
    language = "English (British spelling)" if ui_language.get() == "en" else "Polish"
    return (
        "\nFinal application language policy: write interface-facing explanations, "
        "questions, reasons, tips, priorities, status descriptions and assessment labels in "
        f"{language}. This overrides any earlier instruction fixing those fields to Polish. "
        "Keep CV content/corrections in the requested or detected CV language. "
        "Keep quoted source text, before values, evidence, names, identifiers and user answers literal. "
        "Never translate schema keys, enum values or identifiers."
    )


class UiLanguageMiddleware:
    """Bind locale across async work and copied thread-pool contexts, then reset it."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        language = resolve_language(headers.get(b"accept-language", b"").decode("latin-1"))
        token = ui_language.set(language)

        async def send_localised(event):
            if event["type"] == "http.response.start":
                response_headers = list(event.get("headers", []))
                response_headers.append((b"content-language", language.encode("ascii")))
                response_headers.append((b"vary", b"Accept-Language"))
                event = {**event, "headers": response_headers}
            await send(event)

        try:
            await self.app(scope, receive, send_localised)
        finally:
            ui_language.reset(token)
