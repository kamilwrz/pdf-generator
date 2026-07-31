import unittest
from types import SimpleNamespace

from app.services.entitlements import CREDIT_PLN, credits_for_cost
from app.services.openai_pricing import (
    estimate_cost_pln,
    estimate_cost_usd,
    rates_for_model,
    usage_from_response,
)


class OpenAIPricingTests(unittest.TestCase):
    def test_estimate_gpt_5_4_mini(self):
        # 1M in + 1M out = 0.75 + 4.50
        self.assertAlmostEqual(estimate_cost_usd("gpt-5.4-mini", 1_000_000, 1_000_000), 5.25)

    def test_estimate_gpt_5_6_sol(self):
        # 1M in + 1M out = 5.00 + 30.00
        self.assertAlmostEqual(estimate_cost_usd("gpt-5.6-sol", 1_000_000, 1_000_000), 35.0)

    def test_estimate_gpt_5_6_luna(self):
        # Standard API short-context tier: 1M in + 1M out = 0.20 + 1.20.
        self.assertAlmostEqual(estimate_cost_usd("gpt-5.6-luna", 1_000_000, 1_000_000), 1.4)

    def test_estimate_gpt_5_6_luna_fast_mode_is_double_standard(self):
        # Fast mode / Priority list price for Luna: $0.40 / $2.40 per 1M.
        self.assertEqual(rates_for_model("gpt-5.6-luna", "fast"), (0.40, 2.40))
        self.assertEqual(rates_for_model("gpt-5.6-luna", "priority"), (0.40, 2.40))
        self.assertAlmostEqual(
            estimate_cost_usd(
                "gpt-5.6-luna",
                1_000_000,
                1_000_000,
                service_tier="fast",
            ),
            2.8,
        )

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
        self.assertEqual(usage["service_tier"], "default")
        # 2000/1e6 * 0.75 + 500/1e6 * 4.50
        self.assertAlmostEqual(usage["cost_usd"], 0.00375, places=6)
        self.assertAlmostEqual(usage["cost_pln_estimate"], estimate_cost_pln(0.00375), places=4)
        self.assertEqual(usage["credit_pln"], 0.05)
        self.assertEqual(usage["credits_charged"], credits_for_cost(usage["cost_pln_estimate"]))

    def test_layout_luna_fast_usage_uses_fast_rates_for_credit_metering(self):
        # Layout defaults to Fast mode on Luna; credits must use the 2× sheet.
        resp = SimpleNamespace(
            service_tier="priority",  # API still echoes priority for GPT-5.6 Fast
            usage=SimpleNamespace(prompt_tokens=50_000, completion_tokens=4_000, total_tokens=54_000),
        )
        luna = usage_from_response(
            resp,
            model="gpt-5.6-luna",
            action="layout",
            service_tier="fast",
        )
        self.assertEqual(luna["action"], "layout")
        self.assertEqual(luna["service_tier"], "priority")
        self.assertEqual(luna["rates_usd_per_1m"], {"input": 0.40, "output": 2.40})
        # 50000/1e6 * 0.40 + 4000/1e6 * 2.40 = 0.02 + 0.0096
        self.assertAlmostEqual(luna["cost_usd"], 0.0296, places=6)
        self.assertAlmostEqual(luna["cost_pln_estimate"], 0.1184, places=4)
        self.assertEqual(luna["credits_charged"], 3)


if __name__ == "__main__":
    unittest.main()
