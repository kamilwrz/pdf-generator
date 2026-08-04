"""Per-document FlowSpacing overrides for generation and Pdf persistence."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.crud.pdfs import create_new_pdf, request_pdf_by_id, serialize_spacing_px
from app.models.models import Base, User
from app.services.cv_data import normalize_cv_data
from app.services.cv_generator import generate_resume, get_spacing, use_spacing
from app.services.cv_generator_primitives import DEFAULT_FLOW_SPACING, normalize_spacing_px
from app.testing_support import ensure_test_auth_env


def _element(**overrides):
    base = dict(
        element_id="el-1",
        category="text",
        page=1,
        left=10,
        top=20,
        width=100,
        height=14,
        content="Hello",
        fontSize=12,
        fontFamily="Inter",
        color="#000",
        src=None,
        backgroundColor=None,
        img_id=None,
        zIndex=1,
        isSelected=False,
        isMove=False,
        lineHeight=None,
        letterSpacing=None,
        bold=False,
        italic=False,
        underline=False,
        align="left",
        bulletList=False,
        autoHeight=False,
        flowRole="content",
        flowGroup=None,
        preserveInitialLayout=False,
        alignWithText=None,
        fixedToPage=False,
        repeatOnContinuation=True,
        locked=False,
        borderWidth=None,
        filled=False,
        source_id=None,
        target_id=None,
        arrow=False,
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class FlowSpacingTests(unittest.TestCase):
    def test_normalize_clamps_and_defaults(self):
        spacing = normalize_spacing_px({"section": 40, "stack": -2})
        self.assertEqual(spacing.section, 40.0)
        self.assertEqual(spacing.stack, 0.0)
        self.assertEqual(spacing.record, DEFAULT_FLOW_SPACING.record)

    def test_use_spacing_changes_generated_layout(self):
        cv = normalize_cv_data(
            {
                "name": "Test User",
                "title": "Engineer",
                "summary": "Short summary for spacing check.",
                "experience": [
                    {
                        "title": "Dev",
                        "company": "Acme",
                        "period": "2020-2024",
                        "bullets": ["Did things"],
                    }
                ],
                "education": [{"degree": "BSc", "school": "Uni", "period": "2016-2020"}],
                "skills": ["Python"],
            },
            require_name=True,
        )
        default_els = generate_resume("cinder", cv)
        with use_spacing({"section": 40}):
            wide_els = generate_resume("cinder", cv)
        self.assertEqual(get_spacing().section, DEFAULT_FLOW_SPACING.section)

        def heading_tops(elements):
            return [
                element["top"]
                for element in elements
                if element.get("flowRole") == "section-chrome"
                and element.get("category") == "text"
            ]

        self.assertNotEqual(heading_tops(default_els), heading_tops(wide_els))
        self.assertGreater(heading_tops(wide_els)[1], heading_tops(default_els)[1])

    def test_serialize_spacing_omits_defaults(self):
        self.assertIsNone(serialize_spacing_px(None))
        self.assertIsNone(serialize_spacing_px(DEFAULT_FLOW_SPACING.as_spacing_px()))
        payload = serialize_spacing_px({"section": 33})
        self.assertEqual(payload["section"], 33.0)
        self.assertEqual(payload["stack"], DEFAULT_FLOW_SPACING.stack)


class PdfSpacingPersistTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(
            User(
                username="u1",
                email="u1@e.pl",
                hashed_password="x",
                created_at=datetime.now(timezone.utc),
                is_active=True,
            )
        )
        self.db.commit()
        self.user_id = self.db.query(User).one().id

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_pdf_stores_spacing_px(self):
        pdf_id = create_new_pdf(
            self.db,
            title="cv.pdf",
            user_id=self.user_id,
            file_path="/tmp/cv.pdf",
            elements=[_element()],
            editor_mode="template",
            template_id="cinder",
            spacing_px={"section": 36, "record": 14},
        )
        row = request_pdf_by_id(self.db, pdf_id)
        self.assertEqual(row.spacing_px["section"], 36.0)
        self.assertEqual(row.spacing_px["record"], 14.0)
