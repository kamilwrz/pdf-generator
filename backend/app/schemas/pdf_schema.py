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

import unicodedata
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

# These limits bound JSON parsing, validation, persistence, and ReportLab work
# while remaining well above the largest built-in multi-page CV templates. The
# transport limit is enforced before JSON decoding in ``app.main``; collection
# limits remain necessary because a compact body can still describe thousands
# of renderer operations.
MAX_PDF_REQUEST_BYTES = 4 * 1024 * 1024
MAX_PDF_ELEMENTS = 1_000
MAX_PDF_PAGES = 20
MAX_TEXT_RUNS = 2_000
MAX_RESOLVED_TEXT_LINES = 2_000
MAX_POLYGON_POINTS = 128
MAX_PATH_CURVES = 128
MAX_ELEMENT_TEXT_CHARS = 100_000
MAX_ELEMENT_ID_CHARS = 256

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


class ResolvedTextLine(BaseModel):
    """One browser-authored visual line for a textarea export.

    ``start`` / ``end`` address the unchanged plain ``content`` string. Soft
    break whitespace and explicit newline characters may sit between adjacent
    records. The payload is transient rendering metadata: editor state and the
    persisted document continue to store semantic text rather than hard wraps.
    """

    text: str = Field(..., max_length=MAX_ELEMENT_TEXT_CHARS)
    start: int = Field(..., ge=0)
    end: int = Field(..., ge=0)
    paragraphEnd: bool = False
    indent: float = Field(0.0, ge=0)
    bulletPrefix: Literal["", "• "] = ""
    # Browser-measured text start relative to the textarea's left edge. This
    # preserves right/center alignment and the exact bullet-body start.
    xOffset: Optional[float] = Field(None, ge=0)
    # Browser-measured horizontal advance of the visible line. ReportLab uses
    # it to compensate for the remaining shaping/kerning delta after preserving
    # the browser's line break and start position.
    advanceWidth: Optional[float] = Field(None, ge=0)


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
    element_id: str = Field(..., min_length=1, max_length=MAX_ELEMENT_ID_CHARS)
    # 1-based page index matching the multi-page editor.
    page: Optional[int] = Field(1, ge=1, le=MAX_PDF_PAGES)
    # Top-left origin, same coordinate system as the React A4 canvas.
    left: Optional[float] = None
    top: Optional[float] = None
    fontFamily: Optional[str] = None
    fontSize: Optional[float] = None
    color: Optional[str] = None
    content: Optional[str] = Field(None, max_length=MAX_ELEMENT_TEXT_CHARS)
    # textarea: leading and tracking in px.
    lineHeight: Optional[float] = None
    letterSpacing: Optional[float] = None
    bold: Optional[bool] = False
    italic: Optional[bool] = False
    underline: Optional[bool] = False
    # Inline decoration overlay. Empty/None keeps the element on the uniform
    # single-font fast path (identical Canvas↔PDF wrapping as before this field
    # existed). Populated only for text/textarea that carry mixed styling.
    runs: Optional[list[TextRun]] = Field(None, max_length=MAX_TEXT_RUNS)
    # Transient Chromium soft-wrap decisions attached immediately before PDF
    # rendering. The backend validates every slice and falls back to its own
    # wrapper when records are absent or inconsistent with current content.
    resolvedLines: Optional[list[ResolvedTextLine]] = Field(
        None,
        max_length=MAX_RESOLVED_TEXT_LINES,
    )
    # textarea: left | center | right | justify
    align: Optional[str] = "left"
    # Hang indent for lines that start with a bullet marker.
    bulletList: Optional[bool] = False
    # Template fields whose height follows content and participates in reflow.
    autoHeight: Optional[bool] = False
    # Flow classifier used by reflow, including non-flowing record overlays and
    # section backgrounds that remain attached to their textarea anchor.
    flowRole: Optional[str] = None
    # Two-column rail tag: "sidebar" keeps body copy on the packSidebarLane
    # cursor. Without it, only sidebar-chrome kickers reorder and rail body
    # is left behind after a save/reload that drops unpersisted fields.
    flowLane: Optional[str] = None
    # Keep-together id for a multi-element record (title/meta/body). Reflow
    # moves the whole group across page breaks instead of splitting it.
    flowGroup: Optional[str] = None
    # Structural-editor identity for user-created sections. These fields have
    # no visual effect in ReportLab; they let the reopened browser reconstruct
    # the section type and keep its add/remove controls available.
    editorAddedSection: Optional[bool] = False
    editorSectionId: Optional[str] = Field(
        None,
        max_length=MAX_ELEMENT_ID_CHARS,
    )
    editorSectionLayout: Optional[str] = None
    # Domain preset selected in Add Section. Layout remains the geometry
    # contract; this value restores field-specific guidance for later inserts.
    editorSectionType: Optional[str] = Field(None, max_length=64)
    # Fixed-column grid geometry belongs to the section heading, while the
    # entry/link fields belong to its cells. Persisting both sides avoids
    # inferring a one-cell grid as a one-column layout after save/reopen.
    editorGridColumns: Optional[int] = Field(None, ge=1, le=12)
    editorGridRecordWidth: Optional[float] = None
    editorGridBodyLeft: Optional[float] = None
    editorGridEntry: Optional[bool] = False
    editorAddedGridEntry: Optional[bool] = False
    gridSectionId: Optional[str] = Field(
        None,
        max_length=MAX_ELEMENT_ID_CHARS,
    )
    gridColumns: Optional[int] = Field(None, ge=1, le=12)
    gridGutter: Optional[float] = None
    gridWidth: Optional[float] = None
    gridLeft: Optional[float] = None
    gridKind: Optional[str] = None
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
    # Reversible profile-photo editor state. Hidden members retain geometry;
    # placeholder/home descriptors restore the exact template composition.
    photoSlotHidden: Optional[bool] = False
    photoPlaceholder: Optional[dict[str, Any]] = None
    profilePhotoMainContactBand: Optional[dict[str, Any]] = None
    profilePhotoMainMastheadIdentity: Optional[dict[str, Any]] = None
    photoLayoutHome: Optional[dict[str, Any]] = None
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
    # Rectangle or image corner radius in px. Shape rectangles use it for
    # rounded chrome; image elements use the same value for matching canvas
    # and ReportLab clipping (half a square side produces an exact circle).
    borderRadius: Optional[float] = None
    # Circle/ellipse/polygon/rectangle: solid fill when true, outline when false.
    filled: Optional[bool] = False
    # Freeform polygon preset id (`triangle` / `diamond` / `hexagon`).
    shape: Optional[str] = None
    # Normalized polygon vertices in unit-square space ``[[x, y], …]``.
    points: Optional[list[list[float]]] = Field(
        None,
        max_length=MAX_POLYGON_POINTS,
    )
    # Freeform cubic path preset id (`wave` / `arc` / `flourish`).
    pathKind: Optional[str] = None
    # Cubic path segments in unit-square space (``M`` / ``C`` dicts).
    curves: Optional[list[dict[str, Any]]] = Field(
        None,
        max_length=MAX_PATH_CURVES,
    )
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
    # Display-and-render casing transform (Phase 3 masthead identity). "uppercase"
    # makes the canvas (CSS) and the PDF renderer uppercase the drawn glyphs while
    # `content` keeps its original case, so the name-case toggle is reversible.
    textTransform: Optional[str] = None
    # Masthead identity (Phase 3). `mastheadRole` marks the name/title elements;
    # `mastheadBandId` links them + the identity anchor; `mastheadIdentity` is the
    # reflow descriptor carried only on that anchor (flowRole "masthead-anchor").
    mastheadRole: Optional[str] = None
    mastheadBandId: Optional[str] = None
    mastheadIdentity: Optional[dict[str, Any]] = None
    # Template-scoped appearance intent and immutable typography baselines.
    # These editor-only properties are persisted in `extra_properties`; the
    # renderer safely ignores them while saved CVs retain reversible presets.
    appearanceTemplateId: Optional[str] = None
    appearanceSettings: Optional[dict[str, Any]] = None
    appearanceTypographyRole: Optional[str] = None
    appearanceBaseFontSize: Optional[float] = None
    appearanceBaseLineHeight: Optional[float] = None
    # Empty starter fields keep guidance in editor metadata instead of visible
    # content. Bindings provide exact cv_data paths, including composite rows.
    placeholder: Optional[str] = Field(None, max_length=MAX_ELEMENT_TEXT_CHARS)
    starterPlaceholder: Optional[bool] = False
    starterSectionKey: Optional[str] = Field(None, max_length=120)
    cvDataBindings: Optional[list[dict[str, Any]]] = Field(None, max_length=12)


EditorMode = Literal["template", "freeform"]


def _normalize_pdf_title(value: str) -> str:
    """Return a display-only PDF title that can never act as a path segment."""
    if not isinstance(value, str):
        raise ValueError("Tytuł dokumentu musi być tekstem.")
    normalized = unicodedata.normalize("NFC", value).strip()
    if not normalized:
        raise ValueError("Tytuł dokumentu nie może być pusty.")
    if "/" in normalized or "\\" in normalized:
        raise ValueError("Tytuł dokumentu nie może zawierać separatorów ścieżki.")
    if any(unicodedata.category(char) == "Cc" for char in normalized):
        raise ValueError("Tytuł dokumentu nie może zawierać znaków sterujących.")
    return normalized


class PDFCreateRequest(BaseModel):
    """Create payload: full element list plus title and page geometry."""

    # Optional only for render-on-demand. It proves that a downgraded Free user
    # is rendering an existing owned paid-template document. `/create_pdf`
    # never uses it as an entitlement exception.
    pdf_id: Optional[int] = None
    root: list[PdfElement] = Field(..., max_length=MAX_PDF_ELEMENTS)
    # Optional compact render-only copy. `root` remains the authoritative
    # editable document persisted to the database.
    render_root: Optional[list[PdfElement]] = Field(None, max_length=MAX_PDF_ELEMENTS)
    pdf_title: str = Field(..., min_length=1, max_length=120)
    pages: int = Field(1, ge=1, le=MAX_PDF_PAGES)
    # Page size in pt; A4 portrait is the product default.
    page_width: float = Field(595, gt=0, le=5_000)
    page_height: float = Field(842, gt=0, le=5_000)
    # Constrained template edit vs freeform project.
    editor_mode: EditorMode = "freeform"
    # Originating template slug when the document came from a generator.
    template_id: Optional[str] = None
    # Optional vertical rhythm override (stack/record/section/after_rule px).
    spacing_px: Optional[dict[str, Any]] = None
    # Normalized content profile used when changing the document's template.
    # It is intentionally separate from the geometric canvas element list.
    cv_data: Optional[dict[str, Any]] = None
    # Provenance from a private extraction snapshot, set only after ownership
    # validation by the document creation route.
    source_import_id: Optional[int] = None

    @field_validator("pdf_title", mode="before")
    @classmethod
    def _validate_pdf_title(cls, value: str) -> str:
        return _normalize_pdf_title(value)

    @model_validator(mode="after")
    def _require_template_for_template_mode(self):
        """A constrained editor document must identify its template."""
        if self.editor_mode == "template" and not str(self.template_id or "").strip():
            raise ValueError("Tryb szablonu wymaga identyfikatora szablonu.")
        if self.template_id is not None:
            self.template_id = self.template_id.strip() or None
        return self


class PDFUpdateRequest(BaseModel):
    """Update/autosave payload including the existing document id."""

    pdf_id: int
    expected_revision: int = Field(..., ge=1)
    pdf_title: str = Field(..., min_length=1, max_length=120)
    root: list[PdfElement] = Field(..., max_length=MAX_PDF_ELEMENTS)
    render_root: Optional[list[PdfElement]] = Field(None, max_length=MAX_PDF_ELEMENTS)
    pages: int = Field(1, ge=1, le=MAX_PDF_PAGES)
    page_width: float = Field(595, gt=0, le=5_000)
    page_height: float = Field(842, gt=0, le=5_000)
    editor_mode: EditorMode = "freeform"
    template_id: Optional[str] = None
    spacing_px: Optional[dict[str, Any]] = None
    # Updated alongside the canvas only after an explicit user save.
    cv_data: Optional[dict[str, Any]] = None

    @field_validator("pdf_title", mode="before")
    @classmethod
    def _validate_pdf_title(cls, value: str) -> str:
        return _normalize_pdf_title(value)

    @model_validator(mode="after")
    def _require_template_for_template_mode(self):
        """Reject ambiguous template-mode writes before persistence."""
        if self.editor_mode == "template" and not str(self.template_id or "").strip():
            raise ValueError("Tryb szablonu wymaga identyfikatora szablonu.")
        if self.template_id is not None:
            self.template_id = self.template_id.strip() or None
        return self
