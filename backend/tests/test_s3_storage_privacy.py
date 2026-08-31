"""S3 persistence must not opt stored user documents into public access."""

import importlib.util
import sys
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import Mock, patch


def _load_s3_storage_with_stubbed_sdk():
    """Load the optional S3 module without requiring boto3 in local-only setups.

    Production and CI install boto3 from ``requirements.txt``. The repository's
    default local-storage test command must also remain runnable in a minimal
    Python environment, so this isolated module load supplies only the SDK name
    needed at import time. The test replaces ``get_client`` before any call.
    """
    module_path = (
        Path(__file__).resolve().parents[1] / "app" / "services" / "s3_storage.py"
    )
    spec = importlib.util.spec_from_file_location("s3_storage_privacy_test", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load the S3 storage module for its privacy test.")
    module = importlib.util.module_from_spec(spec)
    boto3_stub = ModuleType("boto3")
    boto3_stub.client = Mock()
    with patch.dict(sys.modules, {"boto3": boto3_stub}):
        spec.loader.exec_module(module)
    return module


s3_storage = _load_s3_storage_with_stubbed_sdk()


class S3StoragePrivacyTests(unittest.TestCase):
    """Lock the upload contract used by private PDFs and profile images."""

    def test_upload_omits_acl_and_returns_server_side_locator(self):
        """Rely on S3 private defaults without breaking ACL-disabled buckets."""
        client = Mock()
        with (
            patch.object(s3_storage, "get_client", return_value=client),
            patch.object(s3_storage, "S3_BUCKET", "private-cv-bucket"),
            patch.object(s3_storage, "AWS_REGION", "eu-central-1"),
        ):
            locator = s3_storage.upload_bytes(
                "pdfs/user/cv.pdf",
                b"private-pdf",
                content_type="application/pdf",
            )

        client.put_object.assert_called_once()
        request = client.put_object.call_args.kwargs
        self.assertEqual(request["Bucket"], "private-cv-bucket")
        self.assertEqual(request["Key"], "pdfs/user/cv.pdf")
        self.assertNotIn("ACL", request)
        self.assertEqual(
            locator,
            "https://private-cv-bucket.s3.eu-central-1.amazonaws.com/pdfs/user/cv.pdf",
        )


if __name__ == "__main__":
    unittest.main()
