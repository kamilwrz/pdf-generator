"""Turn specific uncertain claims into bounded, resumable clarification questions."""
import re
from uuid import NAMESPACE_URL, uuid5

from app.services import interview_service as service


FALLBACK = 'Jak powinien brzmieć poniższy opis, aby zgadzał się z Twoim doświadczeniem?'


def question_key(text):
    """Compare wording independently of case, punctuation and whitespace."""
    return service.digest(' '.join(re.findall(r'\w+', str(text).casefold())))


def _generic(text):
    return not text or text == FALLBACK or 'Treść CV' in text or text.startswith('Jak należy poprawnie opisać ten fragment')


def _keys(question):
    keys = {question.get('topic', '')} - {''}
    keys.update('fact:' + ref for ref in question.get('target_fact_ids', []))
    if question.get('suggested_text'):
        keys.add('claim:' + question_key(question['suggested_text']))
    if not _generic(question.get('text', '')):
        keys.add('question:' + question_key(question['text']))
    return keys


def _seen(state):
    keys = set(state.get('dismissed_clarifications', []))
    keys.update(state.get('dismissed_clarification_keys', []))
    for answer in state['answers']:
        keys.update(_keys(answer.get('question', {})))
    return keys


def _capacity(state):
    # Regeneration cannot restart the clarification budget. Skipped and unknown
    # answers and explicitly deferred queued questions count too. Do not count
    # the active skipped question twice when it is in both histories.
    answers = [a.get('question', {}) for a in state['answers'] if a.get('question', {}).get('clarification')]
    dismissed = set(state.get('dismissed_clarifications', [])) - {q.get('topic') for q in answers}
    return max(0, min(5 - len(answers) - len(dismissed), 50 - len(state['answers'])))


def _at(data, path):
    for part in path.strip('/').split('/'):
        if isinstance(data, dict):
            data = data.get(part)
        elif isinstance(data, list) and part.isdigit() and int(part) < len(data):
            data = data[int(part)]
        else:
            return None
    return data


def _context(base, path):
    parts = path.strip('/').split('/')
    labels = {'summary': 'Podsumowanie zawodowe', 'experience': 'Doświadczenie zawodowe',
              'education': 'Edukacja', 'custom_sections': 'Projekt lub sekcja dodatkowa',
              'skills': 'Umiejętności', 'languages': 'Języki'}
    label = labels.get(parts[0], 'Proponowany opis')
    record = _at(base, '/'.join(parts[:2])) if len(parts) > 1 else None
    if isinstance(record, dict):
        identity = ' · '.join(str(record[k]) for k in ('title', 'company', 'degree', 'school', 'period') if record.get(k))
        label = identity or label
        if parts[0] == 'custom_sections' and len(parts) > 3:
            item = _at(base, '/'.join(parts[:4]))
            if isinstance(item, dict) and item.get('title'):
                label += ' · ' + item['title']
    return label[:500]


def clarification_queue(row, raw, verification, notes, profile):
    """Ask only about changed, specifically rejected claims with current sources.

    Technical failures and collateral record rejections keep the safe preview;
    they cannot become questions for the user. Claim and question fingerprints
    survive field reordering. Suppression never approves a rejected claim.
    """
    base, catalog = service.base_cv(profile), service.evidence(profile)
    fields = {field['path']: field for field in raw['fields']}
    questions = {item['path']: item['question'] for item in verification.get('clarifications', [])}
    unsupported = set(verification.get('unsupported_paths', [])) - set(verification.get('duplicate_paths', []))
    seen, result = _seen(row.state), []
    for note in notes:
        path = note['path']
        # Broad or unknown paths cannot identify a specific disputed fact.
        if path not in fields or path not in unsupported or not service.PATH.fullmatch(path):
            continue
        field = fields[path]
        value, refs = field['value'], field['evidence_refs']
        if not value.strip() or value == _at(base, path) or not refs:
            continue
        if any(ref not in catalog or catalog[ref].get('kind') in {'gap', 'framing'} for ref in refs):
            continue
        if path.strip('/').split('/')[0] not in {'summary', 'experience', 'education', 'custom_sections', 'skills', 'languages'}:
            continue
        context = _context(base, path)
        # Bind corrections to cited content, never to a guessed role or a model's
        # reordered output index. Unbound single-answer evidence can be revised
        # too; unrelated record metadata cannot identify a correction target.
        targets = [catalog[ref] for ref in refs if catalog[ref].get('path') == path]
        if targets:
            # Equivalent aliases of one authored field must change together.
            targets = [f for f in catalog.values() if f.get('path') == path and f.get('kind') == 'fact']
        if not targets and len(refs) == 1 and not catalog[refs[0]].get('path'):
            targets = [catalog[refs[0]]]
        if targets and any(f['text'] != targets[0]['text'] for f in targets):
            targets = []
        if targets and question_key(value) == question_key(targets[0]['text']):
            continue
        topic = 'clarify:' + question_key(value)[:48]
        text = questions.get(path, '')
        question = {
            'id': str(uuid5(NAMESPACE_URL, f'{row.id}:{topic}')), 'topic': topic,
            'text': FALLBACK if _generic(text) else text, 'context': context, 'record_label': context,
            'reason': 'Sprawdź poniższą propozycję. Popraw szczegół lub wyjaśnij, czego dotyczy.',
            'suggested_text': value, 'clarification': True,
            'target_fact_ids': [f['id'] for f in targets],
        }
        keys = _keys(question)
        if keys & seen or len(result) >= _capacity(row.state):
            continue
        result.append(question)
        seen.update(keys)
    return result


def answer_proposals(question, answer, status, profile, session_id):
    """Build answer facts that the route can persist under stable IDs.

    The caller has checked evidence revisions and owns the transaction that
    saves these facts with the answer history. Missing targets are not revived.
    Ambiguous or legacy questions keep an independent note instead of
    overwriting an unrelated field. Unknown and skipped answers create no fact.
    """
    if status not in {'answered', 'no_experience'}:
        return []
    catalog = service.evidence(profile)
    ids = question.get('target_fact_ids', []) if question.get('clarification') else []
    if any(ref not in catalog for ref in ids):
        service.fail('Informacja została usunięta. Wczytaj aktualny wywiad przed odpowiedzią.')
    text = answer.strip() if status == 'answered' else f"Brak doświadczenia: {question.get('suggested_text') or question['text']}"
    original = [catalog[ref] for ref in ids] or [{'id': f"answer-{question['id']}", 'path': ''}]
    return [{
        'id': fact['id'], 'text': text,
        'context': fact.get('context') or question['context'] or question['text'],
        'question': question['text'],
        'kind': 'fact' if status == 'answered' else 'gap',
        'path': fact['path'] if status == 'answered' else '',
        'source': f'interview:{session_id}',
    } for fact in original]


def repair_clarification_state(state):
    """Repair saved queues in place without AI calls or changes to user answers.

    Callers persist changes using revision compare-and-swap. Retained question
    IDs remain stable, so their open answer drafts can still be submitted.
    Empty legacy prompts are retired; concrete proposals remain visible.
    """
    if state.get('phase') != 'clarification':
        return
    active = state.get('question')
    candidates = ([active] if active else []) + state.get('pending_clarifications', [])
    seen, retained = _seen(state), []
    for original in candidates:
        question = dict(original)
        keys = _keys(question)
        if not question.get('id') or not str(question.get('suggested_text', '')).strip() or keys & seen or len(retained) >= _capacity(state):
            continue
        if _generic(question.get('text', '')):
            question['text'] = FALLBACK
        question.setdefault('record_label', 'Propozycja do sprawdzenia')
        retained.append(question)
        seen.update(keys)
    state['question'] = retained[0] if active and retained else None
    state['pending_clarifications'] = retained[1:] if active else retained
    if not retained:
        state['phase'] = 'review' if state['proposed_facts'] else 'preview' if state.get('preview') else 'ready'


def dismiss_clarifications(state, questions):
    """Remember skipped claims across regeneration without storing extra prose."""
    keys = set(state.get('dismissed_clarification_keys', []))
    for question in questions:
        keys.update(_keys(question))
    state['dismissed_clarification_keys'] = sorted(keys)


def start_clarifications(state):
    """Accept a voluntary round within the independent clarification budget."""
    repair_clarification_state(state)
    if state.get('question'):
        return
    pending = state.get('pending_clarifications', [])[:_capacity(state)]
    if not pending:
        service.fail('Nie ma kolejnych pytań. Możesz przejrzeć informacje i zapisać potwierdzoną treść.', 422)
    state['question_limit'] = max(state['question_limit'], len(state['answers']) + len(pending))
    state.update(question=pending[0], pending_clarifications=pending[1:], phase='clarification', clarification_round=True)


def finish_clarification_answer(state):
    """Advance saved clarification questions after the answer transaction."""
    # The answer handler has already cleared the active question. Normalize the
    # remaining queue against that saved answer before promoting another item.
    state['phase'] = 'clarification'
    repair_clarification_state(state)
    pending = state.get('pending_clarifications', [])
    state['question'] = pending[0] if pending else None
    state['pending_clarifications'] = pending[1:]
    state['phase'] = 'clarification' if pending else 'review' if state['proposed_facts'] else 'preview' if state.get('preview') else 'ready'
