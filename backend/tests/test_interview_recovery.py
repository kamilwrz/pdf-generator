"""A rejected suggestion must not discard confirmed content or valid changes."""
from app.services import interview_service as service
from app.services.interview_recovery import assemble_reviewed_draft
from app.services.cv_data import normalize_cv_data


def test_report_chronology_and_project_technology_rejections_keep_usable_cv():
    base = normalize_cv_data({
        'name': 'Anna Nowak', 'summary': 'Analityczka',
        'experience': [{'title': 'Analityczka', 'company': 'Example', 'bullets': ['Weryfikacja raportów przekazanych do organu nadzoru.']}],
        'custom_sections': [{'title': 'Projekty', 'kind': 'projects', 'items': [{'title': 'Portal CV', 'bullets': ['Budowa portalu CV.']}]}],
    })
    profile = {'facts': service.source_facts(base, 'manual')}
    profile['facts'].append({'id': 'tools', 'text': 'Python i SQL w prywatnych projektach.', 'path': '', 'kind': 'fact', 'context': 'Projekty', 'source': 'interview'})
    ref = next(f['id'] for f in profile['facts'] if f['path'] == '/summary')
    original = '/experience/0/bullets/0'
    addition = '/custom_sections/0/items/0/bullets/1'
    raw = {'fields': [
        {'path': original, 'value': 'Weryfikacja raportów przed przekazaniem do organu nadzoru.', 'evidence_refs': [ref]},
        {'path': addition, 'value': 'Budowa portalu CV w Pythonie i SQL.', 'evidence_refs': ['tools']},
        {'path': '/summary', 'value': 'Analityczka raportów', 'evidence_refs': [ref]},
    ]}
    data, changes, notes = assemble_reviewed_draft(raw, {'unsupported_paths': [original, addition]}, profile, 'pl')
    assert data['experience'][0]['bullets'] == base['experience'][0]['bullets']
    assert data['custom_sections'][0]['items'][0]['bullets'] == ['Budowa portalu CV.']
    assert data['summary'] == 'Analityczka raportów'
    assert [field['path'] for field in changes] == ['/summary']
    assert notes == [{'path': original, 'action': 'kept_original'}, {'path': addition, 'action': 'omitted_suggestion'}]


def test_rejected_record_identity_also_omits_dependent_generated_claims():
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna'}), 'manual')}
    ref = profile['facts'][0]['id']
    raw = {'fields': [
        {'path': '/custom_sections/0/items/0/title', 'value': 'Invented project', 'evidence_refs': [ref]},
        {'path': '/custom_sections/0/items/0/bullets/0', 'value': 'Python', 'evidence_refs': [ref]},
    ]}
    _, changes, notes = assemble_reviewed_draft(raw, {'unsupported_paths': ['/custom_sections/0/items/0/title']}, profile, 'pl')
    assert not changes and len(notes) == 2


def test_unlocatable_verifier_rejection_does_not_apply_unchecked_claims():
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna'}), 'manual')}
    raw = {'fields': [{'path': '/summary', 'value': 'Invented', 'evidence_refs': [profile['facts'][0]['id']]}]}
    _, changes, notes = assemble_reviewed_draft(raw, {'unsupported_paths': ['summary?']}, profile, 'pl')
    assert not changes and len(notes) == 1



def test_clarification_round_respects_caps_and_does_not_repeat_answered_topics():
    from types import SimpleNamespace
    from app.services.interview_clarification import clarification_queue, start_clarifications
    from app.schemas.interview_schema import Verification, provider_schema
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna'}), 'manual')}
    row = SimpleNamespace(id='session', state={'answers': [], 'dismissed_clarifications': []})
    fields = [{'path': f'/experience/0/bullets/{index}', 'value': 'Propozycja', 'evidence_refs': ['x']} for index in range(8)]
    notes = [{'path': field['path'], 'action': 'omitted_suggestion'} for field in fields]
    queue = clarification_queue(row, {'fields': fields}, {}, notes, profile)
    assert len(queue) == 5
    row.state['answers'] = [{'question': queue[0], 'status': 'unknown'}]
    again = clarification_queue(row, {'fields': fields}, {}, notes, profile)
    assert queue[0]['topic'] not in [q['topic'] for q in again]
    row.state['dismissed_clarifications'] = [q['topic'] for q in again]
    assert len(clarification_queue(row, {'fields': fields[:6]}, {}, notes[:6], profile)) == 0
    state = {'question_limit': 8, 'answers': [{}] * 8, 'pending_clarifications': queue}
    start_clarifications(state)
    assert state['question_limit'] == 13 and len(state['pending_clarifications']) == 4
    state = {'question_limit': 50, 'answers': [{}] * 49, 'pending_clarifications': queue}
    start_clarifications(state)
    assert state['question_limit'] == 50 and state['pending_clarifications'] == []
    schema = provider_schema(Verification)['schema']
    assert set(schema['required']) == set(schema['properties'])
