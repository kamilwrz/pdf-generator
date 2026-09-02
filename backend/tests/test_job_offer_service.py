"""Security and extraction tests for public job-offer links."""

import json
import unittest

from app.services.job_offer_service import (
    JobOfferError,
    resolve_job_offer,
    validate_job_offer_url,
)


def _public_dns(*_args, **_kwargs):
    return [(2, 1, 6, "", ("93.184.216.34", 443))]


class JobOfferServiceTests(unittest.TestCase):
    def test_rejects_http_credentials_private_ip_and_dns_rebinding_targets(self):
        with self.assertRaises(JobOfferError):
            validate_job_offer_url("http://example.com/job", resolver=_public_dns)
        with self.assertRaises(JobOfferError):
            validate_job_offer_url("https://user:pass@example.com/job", resolver=_public_dns)
        with self.assertRaises(JobOfferError):
            validate_job_offer_url("https://127.0.0.1/job", resolver=_public_dns)
        with self.assertRaises(JobOfferError):
            validate_job_offer_url(
                "https://example.com/job",
                resolver=lambda *_args, **_kwargs: [(2, 1, 6, "", ("10.0.0.8", 443))],
            )

    def test_rejects_malformed_port_with_stable_error(self):
        with self.assertRaises(JobOfferError) as raised:
            validate_job_offer_url("https://example.com:not-a-port/job", resolver=_public_dns)

        self.assertEqual(raised.exception.code, "unsafe_job_offer_url")

    def test_extracts_jobposting_json_ld(self):
        posting = {
            "@context": "https://schema.org",
            "@type": "JobPosting",
            "title": "Senior Python Developer",
            "hiringOrganization": {"name": "Example SA"},
            "jobLocation": {"address": {"addressLocality": "Warszawa", "addressCountry": "PL"}},
            "description": "<p>Buduj API w Pythonie i FastAPI.</p>",
        }
        html = f'<html><script type="application/ld+json">{json.dumps(posting)}</script></html>'.encode()

        result = resolve_job_offer(
            "https://example.com/jobs/123",
            fetcher=lambda url: (url, "text/html", html),
            resolver=_public_dns,
        )

        self.assertEqual(result["source"], "html")
        self.assertEqual(result["title"], "Senior Python Developer")
        self.assertEqual(result["company"], "Example SA")
        self.assertIn("FastAPI", result["description"])

    def test_uses_pasted_description_when_remote_parse_fails(self):
        result = resolve_job_offer(
            "https://example.com/jobs/empty",
            "Wymagamy doświadczenia z Pythonem.",
            fetcher=lambda url: (url, "text/html", b"<html><script>ignore()</script></html>"),
            resolver=_public_dns,
        )

        self.assertEqual(result["source"], "manual_fallback")
        self.assertIn("użyto wklejonego opisu", result["fetch_warning"])
        self.assertIn("Pythonem", result["description"])

    def test_manual_description_does_not_require_network(self):
        result = resolve_job_offer(fallback_description="Analityk danych — SQL i Python.")
        self.assertEqual(result["source"], "manual")
        self.assertEqual(result["source_url"], "")

    def test_captcha_page_uses_manual_fallback(self):
        result = resolve_job_offer(
            "https://example.com/jobs/protected",
            "Wymagamy FastAPI i PostgreSQL.",
            fetcher=lambda url: (url, "text/html", b"<html><body>Verify you are human CAPTCHA</body></html>"),
            resolver=_public_dns,
        )
        self.assertEqual(result["source"], "manual_fallback")
        self.assertIn("PostgreSQL", result["description"])


if __name__ == "__main__":
    unittest.main()
