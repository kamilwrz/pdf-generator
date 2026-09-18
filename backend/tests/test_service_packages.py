"""Exercise package imports and bundled resources in a fresh Python process."""
from pathlib import Path
import os
import subprocess
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]


def test_service_packages_boot_and_render_outside_the_backend_directory(tmp_path):
    """Catch import-order and resource-path regressions hidden by pytest caches.

    Importing the application must not run maintenance jobs or need the current
    directory to locate fonts. A real PDF round trip checks font registration
    after every service package has loaded; providers and databases are unused.
    """
    environment = {
        **os.environ,
        "PYTHONPATH": str(BACKEND_ROOT),
        "DATABASE_URL": "sqlite:///:memory:",
        "SECRET_KEY": "service-package-test-secret-key-32chars",
        "OPENAI_API_KEY": "test-service-packages-no-provider-calls",
        "ENVIRONMENT": "development",
        "S3_BUCKET": "",
    }
    completed = subprocess.run(
        [sys.executable, "-c", """
import importlib
import io
import pkgutil
from types import SimpleNamespace
import fitz
from reportlab.pdfgen.canvas import Canvas
import app.services

# Walk all packages before main so imports cannot rely on router import order.
for module in pkgutil.walk_packages(app.services.__path__, "app.services."):
    importlib.import_module(module.name)
from app.main import app
from app.jobs import bootstrap, storage_cleanup
from app.core.paths import BACKEND_ROOT
from app.core.readiness import readiness_probe
from app.services.documents.rendering.pdf import PDF_Generator

assert (BACKEND_ROOT / "alembic.ini").is_file()
assert (BACKEND_ROOT / "fonts").is_dir()
buffer = io.BytesIO()
renderer = PDF_Generator(SimpleNamespace(page_height=842), Canvas(buffer, pagesize=(595, 842)))
expected = "Zażółć gęślą jaźń"
renderer.renderText(40, 40, "Helvetica", 12, "#000000", expected)
renderer.generatePDF()
with fitz.open(stream=buffer.getvalue(), filetype="pdf") as document:
    assert expected in document[0].get_text()
"""],
        cwd=tmp_path,
        env=environment,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
        check=False,
    )
    assert completed.returncode == 0, completed.stdout + completed.stderr
