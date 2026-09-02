"""
Persistence helpers for Pdf documents and their canvas elements.

Element style fields that are not first-class columns are packed into
`extra_properties` JSON so the editor can evolve without a migration for every
toggle. Upserts treat the incoming live element list as authoritative: rows
missing from the payload (including client `deleted` flags) are removed so
saves cannot accumulate stale template leftovers.
"""

from sqlalchemy.orm import Session
from app.models.models import Image, Pdf, PdfElements, StorageCleanupJob
from datetime import timezone
import datetime
from typing import Any, Mapping

from app.schemas.pdf_schema import PdfElement
from app.services.cv_generator_primitives import (
    DEFAULT_FLOW_SPACING,
    normalize_spacing_px,
)
from app.utils.document_integrity import current_template_id


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


_GRID_SECTION_EXTRA_FIELDS = (
    "editorAddedSection",
    "editorSectionId",
    "editorSectionLayout",
    "editorGridColumns",
    "editorGridRecordWidth",
    "editorGridBodyLeft",
    "editorGridEntry",
    "editorAddedGridEntry",
    "gridSectionId",
    "gridColumns",
    "gridGutter",
    "gridWidth",
    "gridLeft",
    "gridKind",
)


def _serialize_grid_section_metadata(element) -> dict[str, Any]:
    """Pack editor-only grid identity and geometry into ``extra_properties``.

    The keys intentionally remain flat because browser hydration merges
    ``extra_properties`` back into the canvas element shape. Keeping this list
    centralized prevents create, insert-on-update, and update-in-place writes
    from drifting apart when the structural editor gains metadata.
    """
    metadata = {}
    for field in _GRID_SECTION_EXTRA_FIELDS:
        value = getattr(element, field, None)
        # Missing/false markers mean "not a grid member" and are reconstructed
        # from schema defaults. Eliding them keeps ordinary canvas rows as
        # compact as they were before grid sections were introduced. Numeric
        # zero remains valid geometry and is therefore retained.
        if value is None or value is False:
            continue
        metadata[field] = value
    return metadata


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
            flowLane=extra.get("flowLane"),
            flowGroup=extra.get("flowGroup"),
            editorAddedSection=extra.get("editorAddedSection", False),
            editorSectionId=extra.get("editorSectionId"),
            editorSectionLayout=extra.get("editorSectionLayout"),
            editorGridColumns=extra.get("editorGridColumns"),
            editorGridRecordWidth=extra.get("editorGridRecordWidth"),
            editorGridBodyLeft=extra.get("editorGridBodyLeft"),
            editorGridEntry=extra.get("editorGridEntry", False),
            editorAddedGridEntry=extra.get("editorAddedGridEntry", False),
            gridSectionId=extra.get("gridSectionId"),
            gridColumns=extra.get("gridColumns"),
            gridGutter=extra.get("gridGutter"),
            gridWidth=extra.get("gridWidth"),
            gridLeft=extra.get("gridLeft"),
            gridKind=extra.get("gridKind"),
            isDecorativeChromeText=extra.get("isDecorativeChromeText", False),
            preserveInitialLayout=extra.get("preserveInitialLayout", False),
            alignWithText=extra.get("alignWithText"),
            id=extra.get("id"),
            photoSlot=extra.get("photoSlot"),
            photoSlotHidden=extra.get("photoSlotHidden", False),
            photoPlaceholder=extra.get("photoPlaceholder"),
            profilePhotoMainContactBand=extra.get("profilePhotoMainContactBand"),
            profilePhotoMainMastheadIdentity=extra.get("profilePhotoMainMastheadIdentity"),
            photoLayoutHome=extra.get("photoLayoutHome"),
            photoShape=extra.get("photoShape"),
            objectFit=extra.get("objectFit"),
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
            contactChannel=extra.get("contactChannel"),
            contactBandId=extra.get("contactBandId"),
            contactBand=extra.get("contactBand"),
            textTransform=extra.get("textTransform"),
            mastheadRole=extra.get("mastheadRole"),
            mastheadBandId=extra.get("mastheadBandId"),
            mastheadIdentity=extra.get("mastheadIdentity"),
            appearanceTemplateId=extra.get("appearanceTemplateId"),
            appearanceSettings=extra.get("appearanceSettings"),
            appearanceTypographyRole=extra.get("appearanceTypographyRole"),
            appearanceBaseFontSize=extra.get("appearanceBaseFontSize"),
            appearanceBaseLineHeight=extra.get("appearanceBaseLineHeight"),
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


def _valid_image_ids(db: Session, elements: list, owner_id: int | None) -> set[int]:
    """Batch-load valid image ids, optionally constrained to one document owner."""
    requested = {
        int(element.img_id)
        for element in elements
        if getattr(element, "img_id", None) is not None
    }
    if not requested:
        return set()
    query = db.query(Image.id).filter(Image.id.in_(requested))
    if owner_id is not None:
        query = query.filter(Image.owner_id == int(owner_id))
    return {int(row[0]) for row in query.all()}


def create_new_pdf(
    db: Session,
    title: str,
    user_id: int,
    file_path: str | None,
    elements: list,
    pages: int = 1,
    page_width: float = 595,
    page_height: float = 842,
    editor_mode: str = "freeform",
    template_id: str | None = None,
    spacing_px: Mapping[str, Any] | None = None,
    cv_data: Mapping[str, Any] | None = None,
    watermarked: bool = False,
    source_import_id: int | None = None,
    storage_backend: str | None = None,
    storage_key: str | None = None,
    commit: bool = True,
    origin_template_id: str | None = None,
    create_idempotency_key: str | None = None,
    create_request_hash: str | None = None,
    revision: int = 1,
) -> int:
    """Insert a Pdf row plus one PdfElements row per canvas element.

    Side effects: flush to obtain `pdf_id`; commits by default for legacy
    callers. Storage V2 callers pass ``commit=False`` so publishing bytes and
    inserting metadata share one saga boundary. Invalid or foreign ``img_id``
    references are nulled as defense in depth; API services reject them earlier.
    Returns the new document id for the create/update response.
    """
    mode = "template" if editor_mode == "template" else "freeform"
    active_template_id = current_template_id(mode, template_id)
    provenance_template_id = origin_template_id or template_id
    pdf_db = Pdf(
        title=title,
        file_path=file_path,
        storage_backend=storage_backend,
        storage_key=storage_key,
        owner_id=user_id,
        revision=revision,
        create_idempotency_key=create_idempotency_key,
        create_request_hash=create_request_hash,
        pages=pages or 1,
        page_width=page_width or 595,
        page_height=page_height or 842,
        editor_mode=mode,
        template_id=active_template_id,
        origin_template_id=provenance_template_id,
        spacing_px=serialize_spacing_px(spacing_px),
        cv_data=dict(cv_data) if cv_data is not None else None,
        watermarked=watermarked,
        source_import_id=source_import_id,
        created_at=datetime.datetime.now(timezone.utc),
        updated_at=datetime.datetime.now(timezone.utc),
    )

    db.add(pdf_db)
    db.flush()
    valid_image_ids = _valid_image_ids(db, elements, user_id)

    for element in elements:
        img_id = element.img_id
        if element.img_id is not None and int(element.img_id) not in valid_image_ids:
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
                "contactChannel": getattr(element, "contactChannel", None),
                "contactBandId": getattr(element, "contactBandId", None),
                "contactBand": getattr(element, "contactBand", None),
                "textTransform": getattr(element, "textTransform", None),
                "mastheadRole": getattr(element, "mastheadRole", None),
                "mastheadBandId": getattr(element, "mastheadBandId", None),
                "mastheadIdentity": getattr(element, "mastheadIdentity", None),
                "appearanceTemplateId": getattr(element, "appearanceTemplateId", None),
                "appearanceSettings": getattr(element, "appearanceSettings", None),
                "appearanceTypographyRole": getattr(element, "appearanceTypographyRole", None),
                "appearanceBaseFontSize": getattr(element, "appearanceBaseFontSize", None),
                "appearanceBaseLineHeight": getattr(element, "appearanceBaseLineHeight", None),
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
                "flowLane": getattr(element, "flowLane", None),
                "flowGroup": getattr(element, "flowGroup", None),
                **_serialize_grid_section_metadata(element),
                "isDecorativeChromeText": getattr(element, "isDecorativeChromeText", False),
                "preserveInitialLayout": getattr(element, "preserveInitialLayout", False),
                "alignWithText": getattr(element, "alignWithText", None),
                "id": getattr(element, "id", None),
                "photoSlot": getattr(element, "photoSlot", None),
                "photoSlotHidden": getattr(element, "photoSlotHidden", False),
                "photoPlaceholder": getattr(element, "photoPlaceholder", None),
                "profilePhotoMainContactBand": getattr(element, "profilePhotoMainContactBand", None),
                "profilePhotoMainMastheadIdentity": getattr(element, "profilePhotoMainMastheadIdentity", None),
                "photoLayoutHome": getattr(element, "photoLayoutHome", None),
                "photoShape": getattr(element, "photoShape", None),
                "objectFit": getattr(element, "objectFit", None),
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

    if commit:
        db.commit()
    return pdf_db.id


def request_pdf_by_id(db: Session, pdf_id: int):
    """Return a single Pdf row by primary key, or None."""
    return db.query(Pdf).filter(Pdf.id == pdf_id).first()


def request_pdfs_by_id(db: Session, user_id: int):
    """Return all Pdf rows owned by `user_id` (My Docs list)."""
    return db.query(Pdf).filter(Pdf.owner_id == user_id).all()


def enqueue_storage_cleanup(
    db: Session,
    cleanup_target: tuple[str, str],
    *,
    resource_kind: str = "pdf",
) -> StorageCleanupJob:
    """Stage one idempotent private-object cleanup request without committing."""
    backend, key = cleanup_target
    cleanup_job = db.query(StorageCleanupJob).filter(
        StorageCleanupJob.storage_backend == backend,
        StorageCleanupJob.storage_key == key,
    ).first()
    if cleanup_job is None:
        cleanup_job = StorageCleanupJob(
            storage_backend=backend,
            storage_key=key,
            resource_kind=resource_kind,
            status="pending",
            attempts=0,
            created_at=datetime.datetime.now(timezone.utc),
        )
        db.add(cleanup_job)
        db.flush()
    elif cleanup_job.resource_kind != resource_kind:
        # The key namespaces are disjoint. A mismatch therefore signals corrupt
        # outbox state rather than a second valid cleanup request.
        raise ValueError("Storage cleanup key is registered for another resource kind.")
    return cleanup_job


def delete_pdf_by_id(
    db: Session,
    pdf_id: int,
    *,
    owner_id: int,
    expected_revision: int,
    expected_storage_backend: str | None,
    expected_storage_key: str | None,
    expected_file_path: str | None,
    cleanup_target: tuple[str, str] | None = None,
    commit: bool = True,
) -> tuple[int | None, bool]:
    """CAS-delete one exact document snapshot and enqueue its storage object.

    Element deletion occurs in the same transaction and must be rolled back by
    the caller when the parent CAS loses. Matching revision and all storage
    pointer fields prevents a concurrent A→B update from leaving B orphaned.
    """
    db.query(PdfElements).filter(PdfElements.pdf_id == pdf_id).delete()
    deleted = db.query(Pdf).filter(
        Pdf.id == int(pdf_id),
        Pdf.owner_id == int(owner_id),
        Pdf.revision == int(expected_revision),
        Pdf.storage_backend == expected_storage_backend,
        Pdf.storage_key == expected_storage_key,
        Pdf.file_path == expected_file_path,
    ).delete(synchronize_session=False)
    if deleted != 1:
        if commit:
            db.rollback()
        return None, False

    cleanup_job = None
    if cleanup_target is not None:
        cleanup_job = enqueue_storage_cleanup(db, cleanup_target)
    if commit:
        db.commit()
    return cleanup_job.id if cleanup_job is not None else None, True


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


def update_pdf_elements(
    db: Session,
    elements: list,
    existing_elements: dict,
    pdf_id: int,
    *,
    owner_id: int | None = None,
) -> None:
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
    valid_image_ids = _valid_image_ids(db, list(incoming_live.values()), owner_id)
    for eid in list(existing_elements.keys()):
        if eid not in incoming_live:
            db.query(PdfElements).filter(
                PdfElements.pdf_id == pdf_id, PdfElements.element_id == eid
            ).delete()

    for element in incoming_live.values():
        img_id = element.img_id
        if element.img_id is not None and int(element.img_id) not in valid_image_ids:
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
                    "contactChannel": getattr(element, "contactChannel", None),
                    "contactBandId": getattr(element, "contactBandId", None),
                    "contactBand": getattr(element, "contactBand", None),
                    "textTransform": getattr(element, "textTransform", None),
                    "mastheadRole": getattr(element, "mastheadRole", None),
                    "mastheadBandId": getattr(element, "mastheadBandId", None),
                    "mastheadIdentity": getattr(element, "mastheadIdentity", None),
                    "appearanceTemplateId": getattr(element, "appearanceTemplateId", None),
                    "appearanceSettings": getattr(element, "appearanceSettings", None),
                    "appearanceTypographyRole": getattr(element, "appearanceTypographyRole", None),
                    "appearanceBaseFontSize": getattr(element, "appearanceBaseFontSize", None),
                    "appearanceBaseLineHeight": getattr(element, "appearanceBaseLineHeight", None),
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
                    "flowLane": getattr(element, "flowLane", None),
                    "flowGroup": getattr(element, "flowGroup", None),
                    **_serialize_grid_section_metadata(element),
                    "isDecorativeChromeText": getattr(element, "isDecorativeChromeText", False),
                    "preserveInitialLayout": getattr(element, "preserveInitialLayout", False),
                    "alignWithText": getattr(element, "alignWithText", None),
                    "id": getattr(element, "id", None),
                    "photoSlot": getattr(element, "photoSlot", None),
                    "photoSlotHidden": getattr(element, "photoSlotHidden", False),
                    "photoPlaceholder": getattr(element, "photoPlaceholder", None),
                    "profilePhotoMainContactBand": getattr(element, "profilePhotoMainContactBand", None),
                    "profilePhotoMainMastheadIdentity": getattr(element, "profilePhotoMainMastheadIdentity", None),
                    "photoLayoutHome": getattr(element, "photoLayoutHome", None),
                    "photoShape": getattr(element, "photoShape", None),
                    "objectFit": getattr(element, "objectFit", None),
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
                "contactChannel": getattr(element, "contactChannel", None),
                "contactBandId": getattr(element, "contactBandId", None),
                "contactBand": getattr(element, "contactBand", None),
                "textTransform": getattr(element, "textTransform", None),
                "mastheadRole": getattr(element, "mastheadRole", None),
                "mastheadBandId": getattr(element, "mastheadBandId", None),
                "mastheadIdentity": getattr(element, "mastheadIdentity", None),
                "appearanceTemplateId": getattr(element, "appearanceTemplateId", None),
                "appearanceSettings": getattr(element, "appearanceSettings", None),
                "appearanceTypographyRole": getattr(element, "appearanceTypographyRole", None),
                "appearanceBaseFontSize": getattr(element, "appearanceBaseFontSize", None),
                "appearanceBaseLineHeight": getattr(element, "appearanceBaseLineHeight", None),
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
                "flowLane": getattr(element, "flowLane", None),
                "flowGroup": getattr(element, "flowGroup", None),
                **_serialize_grid_section_metadata(element),
                "isDecorativeChromeText": getattr(element, "isDecorativeChromeText", False),
                "preserveInitialLayout": getattr(element, "preserveInitialLayout", False),
                "alignWithText": getattr(element, "alignWithText", None),
                "id": getattr(element, "id", None),
                "photoSlot": getattr(element, "photoSlot", None),
                "photoSlotHidden": getattr(element, "photoSlotHidden", False),
                "photoPlaceholder": getattr(element, "photoPlaceholder", None),
                "profilePhotoMainContactBand": getattr(element, "profilePhotoMainContactBand", None),
                "profilePhotoMainMastheadIdentity": getattr(element, "profilePhotoMainMastheadIdentity", None),
                "photoLayoutHome": getattr(element, "photoLayoutHome", None),
                "photoShape": getattr(element, "photoShape", None),
                "objectFit": getattr(element, "objectFit", None),
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
