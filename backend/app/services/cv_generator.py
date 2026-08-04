"""
Dynamic CV layout engine — public facade.

Individual template generators live in ``cv_templates.templates.<id>``.
Universal helpers live in ``cv_templates.shared``. This module re-exports the
stable API used by AI fill, layout GPT, and tests.
"""

from __future__ import annotations

from app.services.cv_generator_primitives import (  # noqa: F401
    A4_H,
    CONTENT_BOTTOM,
    MARGIN_BOTTOM,
    PAGE_TOP,
    SPACE_AFTER_HEADER_RULE,
    SPACE_AFTER_MASTHEAD,
    SPACE_AFTER_RULE,
    SPACE_RECORD,
    SPACE_SECTION,
    SPACE_STACK,
    Builder,
    _block,
    _circle,
    _ellipse,
    _line,
    _rect,
    _text,
    section_chrome_height,
)
from app.services.cv_templates.registry import (  # noqa: F401
    TEMPLATE_LAYOUTS,
    _GENERATORS,
    generate_resume,
)
from app.services.cv_templates.shared.extras import (  # noqa: F401
    _extra_sections,
    _fit_sidebar_sections,
    _flatten_extra_items,
    _sidebar_candidates,
)
from app.services.cv_templates.shared.records import (  # noqa: F401
    _education_record_height,
    _experience_record_height,
    _place_education_record,
    _place_experience_record,
)
from app.services.cv_templates.shared.text import (  # noqa: F401
    _bullets,
    _compact_text,
    _company_period,
    _contact_line,
    _labels,
)

__all__ = [
    "TEMPLATE_LAYOUTS",
    "_GENERATORS",
    "generate_resume",
    "Builder",
    "SPACE_STACK",
    "SPACE_RECORD",
    "SPACE_SECTION",
    "SPACE_AFTER_RULE",
    "SPACE_AFTER_MASTHEAD",
    "SPACE_AFTER_HEADER_RULE",
    "A4_H",
    "CONTENT_BOTTOM",
    "PAGE_TOP",
]
