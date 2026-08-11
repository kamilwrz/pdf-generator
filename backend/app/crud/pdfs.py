"""
Persistence helpers for Pdf documents and their canvas elements.

Element style fields that are not first-class columns are packed into
`extra_properties` JSON so the editor can evolve without a migration for every
toggle. Upserts treat the incoming live element list as authoritative: rows
missing from the payload (including client `deleted` flags) are removed so
saves cannot accumulate stale template leftovers.
"""

from sqlalchemy.orm import Session
from app.models.models import Pdf, PdfElements
from datetime import timezone
import datetime
from typing import Any, Mapping

from app.crud.images import request_image_by_id
from app.schemas.pdf_schema import PdfElement
from app.services.cv_generator_primitives import (
    DEFAULT_FLOW_SPACING,
    normalize_spacing_px,
)


def serialize_runs(element) -> list[dict[str, Any]] | None:
    """Convert an element's inline ``runs`` into JSON-safe dicts for storage.

    ``runs`` carries per-span decoration (bold/italic/underline/color) addressed
    by character offset. It is packed into ``extra_properties`` like other style
    flags, so no dedicated column or migration is needed. Returns None when the
    element has no runs, keeping the stored payload identical to pre-feature rows.
    """
    runs = getattr(element, "runs", None)
    if not runs:
        return None
    # Drop marks left at their None default so stored spans stay compact and the
    # hydrated element only carries the overrides the author actually applied.
    return [run.model_dump(exclude_none=True) for run in runs]


def elements_from_rows(rows) -> list[PdfElement]:
    """Reconstruct full `PdfElement` objects from stored `PdfElements` rows.

    Unpacks `extra_properties` back into the flat shape `PDF_Generator.
    render_elements` expects — the inverse of the packing this module does
    in `create_new_pdf` / `update_pdf_elements`. Keep both in sync: a new
    key packed into `extra_properties` there must be unpacked here too, or
    a re-rendered download (see `document_service.render_pdf_for_download`)
    will silently drop that field.
    """
    elements = []
    for row in rows:
        extra = row.extra_properties or {}
        elements.append(PdfElement(
            category=row.category,
            element_id=row.element_id,
            page=row.page or 1,
            left=row.left,
            top=row.top,
            width=row.width,
            height=row.height,
            content=row.content,
            fontFamily=row.fontFamily,
            fontSize=row.fontSize,
            color=row.color,
            src=row.src,
            backgroundColor=row.backgroundColor,
            img_id=row.img_id,
            lineHeight=extra.get("lineHeight"),
            letterSpacing=extra.get("letterSpacing"),
            bold=extra.get("bold", False),
            italic=extra.get("italic", False),
            underline=extra.get("underline", False),
            runs=extra.get("runs"),
            align=extra.get("align", "left"),
            bulletList=extra.get("bulletList", False),
            autoHeight=extra.get("autoHeight", False),
            flowRole=extra.get("flowRole"),
            flowGroup=extra.get("flowGroup"),
            isDecorativeChromeText=extra.get("isDecorativeChromeText", False),
            preserveInitialLayout=extra.get("preserveInitialLayout", False),
            alignWithText=extra.get("alignWithText"),
            id=extra.get("id"),
            photoSlot=extra.get("photoSlot"),
            photoShape=extra.get("photoShape"),
            fixedToPage=extra.get("fixedToPage", False),
            repeatOnContinuation=extra.get("repeatOnContinuation", True),
            locked=extra.get("locked", False),
            borderWidth=extra.get("borderWidth"),
            borderRadius=extra.get("borderRadius"),
            filled=extra.get("filled", False),
            shape=extra.get("shape"),
            points=extra.get("points"),
            pathKind=extra.get("pathKind"),
            curves=extra.get("curves"),
            source_id=extra.get("source_id"),
            target_id=extra.get("target_id"),
            arrow=extra.get("arrow", False),
            zIndex=extra.get("zIndex"),
            isSelected=extra.get("isSelected"),
            isMove=extra.get("isMove"),
        ))
    return elements


def serialize_spacing_px(raw: Mapping[str, Any] | None) -> dict[str, float] | None:
    """Store normalized rhythm JSON, or None when it matches generator defaults."""
    if raw is None:
        return None
    spacing = normalize_spacing_px(raw)
    payload = spacing.as_spacing_px()
    if payload == DEFAULT_FLOW_SPACING.as_spacing_px():
        return None
    return payload


def create_new_pdf(
    db: Session,
    title: str,
    user_id: int,
    file_path: str,
    elements: list,
    pages: int = 1,
    page_width: float = 595,
    page_height: float = 842,
    editor_mode: str = "freeform",
    template_id: str | None = None,
    spacing_px: Mapping[str, Any] | None = None,
    watermarked: bool = False,
) -> int:
    """Insert a Pdf row plus one PdfElements row per canvas element.

    Side effects: flush to obtain `pdf_id`, then commit. Invalid `img_id`
    references are nulled so FK violations cannot abort the whole save.
    Returns the new document id for the create/update response.
    """
    mode = "template" if editor_mode == "template" else "freeform"
    pdf_db = Pdf(
        title=title,
        file_path=file_path,
        owner_id=user_id,
        pages=pages or 1,
        page_width=page_width or 595,
        page_height=page_height or 842,
        editor_mode=mode,
        template_id=template_id,
        spacing_px=serialize_spacing_px(spacing_px),
        watermarked=watermarked,
        created_at=datetime.datetime.now(timezone.utc),
        updated_at=datetime.datetime.now(timezone.utc),
    )

    db.add(pdf_db)
    db.flush()

    for element in elements:
        img_id = element.img_id
        if element.img_id is not None and not request_image_by_id(db, element.img_id):
            img_id = None

        pdf_elements_db = PdfElements(
            pdf_id=pdf_db.id,
            element_id=element.element_id,
            category=element.category,
            page=getattr(element, "page", 1) or 1,
            left=element.left,
            top=element.top,
            width=element.width,
            height=element.height,
            content=element.content,
            fontSize=element.fontSize,
            fontFamily=element.fontFamily,
            color=element.color,
            src=element.src,
            backgroundColor=element.backgroundColor,
            img_id=img_id,
            extra_properties={
                "zIndex": element.zIndex,
                "isSelected": element.isSelected,
                "isMove": element.isMove,
                "lineHeight": element.lineHeight,
                "letterSpacing": element.letterSpacing,
                "bold": element.bold,
                "italic": element.italic,
                "underline": element.underline,
                "runs": serialize_runs(element),
                "align": element.align,
                "bulletList": element.bulletList,
                "autoHeight": element.autoHeight,
                "flowRole": getattr(element, "flowRole", None),
                "flowGroup": getattr(element, "flowGroup", None),
                "isDecorativeChromeText": getattr(element, "isDecorativeChromeText", False),
                "preserveInitialLayout": getattr(element, "preserveInitialLayout", False),
                "alignWithText": getattr(element, "alignWithText", None),
                "id": getattr(element, "id", None),
                "photoSlot": getattr(element, "photoSlot", None),
                "photoShape": getattr(element, "photoShape", None),
                "fixedToPage": element.fixedToPage,
                "repeatOnContinuation": getattr(element, "repeatOnContinuation", True),
                "locked": getattr(element, "locked", False),
                "borderWidth": element.borderWidth,
                "borderRadius": getattr(element, "borderRadius", None),
                "filled": getattr(element, "filled", False),
                "shape": getattr(element, "shape", None),
                "points": getattr(element, "points", None),
                "pathKind": getattr(element, "pathKind", None),
                "curves": getattr(element, "curves", None),
                "source_id": element.source_id,
                "target_id": element.target_id,
                "arrow": element.arrow,
            },
        )
        db.add(pdf_elements_db)

    db.commit()
    return pdf_db.id


def request_pdf_by_id(db: Session, pdf_id: int):
    """Return a single Pdf row by primary key, or None."""
    return db.query(Pdf).filter(Pdf.id == pdf_id).first()


def request_pdfs_by_id(db: Session, user_id: int):
    """Return all Pdf rows owned by `user_id` (My Docs list)."""
    return db.query(Pdf).filter(Pdf.owner_id == user_id).all()


def delete_pdf_by_id(db: Session, pdf_id: int) -> None:
    """Delete all elements for a document, then the Pdf row itself.

    Callers are responsible for removing the filesystem/S3 object afterward.
    """
    db.query(PdfElements).filter(PdfElements.pdf_id == pdf_id).delete()
    db.query(Pdf).filter(Pdf.id == pdf_id).delete()
    db.commit()


def request_pdf_by_id_show(db: Session, pdf_id: int):
    """Return every PdfElements row for a document (editor hydrate payload)."""
    return db.query(PdfElements).filter(PdfElements.pdf_id == pdf_id).all()


def request_pdf_elements_by_element_id(db: Session, pdf_id: int) -> dict:
    """Map client `element_id` → ORM row for efficient upsert matching.

    Ordered by the auto-incrementing primary key so the returned dict's
    insertion order matches the original client paint order. `create_new_pdf`
    inserts rows in the exact order of the client's `elements` list, so `id`
    is a reliable proxy for that order. This matters because callers such as
    `document_service.render_pdf_for_download` pass `.values()` straight into
    `elements_from_rows` -> `render_elements`, which draws strictly in list
    order (no z-index sort) — without this ordering, an unordered database
    read could silently swap the stacking order of overlapping elements in a
    self-healed re-render, diverging from the last real save.
    """
    existing_by_id = {
        e.element_id: e
        for e in (
            db.query(PdfElements)
            .filter(PdfElements.pdf_id == pdf_id)
            .order_by(PdfElements.id)
            .all()
        )
    }
    return existing_by_id


def update_pdf_elements(db: Session, elements: list, existing_elements: dict, pdf_id: int) -> None:
    """Sync DB elements to the live client set for one PDF.

    The incoming LIVE elements are the authoritative set. Anything in the DB
    that is not among them (elements the client dropped after a template swap,
    or ones flagged deleted) must be removed — otherwise every save appends and
    the document accumulates stale rows.

    Does not commit; callers commit after updating related Pdf metadata.
    """
    incoming_live = {
        el.element_id: el for el in elements
        if getattr(el, "deleted", False) != True and el.element_id is not None
    }
    for eid in list(existing_elements.keys()):
        if eid not in incoming_live:
            db.query(PdfElements).filter(
                PdfElements.pdf_id == pdf_id, PdfElements.element_id == eid
            ).delete()

    for element in incoming_live.values():
        img_id = element.img_id
        if element.img_id is not None and not request_image_by_id(db, element.img_id):
            img_id = None

        if element.element_id not in existing_elements:
            pdf_elements = PdfElements(
                pdf_id=pdf_id,
                element_id=element.element_id,
                category=element.category,
                page=getattr(element, "page", 1) or 1,
                left=element.left,
                top=element.top,
                width=element.width,
                height=element.height,
                content=element.content,
                fontSize=element.fontSize,
                fontFamily=element.fontFamily,
                color=element.color,
                src=element.src,
                backgroundColor=element.backgroundColor,
                img_id=img_id,
                extra_properties={
                    "zIndex": element.zIndex,
                    "isSelected": element.isSelected,
                    "isMove": element.isMove,
                    "lineHeight": element.lineHeight,
                    "letterSpacing": element.letterSpacing,
                    "bold": element.bold,
                    "italic": element.italic,
                    "underline": element.underline,
                    "runs": serialize_runs(element),
                    "align": element.align,
                    "bulletList": element.bulletList,
                    "autoHeight": element.autoHeight,
                    "flowRole": getattr(element, "flowRole", None),
                    "flowGroup": getattr(element, "flowGroup", None),
                    "isDecorativeChromeText": getattr(element, "isDecorativeChromeText", False),
                    "preserveInitialLayout": getattr(element, "preserveInitialLayout", False),
                    "alignWithText": getattr(element, "alignWithText", None),
                    "id": getattr(element, "id", None),
                    "photoSlot": getattr(element, "photoSlot", None),
                    "photoShape": getattr(element, "photoShape", None),
                    "fixedToPage": element.fixedToPage,
                    "repeatOnContinuation": getattr(element, "repeatOnContinuation", True),
                    "locked": getattr(element, "locked", False),
                    "borderWidth": element.borderWidth,
                    "borderRadius": getattr(element, "borderRadius", None),
                    "filled": getattr(element, "filled", False),
                    "shape": getattr(element, "shape", None),
                    "points": getattr(element, "points", None),
                    "pathKind": getattr(element, "pathKind", None),
                    "curves": getattr(element, "curves", None),
                    "source_id": element.source_id,
                    "target_id": element.target_id,
                    "arrow": element.arrow,
                },
            )
            db.add(pdf_elements)
        else:
            existing_row = existing_elements[element.element_id]
            existing_row.page = getattr(element, "page", 1) or 1
            existing_row.left = element.left
            existing_row.top = element.top
            existing_row.width = element.width
            existing_row.height = element.height
            existing_row.content = element.content
            existing_row.fontSize = element.fontSize
            existing_row.fontFamily = element.fontFamily
            existing_row.color = element.color
            existing_row.src = element.src
            existing_row.backgroundColor = element.backgroundColor
            existing_row.img_id = img_id
            existing_row.extra_properties = {
                "zIndex": element.zIndex,
                "isSelected": element.isSelected,
                "isMove": element.isMove,
                "lineHeight": element.lineHeight,
                "letterSpacing": element.letterSpacing,
                "bold": element.bold,
                "italic": element.italic,
                "underline": element.underline,
                "runs": serialize_runs(element),
                "align": element.align,
                "bulletList": element.bulletList,
                "autoHeight": element.autoHeight,
                "flowRole": getattr(element, "flowRole", None),
                "flowGroup": getattr(element, "flowGroup", None),
                "isDecorativeChromeText": getattr(element, "isDecorativeChromeText", False),
                "preserveInitialLayout": getattr(element, "preserveInitialLayout", False),
                "alignWithText": getattr(element, "alignWithText", None),
                "id": getattr(element, "id", None),
                "photoSlot": getattr(element, "photoSlot", None),
                "photoShape": getattr(element, "photoShape", None),
                "fixedToPage": element.fixedToPage,
                "repeatOnContinuation": getattr(element, "repeatOnContinuation", True),
                "locked": getattr(element, "locked", False),
                "borderWidth": element.borderWidth,
                "borderRadius": getattr(element, "borderRadius", None),
                "filled": getattr(element, "filled", False),
                "shape": getattr(element, "shape", None),
                "points": getattr(element, "points", None),
                "pathKind": getattr(element, "pathKind", None),
                "curves": getattr(element, "curves", None),
                "source_id": element.source_id,
                "target_id": element.target_id,
                "arrow": element.arrow,
            }
