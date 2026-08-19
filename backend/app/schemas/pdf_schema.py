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

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field

# Categories the ReportLab renderer and frontend factories understand.
ElementCategory = Literal[
    "text",
    "textarea",
    "line",
    "rectangle",
    "circle",
    "ellipse",
    "polygon",
    "path",
    "connector",
    "image",
]


class TextRun(BaseModel):
    """One inline-formatted span inside a ``text`` / ``textarea`` element.

    A run is a style overlay addressed by character offset into ``content``;
    ``content`` itself stays plain text. Offsets are half-open ``[start, end)``
    over the sanitized content string. Only the marks a run declares override
    the element's base style — an absent mark falls through to the element-level
    ``bold`` / ``italic`` / ``underline`` / ``color``.

    Runs are normalized before persistence: non-overlapping, sorted, clamped to
    the content length, with empty spans dropped and adjacent equal spans merged.
    When an element carries no runs, every renderer path takes the original
    single-font fast path, so unformatted documents are byte-for-byte unchanged.
    """

    start: int = Field(..., ge=0)
    end: int = Field(..., ge=0)
    bold: Optional[bool] = None
    italic: Optional[bool] = None
    underline: Optional[bool] = None
    # Hex colour; overrides the element base colour for this span only.
    color: Optional[str] = None


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
    # Inline decoration overlay. Empty/None keeps the element on the uniform
    # single-font fast path (identical Canvas↔PDF wrapping as before this field
    # existed). Populated only for text/textarea that carry mixed styling.
    runs: Optional[list[TextRun]] = None
    # textarea: left | center | right | justify
    align: Optional[str] = "left"
    # Hang indent for lines that start with a bullet marker.
    bulletList: Optional[bool] = False
    # Template fields whose height follows content and participates in reflow.
    autoHeight: Optional[bool] = False
    # Flow classifier used by reflow: "section-chrome" or "content".
    flowRole: Optional[str] = None
    # Two-column rail tag: "sidebar" keeps body copy on the packSidebarLane
    # cursor. Without it, only sidebar-chrome kickers reorder and rail body
    # is left behind after a save/reload that drops unpersisted fields.
    flowLane: Optional[str] = None
    # Keep-together id for a multi-element record (title/meta/body). Reflow
    # moves the whole group across page breaks instead of splitting it.
    flowGroup: Optional[str] = None
    # Monument-style ordinal badge ("01", "02", …): chrome text that must not
    # be listed as its own section title by the structural editor.
    isDecorativeChromeText: Optional[bool] = False
    # Preserve deterministic backend pagination on the first canvas mount.
    preserveInitialLayout: Optional[bool] = False
    # Iconic images: True = optical text alignment; False = authored top as-is.
    alignWithText: Optional[bool] = None
    # Stable template semantic key (e.g. "slate-photo-frame"). Distinct from
    # the client nanoid in ``element_id``.
    id: Optional[str] = None
    # Profile-photo contract: "frame" | "glyph" | "ornament" | "image".
    photoSlot: Optional[str] = None
    # Optional shape hint for photo fitting: "circle" | "ornament-frame".
    photoShape: Optional[str] = None
    # CSS object-fit for images: "fill" | "cover" | "contain". Profile photo
    # slots use "cover" so uploads fill the frame without stretching.
    objectFit: Optional[str] = None
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
    # Circle/ellipse/polygon/rectangle: solid fill when true, outline when false.
    filled: Optional[bool] = False
    # Freeform polygon preset id (`triangle` / `diamond` / `hexagon`).
    shape: Optional[str] = None
    # Normalized polygon vertices in unit-square space ``[[x, y], …]``.
    points: Optional[list[list[float]]] = None
    # Freeform cubic path preset id (`wave` / `arc` / `flourish`).
    pathKind: Optional[str] = None
    # Cubic path segments in unit-square space (``M`` / ``C`` dicts).
    curves: Optional[list[dict[str, Any]]] = None
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
    # Contact-band identity (Phase 1 contact channel manager). Present on both
    # the icon and label of a channel so they move/delete as a unit.
    contactChannel: Optional[str] = None
    contactBandId: Optional[str] = None
    # Band layout descriptor — set only on the zero-footprint band-anchor element
    # (flowRole "masthead-anchor"). Drives client-side reflow on add/remove.
    contactBand: Optional[dict[str, Any]] = None


EditorMode = Literal["template", "freeform"]


class PDFCreateRequest(BaseModel):
    """Create payload: full element list plus title and page geometry."""

    root: list[PdfElement]
    pdf_title: str
    pages: int = 1
    # Page size in pt; A4 portrait is the product default.
    page_width: float = 595
    page_height: float = 842
    # Constrained template edit vs freeform project.
    editor_mode: EditorMode = "freeform"
    # Originating template slug when the document came from a generator.
    template_id: Optional[str] = None
    # Optional vertical rhythm override (stack/record/section/after_rule px).
    spacing_px: Optional[dict[str, Any]] = None


class PDFUpdateRequest(BaseModel):
    """Update/autosave payload including the existing document id."""

    pdf_id: int
    pdf_title: str
    root: list[PdfElement]
    pages: int = 1
    page_width: float = 595
    page_height: float = 842
    editor_mode: EditorMode = "freeform"
    template_id: Optional[str] = None
    spacing_px: Optional[dict[str, Any]] = None
