"""
Pydantic contracts for canvas PDF create/update payloads.

Field names intentionally mirror the React canvas element shape (camelCase)
so the frontend can POST its A4 state with minimal mapping. Units for
geometry and typography are CSS pixels that map 1:1 to PDF points on A4.

`PdfElement` is the single source of truth for the API boundary. Export JSON
Schema via ``python -m app.schemas.export_pdf_element_schema`` (written to
``shared/pdf-element.schema.json``) so the frontend can mirror the same
category / identity rules without TypeScript.
"""

from typing import Literal, Optional
from pydantic import BaseModel, Field

# Categories the ReportLab renderer and frontend factories understand.
ElementCategory = Literal[
    "text",
    "textarea",
    "line",
    "rectangle",
    "circle",
    "ellipse",
    "connector",
    "image",
]


class PdfElement(BaseModel):
    """One canvas element as sent by the editor.

    ``category`` and ``element_id`` are required so upserts and the PDF
    renderer never receive anonymous rows. Other fields stay optional because
    not every category uses every property; unused optionals stay null and are
    ignored by the renderer. Style flags that lack dedicated DB columns are
    later packed into ``PdfElements.extra_properties``.
    """

    category: ElementCategory
    # Client nanoid — stable across autosaves for upsert matching.
    element_id: str = Field(..., min_length=1)
    # 1-based page index matching the multi-page editor.
    page: Optional[int] = 1
    # Top-left origin, same coordinate system as the React A4 canvas.
    left: Optional[float] = None
    top: Optional[float] = None
    fontFamily: Optional[str] = None
    fontSize: Optional[float] = None
    color: Optional[str] = None
    content: Optional[str] = None
    # textarea: leading and tracking in px.
    lineHeight: Optional[float] = None
    letterSpacing: Optional[float] = None
    bold: Optional[bool] = False
    italic: Optional[bool] = False
    underline: Optional[bool] = False
    # textarea: left | center | right | justify
    align: Optional[str] = "left"
    # Hang indent for lines that start with a bullet marker.
    bulletList: Optional[bool] = False
    # Template fields whose height follows content and participates in reflow.
    autoHeight: Optional[bool] = False
    # Flow classifier used by reflow: "section-chrome" or "content".
    flowRole: Optional[str] = None
    # Preserve deterministic backend pagination on the first canvas mount.
    preserveInitialLayout: Optional[bool] = False
    # Iconic images: True = optical text alignment; False = authored top as-is.
    alignWithText: Optional[bool] = None
    # Template chrome: backgrounds, frames, page numbers — not user chrome.
    fixedToPage: Optional[bool] = False
    # False keeps first-page masthead chrome out of auto-created continuations.
    repeatOnContinuation: Optional[bool] = True
    # Blocks user and AI layout moves/edits when true.
    locked: Optional[bool] = False
    width: Optional[float | str] = None
    height: Optional[float | str] = None
    # Fill or stroke colour depending on category (line/rect/ellipse).
    backgroundColor: Optional[str] = None
    # Rectangle outline thickness in px.
    borderWidth: Optional[float] = None
    # Rectangle corner radius in px. None/0 renders square corners; a positive
    # value draws a rounded outline (used by tag/pill chrome such as Harbor's
    # skill pills). Ignored by non-rectangle categories.
    borderRadius: Optional[float] = None
    # Circle/ellipse: solid fill when true, outline when false.
    filled: Optional[bool] = False
    # Connector endpoints reference other elements by client element_id.
    source_id: Optional[str] = None
    target_id: Optional[str] = None
    arrow: Optional[bool] = False
    src: Optional[str] = None
    title: Optional[str] = None
    pdf_id: Optional[int] = None
    zIndex: Optional[int] = None
    isSelected: Optional[bool] = None
    isMove: Optional[bool] = None
    img_id: Optional[int] = None
    # When true on update, the element is omitted from the live set and deleted.
    deleted: Optional[bool] = None


class PDFCreateRequest(BaseModel):
    """Create payload: full element list plus title and page geometry."""

    root: list[PdfElement]
    pdf_title: str
    pages: int = 1
    # Page size in pt; A4 portrait is the product default.
    page_width: float = 595
    page_height: float = 842


class PDFUpdateRequest(BaseModel):
    """Update/autosave payload including the existing document id."""

    pdf_id: int
    pdf_title: str
    root: list[PdfElement]
    pages: int = 1
    page_width: float = 595
    page_height: float = 842
