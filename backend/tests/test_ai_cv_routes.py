import unittest

from app.api.routes.ai import router


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
