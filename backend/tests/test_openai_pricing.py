import unittest
from types import SimpleNamespace

from app.services.openai_pricing import estimate_cost_usd, usage_from_response


class OpenAIPricingTests(unittest.TestCase):
    def test_estimate_gpt_5_4_mini(self):
        # 1M in + 1M out = 0.75 + 4.50
        self.assertAlmostEqual(estimate_cost_usd("gpt-5.4-mini", 1_000_000, 1_000_000), 5.25)

    def test_estimate_gpt_4o(self):
        self.assertAlmostEqual(estimate_cost_usd("gpt-4o", 1_000_000, 1_000_000), 12.5)

    def test_usage_from_response(self):
        resp = SimpleNamespace(
            usage=SimpleNamespace(prompt_tokens=2000, completion_tokens=500, total_tokens=2500)
        )
        usage = usage_from_response(resp, model="gpt-5.4-mini", action="chat")
        self.assertEqual(usage["prompt_tokens"], 2000)
        self.assertEqual(usage["completion_tokens"], 500)
        self.assertEqual(usage["action"], "chat")
        # 2000/1e6 * 0.75 + 500/1e6 * 4.50
        self.assertAlmostEqual(usage["cost_usd"], 0.00375, places=6)


if __name__ == "__main__":
    unittest.main()
