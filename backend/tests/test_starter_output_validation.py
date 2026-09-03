"""Server-side backup for the starter name output requirement."""
import pytest
from fastapi import HTTPException

from app.schemas.pdf_schema import PdfElement
from app.services.document_service import _require_starter_name


def starter_name(content: str) -> PdfElement:
    return PdfElement(
        category="text",
        element_id="starter-name",
        content=content,
        cvDataBindings=[{"path": ["name"], "placeholder": "Imię i nazwisko"}],
        starterPlaceholder=not bool(content.strip()),
    )


def test_empty_starter_name_is_rejected():
    with pytest.raises(HTTPException) as error:
        _require_starter_name([starter_name("")])
    assert error.value.status_code == 400
    assert error.value.detail["code"] == "starter_name_required"


def test_real_starter_name_and_legacy_documents_are_allowed():
    _require_starter_name([starter_name("Ada Lovelace")])
    _require_starter_name([
        PdfElement(category="text", element_id="legacy-name", content="Ada Lovelace"),
    ])
