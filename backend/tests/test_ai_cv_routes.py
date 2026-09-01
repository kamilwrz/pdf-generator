import unittest
import inspect

from app.api.routes import ai

router = ai.router


class AiCvRoutesTests(unittest.TestCase):
    def test_only_cv_generation_routes_are_registered(self):
        paths = {route.path for route in router.routes}

        self.assertIn("/ai/extract_cv", paths)
        self.assertIn("/ai/imports", paths)
        self.assertIn("/ai/imports/{snapshot_id}", paths)
        self.assertIn("/ai/fill_template", paths)
        self.assertIn("/ai/bio_cv_draft", paths)
        self.assertNotIn("/ai/generate_deck", paths)
        self.assertNotIn("/ai/generate_article", paths)

    def test_blocking_ai_routes_are_regular_threadpool_handlers(self):
        handlers = (
            ai.extract_cv,
            ai.list_imports,
            ai.get_import,
            ai.delete_import,
            ai.get_bio_cv_draft_route,
            ai.upsert_bio_cv_draft_route,
            ai.delete_bio_cv_draft_route,
            ai.fill_template,
        )
        self.assertTrue(all(not inspect.iscoroutinefunction(handler) for handler in handlers))
