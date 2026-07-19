import os
import unittest
from unittest.mock import patch

from app.core.security import (
    DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
    get_access_token_expire_minutes,
)


class AccessTokenLifetimeTests(unittest.TestCase):
    def test_uses_seven_day_default_when_no_lifetime_is_configured(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(
                get_access_token_expire_minutes(),
                DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
            )

    def test_allows_a_positive_deployment_specific_lifetime(self):
        with patch.dict(os.environ, {"ACCESS_TOKEN_EXPIRE_MINUTES": "1440"}, clear=True):
            self.assertEqual(get_access_token_expire_minutes(), 1440)

    def test_invalid_lifetime_falls_back_to_the_safe_default(self):
        with patch.dict(os.environ, {"ACCESS_TOKEN_EXPIRE_MINUTES": "0"}, clear=True):
            self.assertEqual(
                get_access_token_expire_minutes(),
                DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
            )


if __name__ == "__main__":
    unittest.main()
