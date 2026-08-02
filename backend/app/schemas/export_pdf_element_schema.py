"""Export ``PdfElement`` JSON Schema for the FE / CI contract.

Run from the backend package root:

    python -m app.schemas.export_pdf_element_schema

Writes ``shared/pdf-element.schema.json`` at the repository root.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.schemas.pdf_schema import PdfElement

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_PATH = REPO_ROOT / "shared" / "pdf-element.schema.json"


def export_schema() -> Path:
    """Write the current Pydantic JSON Schema and return the output path."""
    schema = PdfElement.model_json_schema()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(schema, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return OUT_PATH


if __name__ == "__main__":
    path = export_schema()
    print(f"Wrote {path}")
