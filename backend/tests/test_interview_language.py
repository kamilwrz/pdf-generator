"""CV language survives interview generation independently of the interface locale.

The provider is mocked with faithful translations. These regressions exercise
language routing, persistence and template filling, not live translation quality.
"""
from copy import deepcopy
import json
from unittest.mock import patch

import pytest

from app.api.routes import interviews
from app.models.models import InterviewSession, Pdf
from app.services.interviews import service
from app.services.cv.data import normalize_cv_data
from app.services.cv.templates.registry import TEMPLATE_LAYOUTS, generate_resume
from test_interviews import environment, create, confirm, version, editorial


POLISH_SOURCE = {
    'name': 'Anna Nowak',
    'email': 'anna@example.com',
    'phone': '+48 500 600 700',
    'address': 'ul. Przykładowa 1, Warszawa',
    'title': 'Analityk KYC',
    'summary': 'Analizuję dokumentację klientów.',
    'experience': [{
        'title': 'Starszy analityk KYC', 'company': 'Przykładowa Firma',
        'city': 'Warszawa', 'period': '2022–2024',
        'bullets': ['Przygotowywanie raportów dla zespołu.'],
    }],
    'education': [{
        'degree': 'Studia magisterskie', 'school': 'Uniwersytet Warszawski',
        'city': 'Warszawa', 'period': '2018–2020',
        'description': 'Analiza danych.',
    }],
    'skills': [{'category': 'Analiza', 'items': ['Analiza dokumentacji']}],
    'languages': [{'name': 'Polski', 'level': 'Ojczysty'}],
    'custom_sections': [
        {'title': 'Zainteresowania', 'items': ['Fotografia']},
        {'title': 'Zgoda na przetwarzanie danych', 'items': ['Wyrażam zgodę na przetwarzanie moich danych.']},
    ],
    'language': 'Polish',
}
TRANSLATIONS = {
    'Analityk KYC': 'KYC Analyst',
    'Analizuję dokumentację klientów.': 'I analyse client documentation.',
    'Starszy analityk KYC': 'Senior KYC Analyst',
    'Przygotowywanie raportów dla zespołu.': 'Preparing reports for the team.',
    'Studia magisterskie': "Master's degree",
    'Analiza danych.': 'Data analysis.',
    'Analiza': 'Analysis',
    'Analiza dokumentacji': 'Document analysis',
    'Polski': 'Polish',
    'Ojczysty': 'Native',
    'Zainteresowania': 'Interests',
    'Fotografia': 'Photography',
    'Zgoda na przetwarzanie danych': 'Consent to data processing',
    'Wyrażam zgodę na przetwarzanie moich danych.': 'I consent to the processing of my personal data.',
}
ENGLISH_HEADINGS = ('SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'LANGUAGES')
POLISH_HEADINGS = ('PODSUMOWANIE', 'DOŚWIADCZENIE', 'EDUKACJA', 'UMIEJĘTNOŚCI', 'JĘZYKI')
USAGE = {'cost_pln_estimate': .01}
VERIFIED = {'unsupported_paths': [], 'reasons': []}


def translated_draft(profile, language='en'):
    """Return every source leaf, preserving literal identity and evidence refs."""
    # Custom section titles are uppercased by the canonical CV normalizer.
    translations = {text.casefold(): value for text, value in TRANSLATIONS.items()}
    return {
        'fields': [{
            'path': fact['path'],
            'value': translations.get(fact['text'].casefold(), fact['text']) if language == 'en' else fact['text'],
            'evidence_refs': [fact['id']],
        } for fact in profile['facts'] if fact['kind'] == 'fact' and fact['path']],
        'remaining_gaps': [],
    }


@pytest.mark.parametrize('mode', ['create', 'enrich', 'tailor'])
@pytest.mark.parametrize('language,ui_language', [('en', 'en'), ('en', 'pl'), ('pl', 'en')])
def test_selected_cv_language_reaches_all_generation_stages_and_saved_document(environment, mode, language, ui_language):
    """English UI cannot force English output over an explicit Polish selection."""
    client, db, user, _ = environment
    client.headers['Accept-Language'] = ui_language
    source = Pdf(owner_id=user.id, title='Polish source', cv_data=deepcopy(POLISH_SOURCE),
                 template_id='linden', revision=1)
    db.add(source)
    db.commit()
    session = confirm(client, create(
        client, mode=mode, language=language, source_document_id=source.id, cv_data={},
        job_description='KYC Analyst' if mode == 'tailor' else '',
    ))
    profile = deepcopy(service.interview_profile(db, db.get(InterviewSession, session['id'])))
    draft = translated_draft(profile, language)
    with patch.object(service, '_gpt', side_effect=[(draft, USAGE), (editorial(draft), USAGE), (VERIFIED, USAGE)]) as provider:
        result = client.post(f"/ai/interviews/{session['id']}/preview", json={
            **version(session, 1), 'template_id': 'linden',
        })
    assert result.status_code == 200, result.text
    saved = result.json()
    assert saved['phase'] == 'preview', saved.get('generation_feedback')
    assert [call.kwargs['response_schema']['name'] for call in provider.call_args_list] == [
        'draft', 'editorialreview', 'verification',
    ]
    for call in provider.call_args_list:
        context = json.loads(call.args[1])
        assert context['language'] == service.LANGUAGES[language]
        assert context['profile'] == profile['facts']
    # The mocked translations are useful only if the real provider is asked
    # for complete translated fields, including headings outside prose edits.
    draft_task = json.loads(provider.call_args_list[0].args[1])['task']
    for requirement in (
        'niezależnie od języka źródła, odpowiedzi i interfejsu',
        'pełny zestaw pól tekstowych', 'nagłówki sekcji dodatkowych',
        'zainteresowania i treść zgody', 'wyłącznie tłumaczenia',
    ):
        assert requirement in draft_task

    cv_data = saved['preview']['cv_data']
    assert cv_data['language'] == service.LANGUAGES[language]
    # Normalisation runs again during template filling and reopening saved CVs.
    # All prose fields must survive it, including custom headings and consent.
    normalized = normalize_cv_data(normalize_cv_data(cv_data))
    values = {fact['path']: fact['text'] for fact in service.source_facts(normalized, 'generated')}
    for field in draft['fields']:
        if field['path'].startswith('/custom_sections/') and field['path'].endswith('/title'):
            assert values[field['path']] == field['value'].upper()
        else:
            assert values[field['path']] == field['value']
    for field in service.IDENTITY:
        if field in POLISH_SOURCE:
            assert normalized[field] == POLISH_SOURCE[field]
    headings = ENGLISH_HEADINGS if language == 'en' else POLISH_HEADINGS
    assert list(normalized['labels'].values()) == list(headings[:4])
    assert next(section for section in normalized['extra_sections'] if section['kind'] == 'languages')['title'] == headings[4]
    rendered = '\n'.join(str(element.get('content', '')) for element in saved['preview']['elements']).upper()
    assert all(heading in rendered for heading in headings)
    assert ('PHOTOGRAPHY' if language == 'en' else 'FOTOGRAFIA') in rendered
    assert ('INTERESTS' if language == 'en' else 'ZAINTERESOWANIA') in rendered
    assert ('CONSENT TO DATA PROCESSING' if language == 'en' else 'ZGODA NA PRZETWARZANIE DANYCH') in rendered

    def save_document(db, *, user, username, pdf_data, idempotency_key):
        row = Pdf(owner_id=user.id, title=pdf_data.pdf_title, create_idempotency_key=idempotency_key,
                  cv_data=pdf_data.cv_data)
        db.add(row)
        db.commit()
        return {'pdf_id': row.id}

    with patch.object(interviews, 'create_pdf_document', side_effect=save_document):
        document = client.post(f"/ai/interviews/{session['id']}/document", json=version(saved, 1))
    assert document.status_code == 200, document.text
    assert db.get(Pdf, document.json()['document_id']).cv_data == cv_data
    db.refresh(source)
    assert source.cv_data == POLISH_SOURCE and source.revision == 1
    assert service.interview_profile(db, db.get(InterviewSession, session['id'], populate_existing=True)) == profile


@pytest.mark.parametrize('template_id', list(TEMPLATE_LAYOUTS))
def test_english_interview_headings_and_custom_content_survive_every_template(template_id):
    """Templates must honour the interview locale through their own normalizer."""
    profile = {'facts': service.source_facts(normalize_cv_data(POLISH_SOURCE), 'source')}
    cv_data, _ = service.assemble_draft(translated_draft(profile), profile, 'en')
    rendered = '\n'.join(str(element.get('content', '')) for element in generate_resume(template_id, cv_data)).upper()
    assert all(heading in rendered for heading in ENGLISH_HEADINGS)
    assert not any(heading in rendered for heading in POLISH_HEADINGS)
    assert 'SENIOR KYC ANALYST' in rendered
    assert 'PHOTOGRAPHY' in rendered
    assert 'CONSENT TO DATA PROCESSING' in rendered
