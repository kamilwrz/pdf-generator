"""Localisation must stay request-scoped and independent of authored CV data."""
import asyncio

import pytest
from app.core.localisation import UiLanguageMiddleware, message, resolve_language, ui_language, ui_language_policy
from app.services.cv_generator import generate_resume, _GENERATORS
from app.services.cv_data import normalize_cv_data

@pytest.mark.parametrize("header,expected", [("", "pl"), ("de", "pl"), ("en-GB", "en"), ("en;q=0,pl;q=0.8", "pl"), ("pl;q=0.2,en;q=0.9", "en"), ("en;q=bad", "pl")])
def test_http_language_resolution(header, expected):
    assert resolve_language(header) == expected


def test_concurrent_requests_do_not_share_language():
    async def scenario():
        async def application(scope, receive, send):
            initial = ui_language.get()
            await asyncio.sleep(0.01)
            assert ui_language.get() == initial
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": initial.encode()})
        middleware = UiLanguageMiddleware(application)
        async def run(language):
            events = []
            async def receive(): return {"type": "http.request", "body": b""}
            async def send(event): events.append(event)
            await middleware({"type": "http", "headers": [(b"accept-language", language.encode())]}, receive, send)
            assert events[-1]["body"] == language.encode()
            assert (b"content-language", language.encode()) in events[0]["headers"]
        await asyncio.gather(run("en"), run("pl"), run("en"))
        assert ui_language.get() == "pl"
    asyncio.run(scenario())


def test_messages_keep_keys_and_ai_separates_ui_from_cv():
    token = ui_language.set("en")
    try:
        result = message("not_found")
        assert result == "Not found"
        assert result.message_key == "not_found"
        assert "British spelling" in ui_language_policy()
        assert "CV content/corrections" in ui_language_policy()
    finally:
        ui_language.reset(token)


@pytest.mark.parametrize("template", sorted(_GENERATORS))
@pytest.mark.parametrize("language,summary", [("English", "PROFESSIONAL SUMMARY"), ("Polish", "PODSUMOWANIE ZAWODOWE")])
def test_templates_follow_document_language_not_request_language(template, language, summary):
    token = ui_language.set("pl" if language == "English" else "en")
    try:
        cv = {"name": "Alex Example", "language": language, "summary": "Authored summary", "skills": ["Python"], "languages": [{"name": "English", "level": "C1"}]}
        content = [str(element.get("content", "")) for element in generate_resume(template, cv)]
        assert any(summary.lower() in text.lower() for text in content)
        assert any("Authored summary" in text for text in content)
        cv["labels"] = {"summary": "My custom heading"}
        content = [str(element.get("content", "")) for element in generate_resume(template, cv)]
        assert any("My custom heading".lower() in text.lower() for text in content)
    finally:
        ui_language.reset(token)


def test_legacy_document_keeps_polish_default():
    assert normalize_cv_data({"name": "Existing User"})["language"] == "Polish"

@pytest.mark.parametrize('language', ['pl', 'en'])
def test_safe_global_and_validation_errors_keep_request_language(language):
    from fastapi import FastAPI
    from fastapi.exceptions import RequestValidationError
    from fastapi.testclient import TestClient
    from app.main import localised_unexpected_error, localised_validation_error
    app = FastAPI()
    app.add_middleware(UiLanguageMiddleware)
    app.add_exception_handler(Exception, localised_unexpected_error)
    app.add_exception_handler(RequestValidationError, localised_validation_error)
    @app.get('/validate')
    def validate(count: int): return {'count': count}
    @app.get('/fail')
    def fail(): raise RuntimeError('private internal detail')
    with TestClient(app, raise_server_exceptions=False) as client:
        for path, status, key in [('/validate?count=no', 422, 'invalid_request'), ('/fail', 500, 'unexpected_server_error')]:
            response = client.get(path, headers={'Accept-Language': language})
            assert response.status_code == status
            assert response.headers['content-language'] == language
            assert response.json()['message_key'] == key
            assert 'private internal detail' not in response.text
            if status == 422:
                assert response.json()['detail'][0]['loc'] == ['query', 'count']
                assert response.json()['detail'][0]['type'] == 'int_parsing'
    assert ui_language.get() == 'pl'


@pytest.mark.parametrize('language', ['pl', 'en'])
def test_email_and_checkout_use_operation_language(language):
    import json
    from unittest.mock import MagicMock, patch
    from app.services import email_service, stripe_service
    token = ui_language.set(language)
    try:
        response = MagicMock()
        response.__enter__.return_value.status = 200
        with patch.object(email_service, 'RESEND_API_KEY', 'test-key'), patch.object(email_service, 'urlopen', return_value=response) as send:
            assert email_service.send_verification_email('person@example.test', f'https://example.test/verify-email?token=proof&lang={language}', idempotency_key='test')
            payload = json.loads(send.call_args.args[0].data)
            assert f'lang="{language}"' in payload['html']
            assert ('Verify your' if language == 'en' else 'Potwierdź') in payload['subject']
            assert f'lang={language}' in payload['text']
        provider = MagicMock()
        with patch.object(stripe_service, '_stripe', return_value=provider):
            stripe_service.create_checkout_session(user_id=1, email='person@example.test', price_id='price-existing', success_url='https://example.test/success', cancel_url='https://example.test/cancel', idempotency_key='same-operation')
            values = provider.checkout.Session.create.call_args.kwargs
            assert values['locale'] == language
            assert values['line_items'] == [{'price': 'price-existing', 'quantity': 1}]
            assert values['idempotency_key'] == 'same-operation'
    finally:
        ui_language.reset(token)
