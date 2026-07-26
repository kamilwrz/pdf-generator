import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from app.services.legacy_document_cleanup import CLEANUP_KEY, run_legacy_document_cleanup


def pdf(pdf_id, width, height, path):
    return SimpleNamespace(
        id=pdf_id,
        page_width=width,
        page_height=height,
        file_path=path,
    )


class LegacyDocumentCleanupTests(unittest.TestCase):
    def test_removes_a4_and_deck_documents_with_linked_elements_once(self):
        marker_query = MagicMock()
        marker_query.filter.return_value.first.return_value = None
        documents_query = MagicMock()
        documents_query.all.return_value = [
            pdf(1, 595, 842, "a4.pdf"),
            pdf(2, 960, 540, "deck.pdf"),
            pdf(3, 595, 595, "keep.pdf"),
        ]
        elements_query = MagicMock()
        pdfs_delete_query = MagicMock()
        db = MagicMock()
        db.query.side_effect = [
            marker_query,
            documents_query,
            elements_query,
            pdfs_delete_query,
        ]
        deleted_files = []

        deleted = run_legacy_document_cleanup(
            db,
            delete_file=deleted_files.append,
        )

        self.assertEqual(deleted, 2)
        self.assertEqual(deleted_files, ["a4.pdf", "deck.pdf"])
        elements_query.filter.return_value.delete.assert_called_once()
        pdfs_delete_query.filter.return_value.delete.assert_called_once()
        marker = db.add.call_args.args[0]
        self.assertEqual(marker.key, CLEANUP_KEY)
        db.commit.assert_called_once()

    def test_marker_prevents_cleanup_of_future_documents(self):
        marker_query = MagicMock()
        marker_query.filter.return_value.first.return_value = SimpleNamespace(key=CLEANUP_KEY)
        db = MagicMock()
        db.query.return_value = marker_query
        deleted_files = []

        deleted = run_legacy_document_cleanup(
            db,
            delete_file=deleted_files.append,
        )

        self.assertEqual(deleted, 0)
        self.assertEqual(deleted_files, [])
        db.add.assert_not_called()
        db.commit.assert_not_called()

    def test_storage_failure_does_not_leave_database_rows_behind(self):
        marker_query = MagicMock()
        marker_query.filter.return_value.first.return_value = None
        documents_query = MagicMock()
        documents_query.all.return_value = [pdf(1, 595, 842, "missing.pdf")]
        elements_query = MagicMock()
        pdfs_delete_query = MagicMock()
        db = MagicMock()
        db.query.side_effect = [
            marker_query,
            documents_query,
            elements_query,
            pdfs_delete_query,
        ]

        def unavailable_storage(_):
            raise OSError("storage unavailable")

        with self.assertLogs(
            "app.services.legacy_document_cleanup",
            level="WARNING",
        ):
            self.assertEqual(
                run_legacy_document_cleanup(db, delete_file=unavailable_storage),
                1,
            )
        pdfs_delete_query.filter.return_value.delete.assert_called_once()
        db.commit.assert_called_once()
