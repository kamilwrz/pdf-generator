import unittest
from types import SimpleNamespace

from app.services.entitlements import CREDIT_PLN, credits_for_cost
from app.services.openai_pricing import (
    estimate_cost_pln,
    estimate_cost_usd,
    usage_from_response,
)


class OpenAIPricingTests(unittest.TestCase):
    def test_estimate_gpt_5_4_mini(self):
        # 1M in + 1M out = 0.75 + 4.50
        self.assertAlmostEqual(estimate_cost_usd("gpt-5.4-mini", 1_000_000, 1_000_000), 5.25)

    def test_estimate_gpt_5_6_sol(self):
        # 1M in + 1M out = 5.00 + 30.00
        self.assertAlmostEqual(estimate_cost_usd("gpt-5.6-sol", 1_000_000, 1_000_000), 35.0)

    def test_estimate_gpt_4o(self):
        self.assertAlmostEqual(estimate_cost_usd("gpt-4o", 1_000_000, 1_000_000), 12.5)

    def test_credit_unit_is_five_groszy(self):
        self.assertEqual(CREDIT_PLN, 0.05)
        self.assertEqual(credits_for_cost(0.05), 1)
        self.assertEqual(credits_for_cost(0.15), 3)

    def test_usage_from_response_includes_credits(self):
        resp = SimpleNamespace(
            usage=SimpleNamespace(prompt_tokens=2000, completion_tokens=500, total_tokens=2500)
        )
        usage = usage_from_response(resp, model="gpt-5.4-mini", action="chat")
        self.assertEqual(usage["prompt_tokens"], 2000)
        self.assertEqual(usage["completion_tokens"], 500)
        self.assertEqual(usage["action"], "chat")
        # 2000/1e6 * 0.75 + 500/1e6 * 4.50
        self.assertAlmostEqual(usage["cost_usd"], 0.00375, places=6)
        self.assertAlmostEqual(usage["cost_pln_estimate"], estimate_cost_pln(0.00375), places=4)
        self.assertEqual(usage["credit_pln"], 0.05)
        self.assertEqual(usage["credits_charged"], credits_for_cost(usage["cost_pln_estimate"]))

    def test_layout_sol_usage_charges_more_credits_than_mini(self):
        # Same token counts: sol is far more expensive → more credits.
        resp = SimpleNamespace(
            usage=SimpleNamespace(prompt_tokens=50_000, completion_tokens=4_000, total_tokens=54_000)
        )
        mini = usage_from_response(resp, model="gpt-5.4-mini", action="chat")
        sol = usage_from_response(resp, model="gpt-5.6-sol", action="layout")
        self.assertGreater(sol["cost_usd"], mini["cost_usd"])
        self.assertGreaterEqual(sol["credits_charged"], mini["credits_charged"])
        self.assertEqual(sol["action"], "layout")


if __name__ == "__main__":
    unittest.main()
