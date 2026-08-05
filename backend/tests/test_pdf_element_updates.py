import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.crud.pdfs import update_pdf_elements


def element(element_id, *, deleted=False):
    return SimpleNamespace(
        element_id=element_id,
        deleted=deleted,
        img_id=None,
        category="text",
        page=1,
        left=10,
        top=20,
        width=None,
        height=None,
        content="Treść",
        fontSize=12,
        fontFamily="Helvetica",
        color="#000000",
        src=None,
        backgroundColor=None,
        zIndex=2,
        isSelected=False,
        isMove=False,
        lineHeight=None,
        letterSpacing=None,
        bold=False,
        italic=False,
        underline=False,
        align=None,
        bulletList=False,
        autoHeight=True,
        flowRole="section-chrome",
        flowGroup="record-test",
        isDecorativeChromeText=True,
        preserveInitialLayout=True,
        fixedToPage=True,
        repeatOnContinuation=False,
        locked=True,
        borderWidth=None,
        filled=True,
        source_id=None,
        target_id=None,
        arrow=None,
    )


class PdfElementUpdateTests(unittest.TestCase):
    def test_live_payload_replaces_stale_and_deleted_database_elements(self):
        database = MagicMock()
        keep_row = SimpleNamespace()
        existing = {
            "keep": keep_row,
            "stale": SimpleNamespace(),
            "removed": SimpleNamespace(),
        }

        update_pdf_elements(
            database,
            [element("keep"), element("new"), element("removed", deleted=True)],
            existing,
            pdf_id=24,
        )

        self.assertEqual(database.query.return_value.filter.return_value.delete.call_count, 2)
        self.assertEqual(database.add.call_count, 1)
        self.assertEqual(database.add.call_args.args[0].element_id, "new")
        self.assertEqual(keep_row.content, "Treść")
        self.assertEqual(keep_row.page, 1)
        self.assertTrue(keep_row.extra_properties["autoHeight"])
        self.assertEqual(keep_row.extra_properties["flowRole"], "section-chrome")
        self.assertEqual(keep_row.extra_properties["flowGroup"], "record-test")
        self.assertTrue(keep_row.extra_properties["isDecorativeChromeText"])
        self.assertTrue(keep_row.extra_properties["preserveInitialLayout"])
        self.assertTrue(keep_row.extra_properties["fixedToPage"])
        self.assertFalse(keep_row.extra_properties["repeatOnContinuation"])
        self.assertTrue(keep_row.extra_properties["locked"])
        self.assertTrue(keep_row.extra_properties["filled"])

    def test_empty_live_payload_removes_every_existing_element(self):
        database = MagicMock()

        update_pdf_elements(
            database,
            [],
            {"first": SimpleNamespace(), "second": SimpleNamespace()},
            pdf_id=24,
        )

        self.assertEqual(database.query.return_value.filter.return_value.delete.call_count, 2)
        database.add.assert_not_called()
