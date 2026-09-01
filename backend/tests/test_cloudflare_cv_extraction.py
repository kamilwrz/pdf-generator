"""Text-first Cloudflare CV extraction without live network calls."""
from __future__ import annotations

import json
import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import fitz
import httpx
from openai import RateLimitError
from reportlab.pdfgen import canvas

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


def _two_column_wrapped_cv_pdf_bytes() -> bytes:
    """Build wrapped prose and bold nested skills in a two-column layout."""
    document = fitz.open()
    page = document.new_page()
    left_lines = [
        (70, "PROFESSIONAL SUMMARY", True),
        (90, "Full professional summary continues", False),
        (106, "across every wrapped line and human-", False),
        (122, "centered topic in the source CV.", False),
        (138, "education. I possess practical knowledge.", False),
        (176, "EDUCATION", True),
        (196, "Example University", False),
    ]
    right_lines = [
        (70, "WORK EXPERIENCE", True),
        (90, "Example Employer", False),
        (106, "2022 - 2026", False),
        (126, "- Delivered training programs.", False),
        (160, "UMIEJETNOSCI", True),
        (180, "Soft Skills", True),
        (198, "Critical thinking.  ·  Communicativeness, interpersonal", False),
        (214, "skills, and empathy.  ·  Communication and teamwork.", False),
        (240, "Research and IT", True),
        (258, "AI research.  ·  Data analysis", False),
        (274, "and business modeling.", False),
    ]
    for x, lines in ((36, left_lines), (300, right_lines)):
        for y, text, bold in lines:
            page.insert_text(
                (x, y),
                text,
                fontsize=10,
                fontname="hebo" if bold else "helv",
            )
    data = document.tobytes()
    document.close()
    return data


def _pipe_delimited_experience_city_pdf_bytes() -> bytes:
    """Build native CV rows that expose a distinct city for each employer."""
    document = fitz.open()
    page = document.new_page()
    lines = [
        (36, 44, "JAN KOWALSKI"),
        (36, 66, "jan@example.com"),
        (36, 82, "+48 500 000 000"),
        (36, 98, "Warszawa, Polska"),
        (36, 140, "DOSWIADCZENIE ZAWODOWE"),
        (36, 160, "2022 - obecnie"),
        (36, 176, "Senior Developer | Example SA | Warszawa"),
        (36, 210, "2019 - 2022"),
        (36, 226, "Developer | Remote Labs | Amsterdam"),
    ]
    for x, y, text in lines:
        page.insert_text((x, y), text, fontsize=10)
    data = document.tobytes()
    document.close()
    return data


def _plain_nested_skills_cv_pdf_bytes() -> bytes:
    """Build skill categories whose PDF font flags do not preserve hierarchy."""
    document = fitz.open()
    page = document.new_page()
    lines = [
        (60, "UMIEJETNOSCI", True),
        (82, "Bezpieczenstwo", False),
        (98, "- analiza SIEM/logow", False),
        (114, "- triage alertow i raportowanie", False),
        (130, "incydentow", False),
        (146, "- Wireshark", False),
        (162, "Przemysl / OT", False),
        (178, "- oprogramowanie PLC", False),
        (194, "- systemy wbudowane", False),
        (210, "Programowanie i systemy", False),
        (226, "- Python", False),
        (242, "- wizja komputerowa (OpenCV,", False),
        (258, "YOLO)", False),
        (274, "- integracja API", False),
        (290, "Jezyki obce", False),
        (306, "- angielski - B2 pisemny/techniczny,", False),
        (322, "B1+ mowiony", False),
        (338, "- rosyjski i ukrainski - jezyki ojczyste", False),
    ]
    for y, text, bold in lines:
        page.insert_text(
            (36, y),
            text,
            fontsize=10,
            fontname="hebo" if bold else "helv",
        )
    data = document.tobytes()
    document.close()
    return data


def _fragmented_skills_and_courses_pdf_bytes() -> bytes:
    """Build a two-column CV with one justified skill row split into objects."""
    document = fitz.open()
    page = document.new_page()

    for y, text in [
        (60, "PODSUMOWANIE ZAWODOWE"),
        (80, "Dokladne podsumowanie kandydatki."),
        (120, "DOSWIADCZENIE ZAWODOWE"),
        (140, "Content Creator"),
        (156, "Voliera sp. z o.o. | 03.2024 - obecnie"),
    ]:
        page.insert_text((36, y), text, fontsize=10)

    page.insert_text((330, 60), "UMIEJETNOSCI", fontsize=10, fontname="hebo")
    x = 300.0
    for fragment in ("Tworzenie", "tresci marketingowych", "i"):
        page.insert_text((x, 82), fragment, fontsize=10)
        x += fitz.get_text_length(fragment, fontname="helv", fontsize=10) + 6
    page.insert_text((300, 98), "informacyjnych;", fontsize=10)
    page.insert_text((300, 114), "Planowanie publikacji internetowych;", fontsize=10)

    page.insert_text((350, 158), "KURSY", fontsize=10, fontname="hebo")
    page.insert_text((300, 180), "Marketing internetowy w praktyce;", fontsize=10)
    page.insert_text((300, 196), "Tworzenie tresci dla mediow", fontsize=10)
    page.insert_text((300, 212), "spolecznosciowych;", fontsize=10)
    page.insert_text((300, 228), "Copywriting i komunikacja marketingowa;", fontsize=10)
    page.insert_text((300, 244), "Podstawy projektowania tresci wizualnych.", fontsize=10)

    page.insert_text((340, 286), "JEZYKI OBCE", fontsize=10, fontname="hebo")
    page.insert_text((300, 306), "Polski - jezyk ojczysty", fontsize=10)

    data = document.tobytes()
    document.close()
    return data


def _centered_right_column_cv_pdf_bytes(*, include_driving_license: bool) -> bytes:
    """Build flat right-column sections whose centred headings are indented."""
    document = fitz.open()
    page = document.new_page()

    for x, y, text in [
        (36, 42, "IWONA PRZYBYLSKA"),
        (36, 62, "CONTENT CREATOR"),
        (36, 100, "PODSUMOWANIE ZAWODOWE"),
        (36, 120, "Dokladne podsumowanie kandydatki."),
        (36, 160, "DOSWIADCZENIE ZAWODOWE"),
        (36, 180, "Content Creator | Voliera | 03.2024 - obecnie"),
        (360, 60, "UMIEJETNOSCI"),
        (300, 82, "Tworzenie tresci marketingowych i"),
        (300, 98, "informacyjnych;"),
        (300, 114, "Planowanie publikacji internetowych;"),
        (300, 130, "Organizacja pracy i zarzadzanie wieloma"),
        (300, 146, "zadaniami jednoczesnie."),
        (360, 190, "WYKSZTALCENIE"),
        (300, 212, "Uniwersytet Miejski | 2019 - 2022"),
        # The 75-point heading indentation is wider than the old lane
        # tolerance and reproduces the geometry of the reported CV7 file.
        (375, 250, "KURSY"),
        (300, 272, "Marketing internetowy w praktyce;"),
        (300, 288, "Copywriting i komunikacja marketingowa."),
        (355, 330, "JEZYKI OBCE"),
        (300, 352, "Polski - jezyk ojczysty"),
        (300, 368, "Angielski - B2"),
        (300, 384, "Niemiecki - A2"),
    ]:
        page.insert_text((x, y), text, fontsize=10)

    if include_driving_license:
        page.insert_text((365, 426), "PRAWO JAZDY", fontsize=10)
        page.insert_text((300, 448), "Kategoria B", fontsize=10)

    data = document.tobytes()
    document.close()
    return data


def _horizontal_languages_cv_pdf_bytes() -> bytes:
    """Build one Languages heading over three same-baseline grid cells."""
    document = fitz.open()
    page = document.new_page()
    page.insert_text((250, 60), "JEZYKI", fontsize=10, fontname="hebo")
    page.insert_text((250, 82), "Polski - A2", fontsize=10)
    page.insert_text((360, 82), "Angielski - C1", fontsize=10)
    page.insert_text((480, 82), "Niemiecki - B2", fontsize=10)
    data = document.tobytes()
    document.close()
    return data


def _wrapped_horizontal_languages_cv_pdf_bytes() -> bytes:
    """Reproduce Sterling's shared label row with wrapped CEFR levels."""
    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=(595, 842))
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawString(245, 782, "JEZYKI")
    pdf.setFont("Helvetica", 9.5)
    # ReportLab/PyMuPDF groups the first two columns into one text block,
    # matching CV_STERLING.pdf. Only the first level fits inline; the next two
    # wrap below their labels at the same x-coordinate.
    pdf.drawString(245, 752, "Polski - ")
    pdf.drawString(287, 752, "A2")
    pdf.drawString(320, 752, "Niemiecki -")
    pdf.drawString(320, 738, "C1")
    pdf.drawString(395, 752, "Angielski -")
    pdf.drawString(395, 738, "B2")
    pdf.save()
    return buffer.getvalue()


def _centred_languages_before_computer_skills_pdf_bytes() -> bytes:
    """Reproduce CV30's centred headings and left-aligned section bodies."""
    document = fitz.open()
    page = document.new_page()
    page.insert_text((250, 60), "JEZYKI OBCE", fontsize=10, fontname="hebo")
    page.insert_text(
        (36, 82),
        "angielski (biegly), francuski (poziom zaawansowany-B2), "
        "rosyjski (komunikatywny)",
        fontsize=10,
    )
    page.insert_text(
        (235, 112),
        "OBSLUGA KOMPUTERA",
        fontsize=10,
        fontname="hebo",
    )
    page.insert_text(
        (36, 134),
        "Biegla znajomosc MSOffice, Excel, PowerPoint.",
        fontsize=10,
    )
    data = document.tobytes()
    document.close()
    return data


def _overlapping_native_text_cv_pdf_bytes() -> bytes:
    """Build Canva-like rows whose adjacent font boxes overlap vertically.

    The baseline spacing is intentionally smaller than PyMuPDF's reported font
    box height. The rows remain visually separate, but a parser that compares
    the heading's bottom edge with the body's top edge will drop the first item.
    """
    document = fitz.open()
    page = document.new_page()
    lines = [
        (60, "UMIEJETNOSCI", True),
        (82, "Umiejetnosci twarde", True),
        (95, "Prowadzenie kampanii", False),
        (108, "internetowych", False),
        (121, "Analiza danych", False),
        (145, "Umiejetnosci miekkie", True),
        (158, "Komunikacja i prezentacja", False),
        (171, "wynikow", False),
        (195, "Jezyki obce", True),
        (208, "Angielski - C1 (certyfikat", False),
        (221, "CAE)", False),
        (234, "Niemiecki - A2", False),
        (247, "Prawo jazdy: Kategoria B", False),
        (275, "ZAINTERESOWANIA", True),
        (288, "Marketing cyfrowy", False),
    ]
    for y, text, bold in lines:
        page.insert_text(
            (36, y),
            text,
            fontsize=10,
            fontname="hebo" if bold else "helv",
        )
    data = document.tobytes()
    document.close()
    return data


def _hidden_summary_under_skills_panel_pdf_bytes() -> bytes:
    """Build a Canva-like sidebar with invisible black text on black fill."""
    document = fitz.open()
    page = document.new_page()
    page.insert_text((36, 60), "O MNIE", fontsize=10, fontname="hebo")
    page.insert_text(
        (36, 82),
        "Widoczne podsumowanie kandydatki.",
        fontsize=10,
    )

    page.draw_rect(
        fitz.Rect(20, 180, 250, 500),
        color=None,
        fill=(0, 0, 0),
        width=0,
    )
    # Canva can leave a duplicated source text box in the PDF. The copy is
    # technically extractable but visually absent because it matches the panel.
    page.insert_text(
        (36, 248),
        "Widoczne podsumowanie kandydatki.",
        fontsize=10,
        color=(0, 0, 0),
    )
    page.insert_text(
        (36, 210),
        "UMIEJETNOSCI",
        fontsize=10,
        fontname="hebo",
        color=(1, 1, 1),
    )
    page.insert_text((55, 232), "Art Direction", fontsize=10, color=(1, 1, 1))
    page.insert_text((55, 248), "Visual Storytelling", fontsize=10, color=(1, 1, 1))
    page.insert_text((55, 264), "Adobe Photoshop", fontsize=10, color=(1, 1, 1))
    page.insert_text(
        (36, 310),
        "JEZYKI",
        fontsize=10,
        fontname="hebo",
        color=(1, 1, 1),
    )
    page.insert_text((55, 332), "Angielski - C1", fontsize=10, color=(1, 1, 1))

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


def _cloudflare_rate_limit(code: int) -> RateLimitError:
    """Build the SDK error shape returned by Workers AI for HTTP 429."""
    response = httpx.Response(
        429,
        request=httpx.Request(
            "POST",
            "https://api.cloudflare.test/ai/v1/chat/completions",
        ),
    )
    return RateLimitError(
        "Workers AI rejected the request",
        response=response,
        body={"errors": [{"code": code, "message": "provider detail"}]},
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
        self.assertIn(
            '"languages":[{"name":"","level":""}]',
            user_content[0]["text"],
        )
        self.assertEqual(
            request["max_completion_tokens"],
            ai_service.CV_EXTRACT_TEXT_MAX_COMPLETION_TOKENS,
        )
        self.assertEqual(
            request["extra_body"],
            {"chat_template_kwargs": {"enable_thinking": False}},
        )
        self.assertNotIn("reasoning_effort", request)
        self.assertNotIn("max_tokens", request)
        self.assertNotIn("response_format", request)
        self.assertEqual(cv_data["name"], "Jan Kowalski")
        self.assertEqual(usage["provider"], "cloudflare")
        self.assertEqual(usage["extraction_mode"], "text")
        self.assertEqual(usage["credits_charged"], 0)

    def test_experience_cities_are_requested_and_restored_from_pipe_rows(self):
        """A model omission cannot erase cities explicitly attached to jobs."""
        client = self._client({
            "name": "Jan Kowalski",
            "experience": [
                {
                    "title": "Senior Developer",
                    "company": "Example SA",
                    "city": "",
                    "period": "2022 - obecnie",
                    "bullets": [],
                },
                {
                    "title": "Developer",
                    "company": "Remote Labs",
                    "period": "2019 - 2022",
                    "bullets": [],
                },
            ],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _pipe_delimited_experience_city_pdf_bytes()
            )

        prompt = client.chat.completions.create.call_args.kwargs[
            "messages"
        ][1]["content"][0]["text"]
        self.assertIn(
            '"experience":[{"title":"","company":"","city":"","period":"","bullets":[]}]',
            prompt,
        )
        self.assertIn("'Stanowisko | Firma | Miasto'", prompt)
        self.assertEqual(
            [entry["city"] for entry in cv_data["experience"]],
            ["Warszawa", "Amsterdam"],
        )
        self.assertEqual(usage["source_grounded_fields"], ["experience_cities"])

    def test_conflicting_pipe_rows_do_not_guess_an_experience_city(self):
        """Repeated role/employer pairs must agree before overriding the model."""
        grounded, fields = ai_service.ground_cv_data_from_source(
            {
                "experience": [{
                    "title": "Developer",
                    "company": "Example SA",
                    "city": "",
                }],
            },
            [{
                "plain_text": (
                    "Developer | Example SA | Warszawa\n"
                    "Developer | Example SA | Krakow\n"
                    "Developer | Period Co | 2020 - 2024"
                ),
                "sections": [],
            }],
        )

        self.assertEqual(grounded["experience"][0]["city"], "")
        self.assertEqual(fields, [])

    def test_gemma_thinking_can_be_opted_in_for_quality_experiments(self):
        """The opt-in restores reasoning effort and removes the disable flag."""
        with patch.object(ai_service, "CLOUDFLARE_TEXT_ENABLE_THINKING", True):
            options = ai_service._completion_request_options(
                "cloudflare",
                "@cf/google/gemma-4-26b-a4b-it",
                "text",
            )

        self.assertEqual(
            options["reasoning_effort"],
            ai_service.CLOUDFLARE_TEXT_REASONING_EFFORT,
        )
        self.assertNotIn("extra_body", options)

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
            ai_service.CV_EXTRACT_VISION_MAX_COMPLETION_TOKENS,
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
        self.assertEqual(context.exception.reservation_outcome, "consume")
        self.assertEqual(client.chat.completions.create.call_count, 2)

    def test_invalid_gemma_json_retries_once_with_json_mode_fallback(self):
        """A malformed reasoning response must not consume another import."""
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _response("not-json"),
            _response({"name": "Jan Kowalski", "skills": ["Python"]}),
        ]

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            with self.assertLogs("cv_extraction", level="WARNING") as logs:
                cv_data, usage = ai_service.extract_cv_data(
                    _pdf_bytes("Jan Kowalski Python Developer " * 20)
                )

        self.assertEqual(cv_data["name"], "Jan Kowalski")
        self.assertEqual(client.chat.completions.create.call_count, 2)
        fallback_request = client.chat.completions.create.call_args_list[1].kwargs
        self.assertEqual(
            fallback_request["model"],
            ai_service.CLOUDFLARE_TEXT_FALLBACK_MODEL,
        )
        self.assertEqual(
            fallback_request["response_format"],
            {"type": "json_object"},
        )
        self.assertTrue(usage["fallback_used"])
        self.assertTrue(any("reason=invalid_response" in line for line in logs.output))

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
            ai_service.CV_EXTRACT_JSON_MAX_COMPLETION_TOKENS,
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
        self.assertEqual(client.chat.completions.create.call_count, 2)
        self.assertIn("finish_reason=length", logs.output[0])
        self.assertNotIn("internal", logs.output[0])

    def test_empty_reasoning_text_response_retries_once_with_json_mode_fallback(self):
        """Recover the default Gemma attempt without asking for another upload."""
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
        self.assertEqual(
            primary_request["extra_body"],
            {"chat_template_kwargs": {"enable_thinking": False}},
        )
        self.assertNotIn("reasoning_effort", primary_request)
        self.assertEqual(
            primary_request["max_completion_tokens"],
            ai_service.CV_EXTRACT_TEXT_MAX_COMPLETION_TOKENS,
        )
        self.assertEqual(
            fallback_request["model"],
            ai_service.CLOUDFLARE_TEXT_FALLBACK_MODEL,
        )
        self.assertEqual(
            fallback_request["response_format"],
            {"type": "json_object"},
        )
        self.assertEqual(
            fallback_request["max_tokens"],
            ai_service.CV_EXTRACT_JSON_MAX_COMPLETION_TOKENS,
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

    def test_model_capacity_falls_back_to_llama_without_another_upload(self):
        """Cloudflare 3040 is model-specific and should not abort the import."""
        client = MagicMock()
        client.chat.completions.create.side_effect = [
            _cloudflare_rate_limit(3040),
            _response({"name": "Jan Kowalski", "skills": ["Python"]}),
        ]

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            with self.assertLogs("cv_extraction", level="WARNING") as logs:
                cv_data, usage = ai_service.extract_cv_data(
                    _pdf_bytes("Jan Kowalski Python Developer " * 20)
                )

        self.assertEqual(cv_data["name"], "Jan Kowalski")
        self.assertEqual(client.chat.completions.create.call_count, 2)
        self.assertEqual(
            client.chat.completions.create.call_args_list[1].kwargs["model"],
            ai_service.CLOUDFLARE_TEXT_FALLBACK_MODEL,
        )
        self.assertTrue(usage["fallback_used"])
        self.assertFalse(usage["model_attempts"][0]["provider_response_received"])
        self.assertTrue(usage["model_attempts"][1]["provider_response_received"])
        self.assertTrue(any("reason=provider_capacity" in line for line in logs.output))

    def test_daily_neuron_limit_is_not_retried(self):
        """Cloudflare 3036 applies to the whole account, including fallback models."""
        client = MagicMock()
        client.chat.completions.create.side_effect = _cloudflare_rate_limit(3036)

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            with self.assertRaises(ai_service.CvExtractionError) as context:
                ai_service.extract_cv_data(
                    _pdf_bytes("Jan Kowalski Python Developer " * 20)
                )

        self.assertEqual(context.exception.code, "extract_provider_daily_limit")
        self.assertEqual(context.exception.provider_code, 3036)
        self.assertFalse(context.exception.retryable)
        self.assertEqual(client.chat.completions.create.call_count, 1)

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

    def test_two_column_source_preserves_full_summary_and_nested_skill_groups(self):
        """Wrapped native text must beat shortened and flattened model output."""
        client = self._client({
            "name": "Jacob Andrew Rauch",
            "summary": "Full professional summary continues",
            "experience": [{
                "title": "WORK EXPERIENCE",
                "company": "Example Employer",
                "period": "2022 - 2026",
                "bullets": ["Delivered training programs."],
            }],
            "skills": ["Soft Skills", "Critical thinking"],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(_two_column_wrapped_cv_pdf_bytes())

        self.assertEqual(
            cv_data["summary"],
            "Full professional summary continues across every wrapped line and "
            "human-centered topic in the source CV. education. I possess practical "
            "knowledge.",
        )
        self.assertEqual(cv_data["experience"][0]["title"], "")
        self.assertEqual(
            cv_data["skills"],
            [
                {
                    "category": "Soft Skills",
                    "items": [
                        "Critical thinking.",
                        "Communicativeness, interpersonal skills, and empathy.",
                        "Communication and teamwork.",
                    ],
                },
                {
                    "category": "Research and IT",
                    "items": ["AI research.", "Data analysis and business modeling."],
                },
            ],
        )
        self.assertEqual(
            usage["source_grounded_fields"],
            ["summary", "experience_titles", "skills"],
        )
        rendered_content = "\n".join(
            str(element.get("content") or "")
            for element in generate_resume("atrium", cv_data)
        )
        self.assertIn("education. I possess practical knowledge", rendered_content)
        self.assertIn("Soft Skills", rendered_content)
        self.assertIn("Research and IT", rendered_content)
        self.assertNotIn("WORK EXPERIENCE", rendered_content)

    def test_plain_pdf_skill_labels_are_restored_as_nested_groups(self):
        """Bullet structure must recover categories after font-weight flattening."""
        client = self._client({
            "name": "Anton Tseytlin",
            "skills": ["Gemma returned one flat skills list"],
            "languages": [{"name": "duplicate", "level": "model value"}],
            "extra_sections": [{
                "title": "JEZYKI",
                "kind": "languages",
                "placement": "after_skills",
                "items": ["duplicate model value"],
            }],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _plain_nested_skills_cv_pdf_bytes()
            )

        groups = {
            group["category"]: group["items"]
            for group in cv_data["skills"]
            if isinstance(group, dict)
        }
        self.assertEqual(
            list(groups),
            [
                "Bezpieczenstwo",
                "Przemysl / OT",
                "Programowanie i systemy",
                "Jezyki obce",
            ],
        )
        self.assertIn(
            "triage alertow i raportowanie incydentow",
            groups["Bezpieczenstwo"],
        )
        self.assertIn(
            "wizja komputerowa (OpenCV, YOLO)",
            groups["Programowanie i systemy"],
        )
        self.assertNotIn("YOLO)", groups)
        self.assertNotIn("B1+ mowiony", groups)
        self.assertEqual(cv_data["languages"], [])
        self.assertEqual(usage["source_grounded_fields"], ["skills"])

        rendered_content = "\n".join(
            str(element.get("content") or "")
            for element in generate_resume("monument", cv_data)
        )
        for category in groups:
            self.assertIn(category, rendered_content)

    def test_overlapping_font_boxes_keep_first_language_and_inline_licence(self):
        """Canva-style glyph overlap must not clip the first section row."""
        pages = ai_service._pdf_text_pages(
            _overlapping_native_text_cv_pdf_bytes()
        )
        sections = {
            section["kind"]: section
            for section in pages[0]["sections"]
        }

        self.assertEqual(
            [line["text"] for line in sections["languages"]["body_lines"]],
            [
                "Angielski - C1 (certyfikat",
                "CAE)",
                "Niemiecki - A2",
            ],
        )
        self.assertEqual(sections["driving_license"]["title"], "PRAWO JAZDY")
        self.assertEqual(sections["driving_license"]["body"], "Kategoria B")

        grounded, fields = ai_service.ground_cv_data_from_source(
            {
                "name": "Maja Zielinska",
                "skills": ["incomplete model value"],
                "languages": ["incomplete model value"],
                "extra_sections": [],
            },
            pages,
        )
        groups = {
            group["category"]: group["items"]
            for group in grounded["skills"]
            if isinstance(group, dict)
        }
        self.assertEqual(
            groups["Umiejetnosci twarde"],
            ["Prowadzenie kampanii internetowych", "Analiza danych"],
        )
        self.assertEqual(
            groups["Umiejetnosci miekkie"],
            ["Komunikacja i prezentacja wynikow"],
        )
        self.assertEqual(
            groups["Jezyki obce"],
            ["Angielski - C1 (certyfikat CAE)", "Niemiecki - A2"],
        )
        self.assertEqual(grounded["languages"], [])
        self.assertEqual(
            grounded["extra_sections"],
            [{
                "title": "PRAWO JAZDY",
                "kind": "other",
                "placement": "after_skills",
                "items": ["Kategoria B"],
            }],
        )
        self.assertEqual(fields, ["skills", "driving_license"])

    def test_same_colour_text_under_sidebar_panel_is_ignored(self):
        """Invisible Canva text must not contaminate the visible Skills list."""
        pages = ai_service._pdf_text_pages(
            _hidden_summary_under_skills_panel_pdf_bytes()
        )
        sections = {
            section["kind"]: section
            for section in pages[0]["sections"]
        }

        self.assertEqual(
            sections["summary"]["body"],
            "Widoczne podsumowanie kandydatki.",
        )
        self.assertEqual(
            sections["skills"]["body"].splitlines(),
            ["Art Direction", "Visual Storytelling", "Adobe Photoshop"],
        )
        self.assertEqual(
            pages[0]["plain_text"].count("Widoczne podsumowanie kandydatki."),
            1,
        )

        grounded, fields = ai_service.ground_cv_data_from_source(
            {
                "name": "Anna Walczak",
                "summary": "incomplete model value",
                "skills": ["incomplete model value"],
                "languages": [],
            },
            pages,
        )
        self.assertEqual(
            grounded["summary"],
            "Widoczne podsumowanie kandydatki.",
        )
        self.assertEqual(
            grounded["skills"],
            ["Art Direction", "Visual Storytelling", "Adobe Photoshop"],
        )
        self.assertEqual(grounded["languages"], ["Angielski - C1"])
        self.assertEqual(fields, ["summary", "skills", "languages"])

    def test_horizontal_language_grid_keeps_all_source_languages(self):
        """Adjacent language cells must not be lost as separate page lanes."""
        client = self._client({
            "name": "Kamil Testowy",
            # Geometry must recover the two omitted cells and reject the one
            # provider value that has no visible source evidence.
            "languages": [
                {"name": "Polski", "level": "A2"},
                {"name": "Hiszpanski", "level": "C2"},
            ],
            "extra_sections": [],
        })

        with (
            patch.object(ai_service, "CV_EXTRACT_MIN_TEXT_CHARS_PER_PAGE", 1),
            patch.object(
                ai_service,
                "_provider_settings",
                return_value=(
                    client,
                    ai_service.CLOUDFLARE_TEXT_MODEL,
                    "cloudflare",
                ),
            ),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _horizontal_languages_cv_pdf_bytes()
            )

        expected = [
            {"name": "Polski", "level": "A2"},
            {"name": "Angielski", "level": "C1"},
            {"name": "Niemiecki", "level": "B2"},
        ]
        self.assertEqual(cv_data["languages"], expected)
        self.assertIn("languages", usage["source_grounded_fields"])
        self.assertNotIn("Hiszpanski", json.dumps(cv_data, ensure_ascii=False))

        language_section = next(
            section
            for section in cv_data["extra_sections"]
            if section["kind"] == "languages"
        )
        self.assertEqual(
            language_section["items"],
            ["Polski — A2", "Angielski — C1", "Niemiecki — B2"],
        )
        rendered = [
            str(element.get("content") or "")
            for element in generate_resume("meridian", cv_data)
        ]
        for source_language in language_section["items"]:
            self.assertEqual(rendered.count(source_language), 1)
        self.assertFalse(any("Hiszpanski" in text for text in rendered))

    def test_wrapped_horizontal_language_levels_stay_with_their_columns(self):
        """A lower CEFR row must attach to the label directly above it."""
        client = self._client({
            "name": "Kamil Testowy",
            # Reproduce the flattened, mispaired response observed after
            # importing CV_STERLING.pdf. Source geometry must replace it.
            "languages": [
                {"name": "Polski", "level": "A2 Niemiecki"},
                {"name": "C1", "level": "B2"},
                {"name": "Angielski", "level": ""},
            ],
            "extra_sections": [],
        })

        with (
            patch.object(ai_service, "CV_EXTRACT_MIN_TEXT_CHARS_PER_PAGE", 1),
            patch.object(
                ai_service,
                "_provider_settings",
                return_value=(
                    client,
                    ai_service.CLOUDFLARE_TEXT_MODEL,
                    "cloudflare",
                ),
            ),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _wrapped_horizontal_languages_cv_pdf_bytes()
            )

        expected = [
            {"name": "Polski", "level": "A2"},
            {"name": "Niemiecki", "level": "C1"},
            {"name": "Angielski", "level": "B2"},
        ]
        self.assertEqual(cv_data["languages"], expected)
        self.assertIn("languages", usage["source_grounded_fields"])
        language_section = next(
            section
            for section in cv_data["extra_sections"]
            if section["kind"] == "languages"
        )
        self.assertEqual(
            language_section["items"],
            ["Polski — A2", "Niemiecki — C1", "Angielski — B2"],
        )

    def test_centred_languages_stop_before_computer_skills_heading(self):
        """An adjacent Skills heading must never become a language row."""
        client = self._client({
            "name": "Anna Rojek",
            "skills": ["Biegla znajomosc MSOffice", "Excel", "PowerPoint"],
            # Reproduce the provider mistake reported for CV30. Source
            # geometry must replace this heading with the actual language row.
            "languages": [{"name": "OBSLUGA KOMPUTERA", "level": ""}],
            "labels": {"skills": "OBSLUGA KOMPUTERA"},
            "extra_sections": [{
                "title": "JEZYKI OBCE",
                "kind": "languages",
                "placement": "after_skills",
                "items": ["OBSLUGA KOMPUTERA"],
            }],
        })

        with (
            patch.object(ai_service, "CV_EXTRACT_MIN_TEXT_CHARS_PER_PAGE", 1),
            patch.object(
                ai_service,
                "_provider_settings",
                return_value=(
                    client,
                    ai_service.CLOUDFLARE_TEXT_MODEL,
                    "cloudflare",
                ),
            ),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _centred_languages_before_computer_skills_pdf_bytes()
            )

        self.assertEqual(
            cv_data["languages"],
            [
                {"name": "angielski", "level": "biegly"},
                {
                    "name": "francuski",
                    "level": "poziom zaawansowany-B2",
                },
                {"name": "rosyjski", "level": "komunikatywny"},
            ],
        )
        self.assertEqual(cv_data["labels"]["skills"], "OBSLUGA KOMPUTERA")
        self.assertNotIn(
            "OBSLUGA KOMPUTERA",
            json.dumps(cv_data["languages"], ensure_ascii=False),
        )
        self.assertIn("languages", usage["source_grounded_fields"])

    def test_native_pdf_without_languages_rejects_model_invention(self):
        """Document language must not become a candidate competency."""
        source = (
            "MICHAL TESTOWY DATA ENGINEER PROFESSIONAL SUMMARY "
            "Builds reliable data platforms with Python and SQL. "
        ) * 8
        client = self._client({
            "name": "Michal Testowy",
            "languages": [{"name": "Polski", "level": "A2"}],
            "extra_sections": [{
                "title": "JEZYKI",
                "kind": "languages",
                "placement": "after_skills",
                "items": ["Polski - A2"],
            }],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(_pdf_bytes(source))

        self.assertEqual(cv_data["languages"], [])
        self.assertFalse(
            any(
                section.get("kind") == "languages"
                for section in cv_data["extra_sections"]
            )
        )
        self.assertIn("languages", usage["source_grounded_fields"])

    def test_vision_language_grounding_keeps_named_provider_rows_only(self):
        """Incomplete native text cannot reject vision facts, only bad shapes."""
        grounded, fields = ai_service.ground_cv_data_from_source(
            {
                "name": "Jan Testowy",
                "languages": [
                    {"name": "", "level": "C1"},
                    "B2+",
                    {"name": "English", "level": "C1"},
                ],
                "extra_sections": [],
            },
            [{
                "number": 1,
                "plain_text": "",
                "sections": [],
                "needs_vision": True,
            }],
        )

        self.assertEqual(grounded["languages"], ["English — C1"])
        self.assertEqual(fields, ["languages"])

    def test_fragmented_skill_row_and_courses_are_grounded_to_their_sections(self):
        """Source geometry must undo model cross-contamination between sections."""
        client = self._client({
            "name": "Iwona Przybylska",
            "skills": ["Tworzenie", "informacyjnych"],
            "extra_sections": [{
                "title": "KURSY",
                "kind": "certifications",
                "placement": "after_experience",
                "items": ["tresci marketingowych"],
            }],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _fragmented_skills_and_courses_pdf_bytes()
            )

        self.assertEqual(
            cv_data["skills"],
            [
                "Tworzenie tresci marketingowych i informacyjnych",
                "Planowanie publikacji internetowych",
            ],
        )
        courses = next(
            section
            for section in cv_data["extra_sections"]
            if section["title"] == "KURSY"
        )
        self.assertEqual(
            courses["items"],
            [
                "Marketing internetowy w praktyce",
                "Tworzenie tresci dla mediow spolecznosciowych",
                "Copywriting i komunikacja marketingowa",
                "Podstawy projektowania tresci wizualnych.",
            ],
        )
        self.assertEqual(
            usage["source_grounded_fields"],
            ["summary", "skills", "certifications", "languages"],
        )

    def test_centered_headings_keep_flat_skills_and_remove_unsupported_licence(self):
        """Indented chrome must not let the model invent groups or a licence."""
        client = self._client({
            "name": "Iwona Przybylska",
            "experience": [{
                "title": "Content Creator",
                "company": "Voliera",
                "period": "03.2024 - obecnie",
                "bullets": ["Tworzenie tresci"],
            }],
            "education": [{
                "school": "Uniwersytet Miejski",
                "degree": "Marketing i komunikacja rynkowa",
                "period": "2019 - 2022",
                "description": (
                    "Marketing internetowy w praktyce; "
                    "Copywriting i komunikacja marketingowa."
                ),
            }],
            "skills": [
                {
                    "category": "Umiejetnosci twarde",
                    "items": ["Marketing automation"],
                },
                {
                    "category": "Umiejetnosci miekkie",
                    "items": ["Komunikacja"],
                },
            ],
            "languages": [
                "Polski - jezyk ojczysty",
                "Angielski - B2",
                "Niemiecki - A2",
                "Prawo jazdy - Kategoria B",
            ],
            "extra_sections": [
                {
                    "title": "PRAWO JAZDY",
                    "kind": "other",
                    "placement": "after_skills",
                    "items": ["Kategoria B"],
                },
                {
                    "title": "KURSY",
                    "kind": "certifications",
                    "placement": "after_experience",
                    "items": ["Modelowa, bledna lista"],
                },
            ],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _centered_right_column_cv_pdf_bytes(include_driving_license=False)
            )

        self.assertEqual(
            cv_data["skills"],
            [
                "Tworzenie tresci marketingowych i informacyjnych",
                "Planowanie publikacji internetowych",
                "Organizacja pracy i zarzadzanie wieloma zadaniami jednoczesnie.",
            ],
        )
        self.assertTrue(all(isinstance(item, str) for item in cv_data["skills"]))
        courses = next(
            section
            for section in cv_data["extra_sections"]
            if section["title"] == "KURSY"
        )
        self.assertEqual(
            courses["items"],
            [
                "Marketing internetowy w praktyce",
                "Copywriting i komunikacja marketingowa.",
            ],
        )
        self.assertEqual(cv_data["education"][0]["description"], "")
        self.assertNotIn(
            "Marketing internetowy w praktyce",
            cv_data["education"][0]["detail"],
        )
        regent_elements = generate_resume("regent", cv_data)
        rendered_text = [
            str(element.get("content") or "") for element in regent_elements
        ]
        self.assertEqual(rendered_text.count("KURSY"), 1)
        self.assertEqual(
            sum("Marketing internetowy w praktyce" in text for text in rendered_text),
            1,
        )
        rendered_data = json.dumps(cv_data, ensure_ascii=False)
        self.assertNotIn("Umiejetnosci twarde", rendered_data)
        self.assertNotIn("Umiejetnosci miekkie", rendered_data)
        self.assertNotIn("Prawo jazdy", rendered_data)
        self.assertNotIn("PRAWO JAZDY", rendered_data)
        self.assertEqual(
            usage["source_grounded_fields"],
            [
                "summary",
                "education_descriptions",
                "skills",
                "certifications",
                "driving_license",
                "languages",
            ],
        )

    def test_source_driving_licence_is_restored_as_a_separate_section(self):
        """A genuine licence heading must never become a language row."""
        client = self._client({
            "name": "Iwona Przybylska",
            "skills": ["Modelowa umiejetnosc"],
            "languages": [
                "Polski - jezyk ojczysty",
                "Prawo jazdy - Kategoria B",
            ],
            "extra_sections": [],
        })

        with patch.object(
            ai_service,
            "_provider_settings",
            return_value=(client, ai_service.CLOUDFLARE_TEXT_MODEL, "cloudflare"),
        ):
            cv_data, usage = ai_service.extract_cv_data(
                _centered_right_column_cv_pdf_bytes(include_driving_license=True)
            )

        driving_licence = next(
            section
            for section in cv_data["custom_sections"]
            if section["title"] == "PRAWO JAZDY"
        )
        self.assertEqual(driving_licence["kind"], "other")
        self.assertEqual(driving_licence["items"], ["Kategoria B"])
        self.assertFalse(
            any("Prawo jazdy" in language["name"] for language in cv_data["languages"])
        )
        self.assertIn("driving_license", usage["source_grounded_fields"])

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

    def test_cloudflare_client_disables_hidden_sdk_retries(self):
        """Capacity recovery belongs to the explicit model-attempt loop."""
        with (
            patch.object(ai_service, "CV_EXTRACT_PROVIDER", "cloudflare"),
            patch.object(ai_service, "CLOUDFLARE_ACCOUNT_ID", "account-id"),
            patch.object(ai_service, "CLOUDFLARE_API_TOKEN", "token"),
            patch.object(ai_service, "OpenAI") as openai_client,
        ):
            client, model, provider = ai_service._provider_settings("text")

        openai_client.assert_called_once_with(
            api_key="token",
            base_url=(
                "https://api.cloudflare.com/client/v4/accounts/"
                "account-id/ai/v1"
            ),
            max_retries=0,
            timeout=ai_service.AI_PROVIDER_TIMEOUT_SECONDS,
        )
        self.assertIs(client, openai_client.return_value)
        self.assertEqual(model, ai_service.CLOUDFLARE_TEXT_MODEL)
        self.assertEqual(provider, "cloudflare")


if __name__ == "__main__":
    unittest.main()
