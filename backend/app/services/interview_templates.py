"""Render and select alternate interview templates without rewriting evidence.

Candidate enumeration has no interview write or AI side effect. Selection
regenerates the same revision-bound baseline, validates browser geometry, and
commits template, spacing and elements together through the session CAS.
"""
from copy import deepcopy
import re
from uuid import NAMESPACE_URL, uuid5

from app.core.localisation import message
from app.services import interview_service as service
from app.services.ai_service import generate_resume
from app.services.cv_generator_primitives import normalize_spacing_px, use_spacing
from app.services.cv_templates.registry import TEMPLATE_LAYOUTS
from app.services.entitlements import assert_template_allowed, get_entitlements
from app.services.interview_fit import _layout


def _ready(db, row, request):
    profile = service.check_versions(db, row, request)
    preview = row.state.get('preview')
    if (row.state['phase'] != 'preview' or not preview or preview.get('pages', 1) <= 1
            or preview['profile_revision'] != profile['revision']
            or preview.get('fit', {}).get('status') == 'pending'):
        service.fail(message('interview_prepare_an_up_to_date_preview_before_saving'))
    return preview


def _text_key(value):
    return ' '.join(re.findall(r'\w+', str(value).casefold()))


def _visible_values(value):
    if isinstance(value, str):
        yield _text_key(value)
    elif isinstance(value, list):
        for item in value:
            yield from _visible_values(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key not in {'labels', 'language', 'layout', 'kind', 'placement', 'section_type'}:
                yield from _visible_values(item)


def _preserve_photo(source, elements):
    """Move an existing user photo into an authored slot, preserving its asset.

    Placeholder glyphs are template decorations, not user photos. A template
    without a slot is excluded when it would otherwise drop a real photo.
    Applied images remain non-fixed content so layout validation requires them.
    """
    photos = [el for el in source if el.get('photoSlot') == 'image' or el.get('id') == 'profile-photo']
    if not photos:
        return True
    if len(photos) != 1:
        return False
    photo = photos[0]
    glyph = next((el for el in elements if el.get('photoSlot') == 'glyph' and el.get('page', 1) == 1), None)
    frame = next((el for el in elements if el.get('photoSlot') == 'frame' and el.get('page', 1) == 1), None)
    if glyph is None or not photo.get('src'):
        return False
    box = frame or glyph
    circle = box.get('category') == 'circle' or box.get('photoShape') == 'circle'
    inset = 0 if circle or glyph.get('photoShape') == 'direct' else 2 if box.get('photoShape') == 'ornament-frame' else 3
    width = float(box.get('width') or box.get('diameter') or 0) - 2 * inset
    height = float(box.get('height') or box.get('diameter') or 0) - 2 * inset
    if width <= 0 or height <= 0:
        return False
    glyph.update(src=photo['src'], img_id=photo.get('img_id'), id='profile-photo', photoSlot='image',
                 fixedToPage=False, flowRole='masthead', left=float(box.get('left') or 0) + inset,
                 top=float(box.get('top') or 0) + inset, width=width, height=height,
                 objectFit=photo.get('objectFit') or 'cover', borderRadius=min(width, height) / 2 if circle else 0,
                 zIndex=max(float(glyph.get('zIndex') or 0), float(box.get('zIndex') or 0) + 1))
    return True


def _candidate(row, template_id):
    """Build reproducible element/group identities for stateless candidate reads.

    Generators assign random record groups. First-seen remapping preserves
    group membership while making a second render comparable to the proposal.
    Every identity is bound to the session revision and selected template.
    """
    preview = row.state['preview']
    spacing = normalize_spacing_px(row.state['spacing_px']).as_spacing_px()
    with use_spacing(spacing):
        elements = generate_resume(template_id, deepcopy(preview['cv_data']))
    if not _preserve_photo(preview['elements'], elements):
        return None
    # Formatting can change case, punctuation and line breaks. Visible CV
    # values must still occur in the target; unsupported content never earns
    # a recommendation merely because its omission would save space.
    before = ' '.join(_text_key(el.get('content', '')) for el in preview['elements'])
    after = ' '.join(_text_key(el.get('content', '')) for el in elements)
    if any(value and value in before and value not in after for value in _visible_values(preview['cv_data'])):
        return None
    prefix = f'interview-template:{row.id}:{row.revision}:{template_id}'
    groups = {}
    for index, element in enumerate(elements):
        element['element_id'] = str(uuid5(NAMESPACE_URL, f'{prefix}:element:{index}'))
        group = element.get('flowGroup')
        if group:
            groups.setdefault(group, str(uuid5(NAMESPACE_URL, f'{prefix}:group:{len(groups)}')))
            element['flowGroup'] = groups[group]
    return {'template_id': template_id, 'elements': elements, 'spacing_px': spacing,
            'pages': max((int(el.get('page', 1)) for el in elements), default=1)}


def preview_templates(db, user, row, request):
    """Return allowed alternatives for browser measurement without saving them.

    Uses only the owned, current verified CV. This endpoint neither consumes
    credits nor changes the selected template or interview revision. Candidates
    are layouts to measure, not unverified promises that they fit one page.
    """
    _ready(db, row, request)
    allowed = get_entitlements(db, user)['allowed_template_ids']
    candidates = []
    for template_id in TEMPLATE_LAYOUTS:
        if template_id == row.state['template_id'] or allowed is not None and template_id not in allowed:
            continue
        candidate = _candidate(row, template_id)
        if candidate is not None:
            candidates.append(candidate)
    service.check_versions(db, service.owned_session(db, user.id, row.id), request)
    return {'revision': row.revision, 'profile_revision': request.profile_revision,
            'evidence_scope': row.state['evidence_scope'], 'target_pages': 1, 'candidates': candidates}


def select_preview_template(db, user, row, request):
    """Commit one explicitly selected, measured single-page alternative.

    Ownership, entitlement and evidence revisions are rechecked at selection.
    The client can move/compact canonical template elements but cannot rewrite
    text or replace assets. Tailoring retains its default source template until
    this explicit user choice; no AI generation or source CV write is involved.
    """
    preview = _ready(db, row, request)
    if request.template_id not in TEMPLATE_LAYOUTS or request.template_id == row.state['template_id']:
        service.fail(message('interview_choose_an_available_cv_template'), 422)
    assert_template_allowed(db, user, request.template_id)
    candidate = _candidate(row, request.template_id)
    try:
        if candidate is None:
            raise ValueError('Template does not preserve visible CV content')
        elements = _layout(candidate, request)
        if max(int(el.get('page', 1)) for el in elements) != 1:
            raise ValueError('Alternate template did not fit one page')
    except (ValueError, TypeError, KeyError):
        service.fail(message('interview_prepare_an_up_to_date_preview_before_saving'), 422)
    state = deepcopy(row.state)
    # Keep the existing pre-shortening undo point where available; historical
    # previews without one receive a complete template/geometry restore point.
    original = state.setdefault('fit_original', {'preview': deepcopy(preview), 'spacing_px': deepcopy(state['spacing_px'])})
    original.setdefault('template_id', state['template_id'])
    fit = {'original_pages': preview['pages'], 'attempts': 0, **preview.get('fit', {}),
           'status': 'complete', 'can_restore': True, 'allow_shorten': False,
           'selected_alternative': True, 'previous_template_id': state['template_id']}
    state['preview'] = {**deepcopy(preview), 'elements': elements, 'pages': 1, 'fit': fit}
    state['spacing_px'] = normalize_spacing_px(request.spacing_px).as_spacing_px()
    state['template_id'] = request.template_id
    state.pop('fit_best', None)
    state.pop('generation_attempt', None)
    state['document_title'] = None
    service.check_versions(db, service.owned_session(db, user.id, row.id), request)
    service.update_session(db, row, request.revision, state)
    return service.session_payload(service.owned_session(db, user.id, row.id))
