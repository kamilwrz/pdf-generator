"""Render selected frontend starter layouts to PNG template mockups.

The element arrays are dumped from the frontend source of truth
(via frontend/scripts/dump-iconic-templates.mjs)
so the mockup pixel-matches what a user sees when they pick the template in
the editor. Rendering goes through the same ReportLab pipeline used for real
exports (`build_pdf_to_buffer`), then PyMuPDF rasterizes page 1 to PNG at the
595x842 (72 dpi) size used by every other template-mockups/*.png asset.

Not part of the app build or test suite — run manually after editing
one of the arrays exported by the dump script:

    node frontend/scripts/dump-iconic-templates.mjs
    python scripts/render_iconic_mockups.py
    python scripts/render_iconic_mockups.py cadenza
"""

from __future__ import annotations

import json
import re
import sys
import types
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
sys.path.insert(0, str(BACKEND_DIR))

import fitz  # PyMuPDF
from reportlab.pdfgen import canvas as rl_canvas

from app.schemas.pdf_schema import PdfElement
from app.services.pdf_generator import PDF_Generator
from app.utils.image_src_to_path import image_src_to_local_path

ELEMENTS_JSON = REPO_ROOT / "frontend" / "scripts" / "iconic-templates.json"
OUTPUT_DIR = REPO_ROOT / "frontend" / "public" / "template-mockups"
FRONTEND_TEMPLATES = REPO_ROOT / "frontend" / "src" / "templates"

# Match the exact pixel size of every other frontend/public/template-mockups/*.png
# so the marketing grid and the in-app picker stay visually consistent.
PAGE_W_PT, PAGE_H_PT = 595, 842
# Supersample then downscale for crisper text than a direct 72 dpi render.
RENDER_SCALE = 3


def load_generated_starter(template_id: str) -> list[dict] | None:
    """Read one generator-owned JS starter when the shared dump is stale.

    ``regenerate_template_starters.py`` writes its element array as plain JSON
    after a ``const <ID>_ELEMENTS =`` assignment. Parsing only that delimited
    payload keeps this fallback deterministic and avoids evaluating JavaScript.
    It is used for isolated mockup work when Node.js is unavailable; the normal
    full-catalog path still consumes ``iconic-templates.json``.
    """
    source_path = FRONTEND_TEMPLATES / f"{template_id}.js"
    if not source_path.exists():
        return None
    source = source_path.read_text(encoding="utf-8")
    match = re.search(
        r"const\s+[A-Z0-9_]+_ELEMENTS\s*=\s*(\[.*?\]);\s*\n\s*export\s+const",
        source,
        flags=re.DOTALL,
    )
    if not match:
        return None
    parsed = json.loads(match.group(1))
    return parsed if isinstance(parsed, list) else None


def render_theme(theme: str, elements_data: list[dict]) -> bytes:
    """Render one frontend template's element list to PDF bytes via ReportLab."""
    # The frontend template arrays are authored without `element_id` — the editor
    # loader assigns those at load time. `PdfElement` requires the field, so
    # synthesize a stable per-position id here. It only identifies elements for
    # upserts and never affects the rendered geometry or colours.
    # Nova keeps the same empty photo slot as the editor starter. Do not inject
    # a portrait raster here — the picker mockup must match the live canvas.
    elements = [
        PdfElement(**{"element_id": f"{theme}-{index}", **el})
        for index, el in enumerate(elements_data)
    ]
    pdf_data = types.SimpleNamespace(
        pdf_title=f"template-mockup-{theme}",
        pages=1,
        page_width=PAGE_W_PT,
        page_height=PAGE_H_PT,
    )
    buffer_path = REPO_ROOT / f"_tmp_{theme}.pdf"
    c = rl_canvas.Canvas(str(buffer_path), pagesize=(PAGE_W_PT, PAGE_H_PT))
    pdf = PDF_Generator(pdf_data, c)
    pdf.setTitle(pdf_data.pdf_title)
    pdf.render_elements(elements, image_src_to_local_path, pdf_data.pages)
    pdf_bytes = buffer_path.read_bytes()
    buffer_path.unlink()
    return pdf_bytes


def rasterize_first_page(pdf_bytes: bytes) -> bytes:
    """Rasterize page 1 to a 595x842 RGB PNG, supersampled for sharper text."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    matrix = fitz.Matrix(RENDER_SCALE, RENDER_SCALE)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    doc.close()
    from PIL import Image
    img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    img = img.resize((PAGE_W_PT, PAGE_H_PT), Image.LANCZOS)
    from io import BytesIO
    out = BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def main():
    data = json.loads(ELEMENTS_JSON.read_text(encoding="utf-8"))
    requested = sys.argv[1:]
    # A targeted render follows the requested starter file even when the
    # catalog dump still contains an older copy. This is the normal workflow
    # after changing one template and prevents its checked-in picker image
    # from silently lagging behind the editor canvas.
    for theme in requested:
        generated = load_generated_starter(theme)
        if generated is not None:
            data[theme] = generated
    unknown = [theme for theme in requested if theme not in data]
    if unknown:
        raise SystemExit(
            f"Unknown template id(s): {', '.join(unknown)}. Available: {', '.join(data)}"
        )
    selected_themes = requested or list(data)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for theme in selected_themes:
        elements = data[theme]
        pdf_bytes = render_theme(theme, elements)
        png_bytes = rasterize_first_page(pdf_bytes)
        out_path = OUTPUT_DIR / f"{theme}.png"
        out_path.write_bytes(png_bytes)
        print(f"wrote {out_path} ({len(png_bytes)} bytes)")


if __name__ == "__main__":
    main()
