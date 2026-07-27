import unittest

from app.services import layout_analysis
from app.services import ai_assistant_service
from unittest.mock import patch


PAGE = {"width": 595, "height": 842}


def el(element_id, category, left, top, width, height, **extra):
    base = {
        "element_id": element_id,
        "category": category,
        "left": left,
        "top": top,
        "width": width,
        "height": height,
        "page": 1,
        "zIndex": 2,
        "content": extra.pop("content", element_id),
    }
    base.update(extra)
    return base


class CloneOperationTests(unittest.TestCase):
    def test_clones_line_below_heading_matching_width(self):
        elements = [
            el("rule", "line", 40, 100, 200, 1, backgroundColor="#C7D5DE"),
            el("skills", "text", 40, 220, 180, 14, content="UMIEJĘTNOŚCI", fontSize=12, color="#13293D"),
        ]
        group = layout_analysis.resolve_clone_operation(
            elements,
            {
                "type": "clone_elements",
                "clones": [{
                    "source_element_id": "rule",
                    "reference_element_id": "skills",
                    "placement": "below",
                    "gap": 6,
                    "align": "start",
                    "match_size": "width",
                }],
            },
            PAGE,
        )
        self.assertIsNotNone(group)
        self.assertEqual(len(group["add_elements"]), 1)
        clone = group["add_elements"][0]
        self.assertEqual(clone["category"], "line")
        self.assertEqual(clone["backgroundColor"], "#C7D5DE")
        self.assertEqual(clone["left"], 40.0)
        self.assertEqual(clone["top"], 240.0)  # 220 + 14 + 6
        self.assertEqual(clone["width"], 180.0)  # matched heading width
        self.assertEqual(clone["height"], 1.0)
        self.assertNotEqual(clone["element_id"], "rule")

    def test_offset_clone_keeps_source_style(self):
        elements = [
            el("box", "rectangle", 10, 10, 40, 20, backgroundColor="#37D1EE", borderWidth=1),
        ]
        group = layout_analysis.resolve_clone_operation(
            elements,
            {
                "type": "clone_elements",
                "clones": [{
                    "source_element_id": "box",
                    "placement": "offset",
                    "dx": 12,
                    "dy": 8,
                }],
            },
            PAGE,
        )
        clone = group["add_elements"][0]
        self.assertEqual(clone["left"], 22.0)
        self.assertEqual(clone["top"], 18.0)
        self.assertEqual(clone["backgroundColor"], "#37D1EE")

    def test_rejects_clone_that_leaves_the_page(self):
        elements = [
            el("wide", "line", 10, 10, 500, 2),
            el("edge", "text", 500, 800, 80, 20, content="X"),
        ]
        group = layout_analysis.resolve_clone_operation(
            elements,
            {
                "type": "clone_elements",
                "clones": [{
                    "source_element_id": "wide",
                    "reference_element_id": "edge",
                    "placement": "below",
                    "gap": 40,
                }],
            },
            PAGE,
        )
        self.assertIsNone(group)

    def test_chat_wires_clone_operation_into_clone_groups(self):
        elements = [
            el("rule", "line", 40, 100, 200, 1, backgroundColor="#aaa"),
            el("heading", "text", 40, 200, 160, 16, content="PROFIL"),
        ]

        def fake_gpt(system, user, **kwargs):
            self.assertIn("clone_operation", system)
            return {
                "message": "Klonuję linię pod nagłówkiem.",
                "corrections": [],
                "clone_operation": {
                    "type": "clone_elements",
                    "clones": [{
                        "source_element_id": "rule",
                        "reference_element_id": "heading",
                        "placement": "below",
                        "gap": 4,
                        "align": "start",
                    }],
                },
            }, {}

        with patch.object(ai_assistant_service, "_gpt", side_effect=fake_gpt):
            result = ai_assistant_service.analyze_action(
                action="chat",
                elements=elements,
                message="sklonuj linię i umieść pod PROFIL",
                page_size=PAGE,
            )

        self.assertEqual(result["clone_issues"], [])
        self.assertEqual(len(result["clone_groups"]), 1)
        self.assertEqual(result["clone_groups"][0]["add_elements"][0]["top"], 220.0)


if __name__ == "__main__":
    unittest.main()
