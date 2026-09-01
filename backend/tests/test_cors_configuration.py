"""Environment contracts for the credentialed browser CORS allowlist."""
from __future__ import annotations

import unittest

from app.core.config import (
    assert_private_storage_configured,
    assert_trusted_proxy_configured,
    resolve_cors_origins,
)


class CorsConfigurationTests(unittest.TestCase):
    def test_development_defaults_only_to_local_vite(self):
        self.assertEqual(resolve_cors_origins({}), ["http://localhost:5173"])

    def test_production_requires_an_explicit_https_allowlist(self):
        with self.assertRaisesRegex(RuntimeError, "must be set"):
            resolve_cors_origins({"APP_ENV": "production"})
        with self.assertRaisesRegex(RuntimeError, "HTTPS"):
            resolve_cors_origins({
                "APP_ENV": "production",
                "CORS_ORIGINS": "http://frontend.example.test",
            })
        self.assertEqual(
            resolve_cors_origins({
                "APP_ENV": "production",
                "CORS_ORIGINS": "https://frontend.example.test/",
            }),
            ["https://frontend.example.test"],
        )

    def test_wildcards_and_paths_are_rejected(self):
        with self.assertRaisesRegex(RuntimeError, "Invalid"):
            resolve_cors_origins({"CORS_ORIGINS": "*"})
        with self.assertRaisesRegex(RuntimeError, "must not contain paths"):
            resolve_cors_origins({"CORS_ORIGINS": "https://example.test/app"})

    def test_production_requires_durable_private_storage(self):
        with self.assertRaisesRegex(RuntimeError, "S3_BUCKET_NAME"):
            assert_private_storage_configured({"APP_ENV": "production"})
        assert_private_storage_configured({})
        assert_private_storage_configured({
            "RENDER": "true",
            "S3_BUCKET_NAME": "private-cv-bucket",
            "AWS_ACCESS_KEY_ID": "test-access-key",
            "AWS_SECRET_ACCESS_KEY": "test-secret-key",
            "AWS_REGION": "eu-north-1",
        })

    def test_proxy_headers_require_a_narrow_valid_peer_allowlist(self):
        assert_trusted_proxy_configured({})
        with self.assertRaisesRegex(RuntimeError, "TRUSTED_PROXY_CIDRS"):
            assert_trusted_proxy_configured({"TRUST_PROXY_HEADERS": "true"})
        with self.assertRaisesRegex(RuntimeError, "Invalid trusted proxy"):
            assert_trusted_proxy_configured({
                "TRUST_PROXY_HEADERS": "true",
                "TRUSTED_PROXY_CIDRS": "not-a-network",
            })
        with self.assertRaisesRegex(RuntimeError, "must not trust every address"):
            assert_trusted_proxy_configured({
                "TRUST_PROXY_HEADERS": "true",
                "TRUSTED_PROXY_CIDRS": "0.0.0.0/0",
            })
        assert_trusted_proxy_configured({
            "TRUST_PROXY_HEADERS": "true",
            "TRUSTED_PROXY_CIDRS": "10.20.30.0/24,2001:db8:1234::/64",
        })


if __name__ == "__main__":
    unittest.main()
