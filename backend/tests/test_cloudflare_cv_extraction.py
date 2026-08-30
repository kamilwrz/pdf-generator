"""Text-first Cloudflare CV extraction without live network calls."""
from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import fitz

from app.services import ai_service
from app.services.cv_generator import generate_resume


def _pdf_bytes(text: str = "") -> bytes:
    """Build a one-page native-text or image-only test PDF."""
    document = fitz.open()
    page = document.new_page()
    if text:
        page.insert_textbox(fitz.Rect(36, 36, 560, 800), text, fontsize=11)
    data = document.tobytes()
    document.close()
    return data


def _two_column_cv_pdf_bytes() -> bytes:
    """Build a CV whose vertically overlapping columns must remain separate."""
    document = fitz.open()
    page = document.new_page()
    left_lines = [
        (70, "PODSUMOWANIE ZAWODOWE"),
        (88, "Dokladne podsumowanie ze zrodlowego CV."),
        (130, "SPECJALIZACJE"),
        (148, "- Instalacje wodne"),
        (164, "- Interpretacja planu"),
        (210, "REFERENCJE"),
        (228, "Hydraulik Cezary Hrynski"),
        (244, "Firma Pipe"),
        (260, "Email: cezary@example.com"),
        (292, "Manager Julia Oleszko"),
        (308, "Firma Tensor"),
        (324, "Email: julia@example.com"),
    ]
    right_lines = [
        (50, "KAROL DABEK"),
        (70, "HYDRAULIK"),
        (88, "HISTORIA ZATRUDNIENIA"),
        (106, "HYDRAULIK I MONTER"),
        (122, "Firma Tensor | 2015 - obecnie"),
        (148, "- Naprawa systemow hydraulicznych"),
        (180, "WYKSZTALCENIE"),
        (198, "CENTRUM EDUKACYJNE NOVA"),
        (216, "Kurs zawodowy | 2009 - 2011"),
    ]
    for y, text in left_lines:
        page.insert_text((36, y), text, fontsize=10)
    for y, text in right_lines:
        page.insert_text((300, y), text, fontsize=10)
    data = document.tobytes()
    document.close()
    return data


def _response(payload: dict | str):
    """Return the minimal OpenAI-compatible response consumed by the service."""
    content = payload if isinstance(payload, str) else json.dumps(payload)
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content),
                finish_reason="stop",
            )
        ],
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
        self.assertEqual(
            request["max_tokens"],
            ai_service.CV_EXTRACT_MAX_COMPLETION_TOKENS,
        )
        self.assertEqual(request["response_format"], {"type": "json_object"})
        self.assertNotIn("max_completion_tokens", request)
        self.assertNotIn("reasoning_effort", request)
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
        self.assertEqual(
            request["max_completion_tokens"],
            ai_service.CV_EXTRACT_MAX_COMPLETION_TOKENS,
        )
        self.assertEqual(request["reasoning_effort"], "low")
        self.assertNotIn("response_format", request)
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

    def test_markdown_fenced_json_is_accepted_without_cloudflare_json_mode(self):
        client = self._client('```json\n{"name":"Ewa Testowa"}\n```')
        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, _usage = ai_service.extract_cv_data(
                _pdf_bytes("Ewa Testowa Python Developer " * 10)
            )

        self.assertEqual(cv_data["name"], "Ewa Testowa")

    def test_typed_text_parts_are_combined(self):
        client = MagicMock()
        response = _response({"name": "Piotr Testowy"})
        response.choices[0].message.content = [
            {"type": "text", "text": '{"name":'},
            SimpleNamespace(type="text", text='"Piotr Testowy"}'),
        ]
        client.chat.completions.create.return_value = response

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, _usage = ai_service.extract_cv_data(
                _pdf_bytes("Piotr Testowy Backend Developer " * 10)
            )

        self.assertEqual(cv_data["name"], "Piotr Testowy")

    def test_openai_rollback_keeps_json_mode(self):
        client = self._client({"name": "Jan Kowalski"})
        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CV_EXTRACT_OPENAI_MODEL, "openai"),
        ):
            ai_service.extract_cv_data(_pdf_bytes("Jan Kowalski Developer " * 10))

        request = client.chat.completions.create.call_args.kwargs
        self.assertEqual(request["response_format"], {"type": "json_object"})
        self.assertEqual(
            request["max_tokens"],
            ai_service.CV_EXTRACT_MAX_COMPLETION_TOKENS,
        )
        self.assertNotIn("max_completion_tokens", request)
        self.assertNotIn("reasoning_effort", request)

    def test_empty_reasoning_only_response_remains_a_safe_retryable_error(self):
        client = MagicMock()
        client.chat.completions.create.return_value = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content="", reasoning="internal"),
                    finish_reason="length",
                )
            ],
            usage=SimpleNamespace(completion_tokens=8_000),
        )

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            with self.assertLogs("cv_extraction", level="WARNING") as logs:
                with self.assertRaises(ai_service.CvExtractionError) as context:
                    ai_service.extract_cv_data(
                        _pdf_bytes("Jan Kowalski Developer " * 10)
                    )

        self.assertEqual(context.exception.code, "extract_provider_empty_response")
        self.assertTrue(context.exception.retryable)
        self.assertIn("finish_reason=length", logs.output[0])
        self.assertNotIn("internal", logs.output[0])

    def test_empty_reasoning_text_response_retries_once_with_json_mode_fallback(self):
        """Recover a legacy Gemma override without asking for another upload."""
        client = MagicMock()
        empty_response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content="", reasoning="internal"),
                    finish_reason="length",
                )
            ],
            usage=SimpleNamespace(
                prompt_tokens=2_000,
                completion_tokens=8_000,
                total_tokens=10_000,
            ),
        )
        client.chat.completions.create.side_effect = [
            empty_response,
            _response({"name": "Jan Kowalski", "skills": ["Python"]}),
        ]
        primary_model = "@cf/google/gemma-4-26b-a4b-it"

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, primary_model, "cloudflare"),
        ):
            with self.assertLogs("cv_extraction", level="WARNING") as logs:
                cv_data, usage = ai_service.extract_cv_data(
                    _pdf_bytes("Jan Kowalski Python Developer " * 20)
                )

        self.assertEqual(cv_data["name"], "Jan Kowalski")
        self.assertEqual(client.chat.completions.create.call_count, 2)
        primary_request = client.chat.completions.create.call_args_list[0].kwargs
        fallback_request = client.chat.completions.create.call_args_list[1].kwargs
        self.assertEqual(primary_request["model"], primary_model)
        self.assertEqual(primary_request["reasoning_effort"], "low")
        self.assertEqual(
            fallback_request["model"],
            ai_service.CLOUDFLARE_TEXT_FALLBACK_MODEL,
        )
        self.assertEqual(
            fallback_request["response_format"],
            {"type": "json_object"},
        )
        self.assertNotIn("reasoning_effort", fallback_request)
        self.assertTrue(usage["fallback_used"])
        self.assertEqual(
            [row["model"] for row in usage["model_attempts"]],
            [primary_model, ai_service.CLOUDFLARE_TEXT_FALLBACK_MODEL],
        )
        self.assertEqual(usage["prompt_tokens"], 3_000)
        self.assertEqual(usage["completion_tokens"], 8_500)
        self.assertEqual(usage["total_tokens"], 11_500)
        self.assertTrue(any("fallback_model=" in line for line in logs.output))
        self.assertFalse(any("internal" in line for line in logs.output))

    def test_two_column_source_grounds_summary_specialisations_and_references(self):
        """Source geometry must correct plausible but unsupported model JSON."""
        client = self._client({
            "name": "Karol Dabek",
            "title": "Hydraulik",
            "summary": "PODSUMOWANIE ZAWODOWE HYDRAULIK",
            "skills": ["OBSLUGA KOMPUTERA"],
            "experience": [{
                "title": "Hydraulik",
                "company": "Firma Tensor",
                "period": "2015 - obecnie",
                "bullets": ["Naprawa instalacji"],
            }],
            "extra_sections": [],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(_two_column_cv_pdf_bytes())

        request = client.chat.completions.create.call_args.kwargs
        prompt = request["messages"][1]["content"][0]["text"]
        self.assertIn("<SOURCE_SECTIONS>", prompt)
        self.assertIn("[KOLUMNA 1;", prompt)
        self.assertIn("[KOLUMNA 2;", prompt)
        self.assertNotIn("OBSŁUGA KOMPUTERA", prompt)
        self.assertNotIn("OBSLUGA KOMPUTERA", prompt)
        self.assertEqual(
            cv_data["summary"],
            "Dokladne podsumowanie ze zrodlowego CV.",
        )
        self.assertEqual(
            cv_data["skills"],
            ["Instalacje wodne", "Interpretacja planu"],
        )
        self.assertEqual(cv_data["labels"]["skills"], "SPECJALIZACJE")
        references = next(
            section
            for section in cv_data["extra_sections"]
            if section["kind"] == "references"
        )
        self.assertEqual(len(references["items"]), 2)
        self.assertEqual(references["items"][0]["title"], "Hydraulik Cezary Hrynski")
        self.assertEqual(references["items"][1]["title"], "Manager Julia Oleszko")
        self.assertEqual(
            usage["source_grounded_fields"],
            ["summary", "skills", "references"],
        )
        rendered_content = "\n".join(
            str(element.get("content") or "")
            for element in generate_resume("atrium", cv_data)
        )
        self.assertIn("SPECJALIZACJE", rendered_content)
        self.assertIn("REFERENCJE", rendered_content)
        self.assertIn("Hydraulik Cezary Hrynski", rendered_content)
        self.assertIn("Manager Julia Oleszko", rendered_content)

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
