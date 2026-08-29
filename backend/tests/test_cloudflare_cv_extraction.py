"""Text-first Cloudflare CV extraction without live network calls."""
from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import fitz

from app.services import ai_service


def _pdf_bytes(text: str = "") -> bytes:
    """Build a one-page native-text or image-only test PDF."""
    document = fitz.open()
    page = document.new_page()
    if text:
        page.insert_textbox(fitz.Rect(36, 36, 560, 800), text, fontsize=11)
    data = document.tobytes()
    document.close()
    return data


def _response(payload: dict | str):
    """Return the minimal OpenAI-compatible response consumed by the service."""
    content = payload if isinstance(payload, str) else json.dumps(payload)
    return SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content=content))],
        usage=SimpleNamespace(
            prompt_tokens=1_000,
            completion_tokens=500,
            total_tokens=1_500,
        ),
    )


class CloudflareCvExtractionTests(unittest.TestCase):
    def _client(self, payload: dict | str) -> MagicMock:
        client = MagicMock()
        client.chat.completions.create.return_value = _response(payload)
        return client

    def test_native_text_uses_text_model_without_page_images(self):
        source = (
            "Jan Kowalski\nPython Developer\njan@example.com\n"
            "Doświadczenie: Example SA 2022-2026. Python, FastAPI, PostgreSQL. "
            "Budowa i utrzymanie aplikacji internetowych oraz testów automatycznych."
        )
        client = self._client({"name": "Jan Kowalski", "skills": ["Python"]})

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ) as settings:
            cv_data, usage = ai_service.extract_cv_data(_pdf_bytes(source))

        settings.assert_called_once_with("text")
        request = client.chat.completions.create.call_args.kwargs
        user_content = request["messages"][1]["content"]
        self.assertFalse(any(item["type"] == "image_url" for item in user_content))
        self.assertIn("Jan Kowalski", user_content[0]["text"])
        self.assertEqual(cv_data["name"], "Jan Kowalski")
        self.assertEqual(usage["provider"], "cloudflare")
        self.assertEqual(usage["extraction_mode"], "text")
        self.assertEqual(usage["credits_charged"], 0)

    def test_page_without_text_uses_vision_model_and_png_data_url(self):
        client = self._client({"name": "Anna Nowak"})

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_VISION_MODEL, "cloudflare"),
        ) as settings:
            _cv_data, usage = ai_service.extract_cv_data(_pdf_bytes())

        settings.assert_called_once_with("vision")
        request = client.chat.completions.create.call_args.kwargs
        user_content = request["messages"][1]["content"]
        images = [item for item in user_content if item["type"] == "image_url"]
        self.assertEqual(len(images), 1)
        self.assertTrue(images[0]["image_url"]["url"].startswith("data:image/png;base64,"))
        self.assertEqual(usage["extraction_mode"], "vision")

    def test_invalid_model_json_is_a_safe_validation_error(self):
        client = self._client("not-json")
        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            with self.assertRaises(ai_service.CvExtractionError) as context:
                ai_service.extract_cv_data(_pdf_bytes("Jan Kowalski " * 20))

        self.assertEqual(context.exception.code, "extract_provider_invalid_response")
        self.assertEqual(context.exception.status_code, 422)

    def test_missing_cloudflare_credentials_fails_before_network(self):
        with (
            patch.object(ai_service, "CV_EXTRACT_PROVIDER", "cloudflare"),
            patch.object(ai_service, "CLOUDFLARE_ACCOUNT_ID", ""),
            patch.object(ai_service, "CLOUDFLARE_API_TOKEN", ""),
        ):
            with self.assertRaises(ai_service.CvExtractionError) as context:
                ai_service._provider_settings("text")

        self.assertEqual(context.exception.code, "cloudflare_not_configured")
        self.assertEqual(context.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
