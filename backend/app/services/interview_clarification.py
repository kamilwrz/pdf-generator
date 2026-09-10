"""Turn uncertain model claims into opt-in questions before showing a final CV."""
from uuid import NAMESPACE_URL, uuid5

from app.services import interview_service as service


def clarification_queue(row, raw, verification, notes, profile):
    """Build up to five unresolved questions from review output, without AI calls.

    Questions are proposals, never profile evidence. Cached legacy output uses
    a neutral fallback. A stable field/record topic prevents repeatedly asking
    answered, unknown or explicitly dismissed questions in later generations.
    """
    base = service.base_cv(profile)
    fields = {field['path']: field for field in raw['fields']}
    catalog = service.evidence(profile)
    questions = {item['path']: item['question'] for item in verification.get('clarifications', [])}
    seen = {answer['question']['topic'] for answer in row.state['answers']}
    seen.update(row.state.get('dismissed_clarifications', []))
    result = []
    for note in notes:
        path = note['path']
        if not path or path not in fields:
            continue
        # A previously confirmed absence or locked wording is already resolved.
        if any(catalog.get(ref, {}).get('kind') in {'gap', 'framing'} for ref in fields[path]['evidence_refs']):
            continue
        parts = path.strip('/').split('/')
        record = base.get(parts[0], [])
        if len(parts) > 1 and isinstance(record, list):
            record = record[int(parts[1])] if int(parts[1]) < len(record) else {}
        context = 'Treść CV'
        if isinstance(record, dict):
            context = ' · '.join(str(record[key]) for key in ('title', 'company', 'school') if record.get(key)) or context
        if parts[0] == 'custom_sections' and len(parts) > 3 and isinstance(record, dict):
            items = record.get('items', [])
            item = items[int(parts[3])] if int(parts[3]) < len(items) else {}
            if isinstance(item, dict) and item.get('title'):
                context += ' · ' + item['title']
        topic = 'clarify:' + service.digest([path, context])[:48]
        if topic in seen:
            continue
        value = fields[path]['value']
        question = questions.get(path) or (
            f'Jak należy poprawnie opisać ten fragment dotyczący: {context}? '
            'Doprecyzuj fakty, zakres Twojego udziału oraz związek z rolą lub projektem.'
        )
        result.append({
            'id': str(uuid5(NAMESPACE_URL, f'{row.id}:{topic}')), 'topic': topic,
            'text': question, 'context': f'{context}: {question}'[:500],
            'reason': 'Brakuje potwierdzenia szczegółu w propozycji AI. Twoja odpowiedź pozwoli przygotować wierny opis.',
            'suggested_text': value, 'clarification': True,
        })
        if len(result) == 5:
            break
    return result


def start_clarifications(state):
    """Accept a voluntary round, counting every question against the session cap."""
    if state.get('question'):
        return
    pending = state.get('pending_clarifications', [])
    capacity = min(5, 50 - len(state['answers']))
    if not pending or capacity <= 0:
        service.fail('Nie ma kolejnych pytań. Możesz przejrzeć informacje i zapisać potwierdzoną treść.', 422)
    pending = pending[:capacity]
    state['question_limit'] = max(state['question_limit'], len(state['answers']) + len(pending))
    state.update(question=pending[0], pending_clarifications=pending[1:], phase='clarification', clarification_round=True)


def finish_clarification_answer(state):
    """Advance saved questions locally; answered facts still require confirmation."""
    pending = state.get('pending_clarifications', [])
    state['question'] = pending[0] if pending else None
    state['pending_clarifications'] = pending[1:]
    state['phase'] = 'clarification' if pending else 'review' if state['proposed_facts'] else 'preview' if state.get('preview') else 'ready'
