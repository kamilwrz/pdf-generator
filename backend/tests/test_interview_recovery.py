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
    fields = [{'path': f'/experience/0/bullets/{index}', 'value': f'Propozycja {index}', 'evidence_refs': [profile['facts'][0]['id']]} for index in range(8)]
    notes = [{'path': field['path'], 'action': 'omitted_suggestion'} for field in fields]
    verification = {'unsupported_paths': [f['path'] for f in fields]}
    queue = clarification_queue(row, {'fields': fields}, verification, notes, profile)
    assert len(queue) == 5
    row.state['answers'] = [{'question': queue[0], 'status': 'unknown'}]
    again = clarification_queue(row, {'fields': fields}, verification, notes, profile)
    assert queue[0]['topic'] not in [q['topic'] for q in again]
    row.state['dismissed_clarifications'] = [q['topic'] for q in again]
    assert len(clarification_queue(row, {'fields': fields[:5]}, verification, notes[:5], profile)) == 0
    state = {'question_limit': 8, 'answers': [{}] * 8, 'pending_clarifications': queue}
    start_clarifications(state)
    assert state['question_limit'] == 13 and len(state['pending_clarifications']) == 4
    state = {'question_limit': 50, 'answers': [{}] * 49, 'pending_clarifications': queue}
    start_clarifications(state)
    assert state['question_limit'] == 50 and state['pending_clarifications'] == []
    schema = provider_schema(Verification)['schema']
    assert set(schema['required']) == set(schema['properties'])


def test_clarifications_ignore_technical_errors_and_record_cascade():
    from types import SimpleNamespace
    from app.services.interview_clarification import clarification_queue
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna'}), 'manual')}
    ref = profile['facts'][0]['id']
    row = SimpleNamespace(id='session', state={'answers': []})
    fields = [{'path': '/summary', 'value': 'Python', 'evidence_refs': [ref]}]
    notes = [{'path': '/summary', 'action': 'omitted_suggestion'}]
    for unsupported in ([], ['summary?'], ['/experience/0/title']):
        assert clarification_queue(row, {'fields': fields}, {'unsupported_paths': unsupported}, notes, profile) == []
    fields[0]['evidence_refs'] = ['deleted-fact']
    assert clarification_queue(row, {'fields': fields}, {'unsupported_paths': ['/summary']}, notes, profile) == []


def test_duplicate_claims_survive_reordering_and_skipping_without_reappearing():
    from types import SimpleNamespace
    from app.services.interview_clarification import clarification_queue, dismiss_clarifications
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna'}), 'manual')}
    row = SimpleNamespace(id='session', state={'answers': []})
    fields = [{'path': f'/experience/{i}/bullets/0', 'value': 'Python w portalu CV.', 'evidence_refs': [profile['facts'][0]['id']]} for i in range(8)]
    notes = [{'path': f['path'], 'action': 'omitted_suggestion'} for f in fields]
    verification = {'unsupported_paths': [f['path'] for f in fields]}
    queue = clarification_queue(row, {'fields': fields}, verification, notes, profile)
    assert len(queue) == 1
    assert queue[0]['suggested_text'] == 'Python w portalu CV.'
    assert 'Treść CV' not in queue[0]['text']
    dismiss_clarifications(row.state, queue)
    fields[0]['value'] = 'PYTHON   w portalu CV!'
    assert clarification_queue(row, {'fields': fields}, verification, notes, profile) == []


def test_legacy_queue_repair_is_idempotent_and_preserves_answers():
    from copy import deepcopy
    from app.services.interview_clarification import repair_clarification_state, finish_clarification_answer
    questions = [{'id': str(i), 'topic': f'old-path-{i}', 'text': 'Jak należy poprawnie opisać ten fragment dotyczący: Treść CV?',
                  'suggested_text': 'Python w portalu CV', 'clarification': True, 'context': 'Treść CV'} for i in range(8)]
    state = {'phase': 'clarification', 'question': questions[0], 'pending_clarifications': questions[1:],
             'answers': [], 'proposed_facts': [], 'preview': {'cv_data': {'name': 'Anna'}}}
    repair_clarification_state(state)
    assert state['question']['id'] == '0' and not state['pending_clarifications']
    assert 'Treść CV' not in state['question']['text']
    repaired = deepcopy(state)
    repair_clarification_state(state)
    assert state == repaired
    state['answers'].append({'question': state['question'], 'answer': '', 'status': 'unknown'})
    state['question'] = None
    state['pending_clarifications'] = questions[1:]
    finish_clarification_answer(state)
    assert state['phase'] == 'preview' and len(state['answers']) == 1


def test_five_clarification_answers_close_budget_even_for_new_claims():
    from types import SimpleNamespace
    from app.services.interview_clarification import clarification_queue, repair_clarification_state
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna'}), 'manual')}
    state = {'answers': [{'question': {'clarification': True}, 'status': 'skipped'} for _ in range(8)],
             'phase': 'clarification', 'proposed_facts': [], 'preview': {'cv_data': {'name': 'Anna'}},
             'question': {'id': 'new', 'topic': 'new', 'text': 'Projekt?', 'suggested_text': 'SQL', 'clarification': True},
             'pending_clarifications': []}
    raw = {'fields': [{'path': '/summary', 'value': 'SQL', 'evidence_refs': [profile['facts'][0]['id']]}]}
    notes = [{'path': '/summary', 'action': 'omitted_suggestion'}]
    assert clarification_queue(SimpleNamespace(id='session', state=state), raw, {'unsupported_paths': ['/summary']}, notes, profile) == []
    repair_clarification_state(state)
    assert state['phase'] == 'preview' and state['question'] is None and len(state['answers']) == 8



def test_duplicate_additions_are_omitted_but_distinct_and_other_roles_survive():
    profile = {'facts': service.source_facts(normalize_cv_data({'name': 'Anna', 'experience': [
        {'title': 'Analyst', 'bullets': ['Research SoF i SoW.']},
        {'title': 'Senior Analyst', 'bullets': ['Research SoF i SoW.']},
    ]}), 'manual')}
    ref = next(f['id'] for f in profile['facts'] if f['path'] == '/experience/0/bullets/0')
    raw = {'fields': [
        {'path': '/experience/0/bullets/1', 'value': 'Research SoF i SoW.', 'evidence_refs': [ref]},
        {'path': '/experience/0/bullets/2', 'value': 'Wyjaśnianie źródeł środków i majątku.', 'evidence_refs': [ref]},
    ]}
    result, changes, _ = assemble_reviewed_draft(raw, {'unsupported_paths': [], 'duplicate_paths': ['/experience/0/bullets/2']}, profile, 'pl')
    assert result['experience'][0]['bullets'] == ['Research SoF i SoW.']
    assert result['experience'][1]['bullets'] == ['Research SoF i SoW.']
    assert changes == []


def test_clarification_targets_suppress_reworded_questions_and_protect_other_facts():
    from types import SimpleNamespace
    from app.services.interview_clarification import clarification_queue, answer_proposals
    profile = {'facts': service.source_facts({'name': 'Anna', 'experience': [{'bullets': ['Research SoF.']}]}, 'manual')}
    fact = next(f for f in profile['facts'] if f['path'] == '/experience/0/bullets/0')
    row = SimpleNamespace(id='s', state={'answers': []})
    field = {'path': fact['path'], 'value': 'Codzienny research SoF.', 'evidence_refs': [fact['id']]}
    verification = {'unsupported_paths': [fact['path']]}
    notes = [{'path': fact['path']}]
    question = clarification_queue(row, {'fields': [field]}, verification, notes, profile)[0]
    row.state['answers'] = [{'question': question, 'status': 'answered'}]
    field['value'] = 'Research SoF wykonywany każdego dnia.'
    assert clarification_queue(row, {'fields': [field]}, verification, notes, profile) == []
    assert answer_proposals(question, '', 'unknown', profile, 's') == []
    assert answer_proposals(question, '', 'skipped', profile, 's') == []
    negative = answer_proposals(question, '', 'no_experience', profile, 's')[0]
    assert negative['id'] == fact['id'] and negative['kind'] == 'gap' and negative['path'] == ''
    assert service.evidence(profile)[fact['id']]['text'] == 'Research SoF.'
