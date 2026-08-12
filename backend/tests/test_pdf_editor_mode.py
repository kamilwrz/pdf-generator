"""Persist editor_mode / template_id on Pdf rows."""
from __future__ import annotations

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.crud.pdfs import create_new_pdf, request_pdf_by_id
from app.models.models import Base, User
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


class PdfEditorModeTests(unittest.TestCase):
    def setUp(self):
        ensure_test_auth_env()
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(User(
            username="u1",
            email="u1@e.pl",
            hashed_password="x",
            created_at=datetime.now(timezone.utc),
            is_active=True,
        ))
        self.db.commit()
        self.user_id = self.db.query(User).one().id

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def test_create_pdf_stores_template_mode(self):
        pdf_id = create_new_pdf(
            self.db,
            title="cv.pdf",
            user_id=self.user_id,
            file_path="/tmp/cv.pdf",
            elements=[_element()],
            editor_mode="template",
            template_id="nimbus",
        )
        row = request_pdf_by_id(self.db, pdf_id)
        self.assertEqual(row.editor_mode, "template")
        self.assertEqual(row.template_id, "nimbus")

    def test_create_pdf_defaults_freeform(self):
        pdf_id = create_new_pdf(
            self.db,
            title="blank.pdf",
            user_id=self.user_id,
            file_path="/tmp/blank.pdf",
            elements=[_element()],
        )
        row = request_pdf_by_id(self.db, pdf_id)
        self.assertEqual(row.editor_mode, "freeform")
        self.assertIsNone(row.template_id)


if __name__ == "__main__":
    unittest.main()
