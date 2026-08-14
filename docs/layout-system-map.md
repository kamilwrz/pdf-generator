# Layout system file map

Inventory of every file involved in CV layout: element placement, reflow,
structural record/section editing, spacing rhythm, and PDF generation.
Compiled while investigating why Axis/Harbor's split-lane
(`flowRole: "record-overlay"`) records break on add/reorder — see the
"gaps" callout at the bottom.

## Frontend

### Core reflow engine

Recalculates positions when a textarea's authored height changes (the
"live typing" reflow).

- [`textareaReflow.js`](../frontend/src/utils/textareaReflow.js) — `reflowTextareaHeight()`. **The only file with real `record-overlay` awareness** (`isRecordOverlay`, `recordOverlayAnchor`).
- [`textareaHeight.js`](../frontend/src/utils/textareaHeight.js) — measures how tall a textarea's content actually is (`measureTextareaHeight`, `measureNaturalScrollHeight`).
- [`textareaEditing.js`](../frontend/src/utils/textareaEditing.js) — drag-intent detection and deferred-edit gating feeding into reflow.
- [`textSpacingHold.js`](../frontend/src/utils/textSpacingHold.js) — timer-based hold so spacing doesn't jitter right after an edit.
- [`canvasEnter.js`](../frontend/src/utils/canvasEnter.js) — suppresses reflow while newly-added elements play their enter animation.

### Structural record editing (the +, trash, ↑/↓ controls)

⚠️ **Blind to `record-overlay`** — confirmed via grep, zero hits.

- [`sectionRecord.js`](../frontend/src/utils/sectionRecord.js) — `buildRecordClone`, `appendRecordToSection`, `removeRecordBlock`, `reorderRecordBlock`, `partitionSectionRecords`. The file from the Axis bug investigation.
- [`structureOperation.js`](../frontend/src/utils/structureOperation.js) — page renumbering/reconciliation after structural edits.
- [`materializeElementSpecs.js`](../frontend/src/utils/materializeElementSpecs.js) — turns plain template element specs into real canvas elements with ids.
- [`sectionBuilder.js`](../frontend/src/utils/sectionBuilder.js) — builds a brand-new section's element set ("Add Section").
- [`RecordBlockAdd.jsx`](../frontend/src/components/canvas/RecordBlockAdd/RecordBlockAdd.jsx) — canvas "+" affordance to add a record under a hovered one.
- [`SectionRecordAdd.jsx`](../frontend/src/components/canvas/SectionRecordAdd/SectionRecordAdd.jsx) — canvas "+" affordance to add a section-level record.
- [`recordPlusSize.js`](../frontend/src/components/canvas/recordPlusSize.js) — sizing math for the record "+" button given zoom/fontSize.
- [`AddSectionModal.jsx`](../frontend/src/components/editor/AddSectionModal/AddSectionModal.jsx) — modal that drives `sectionBuilder`/`sectionStructure.appendSectionAtEnd`.

### Section/lane packing & spacing rhythm

⚠️ **Also blind to `record-overlay`**.

- [`sectionStructure.js`](../frontend/src/utils/sectionStructure.js) — the big packer: `packDocumentSections`, `packSidebarLane`, `applyFlowSpacing`, `listDocumentSections`.
- [`flowSpacing.js`](../frontend/src/utils/flowSpacing.js) — `DEFAULT_FLOW_SPACING` and the spacing-token vocabulary (record/section/stack gaps).
- [`transferSectionLane.js`](../frontend/src/utils/transferSectionLane.js) — moves a whole section between sidebar and main lane.
- [`collapseMainIntoSidebar.js`](../frontend/src/utils/collapseMainIntoSidebar.js) — auto-collapses overflow main-lane sections into the sidebar.
- [`layoutDensity.js`](../frontend/src/utils/layoutDensity.js) — scores page fill, proposes auto-fit spacing density.
- [`documentLength.js`](../frontend/src/utils/documentLength.js) — diagnoses "too long" / "sparse last page" states.
- [`flatSectionLayout.js`](../frontend/src/utils/flatSectionLayout.js) — converts a record body between inline-paragraph and bullet-list layouts.
- [`pageDrag.js`](../frontend/src/utils/pageDrag.js) — clamped element drag/move math, incl. moving across pages.
- [`pageSpread.js`](../frontend/src/utils/pageSpread.js) — two-page-view geometry, page hit-testing.

### Chip-grid layout (Skills / Languages — the other special record shape)

- [`skillsLayout.js`](../frontend/src/utils/skillsLayout.js) — parses/builds chip-grid (`flowRole: "grid-member"`), inline, and sidebar skill layouts.
- [`skillsDisplayMode.js`](../frontend/src/utils/skillsDisplayMode.js) — orchestrates switching a skills section's display mode end-to-end.
- [`languagesLayout.js`](../frontend/src/utils/languagesLayout.js) — languages proficiency chip-grid layout, analogous to `skillsLayout.js`.
- [`SkillsLayoutModal.jsx`](../frontend/src/components/editor/SkillsLayoutModal/SkillsLayoutModal.jsx) — modal UI driving `skillsDisplayMode.js`.

### Geometry / visual aids (read layout, don't mutate it)

- [`spacingGuides.js`](../frontend/src/utils/spacingGuides.js) — alignment/spacing guide lines shown while dragging.
- [`spacingLabelLayout.js`](../frontend/src/utils/spacingLabelLayout.js) — positions the numeric gap-distance labels beside guides.
- [`elementBounds.js`](../frontend/src/utils/elementBounds.js) — core geometry: bounding boxes, text content bounds, batch measurement — used by nearly everything above.
- [`elementInteraction.js`](../frontend/src/utils/elementInteraction.js) — classifies decorative/chrome elements (excluded from selection/drag/reflow).
- [`Guides.jsx`](../frontend/src/components/canvas/Guides/Guides.jsx) — renders spacing/alignment guides on canvas.
- [`SelectionOverlay.jsx`](../frontend/src/components/canvas/SelectionOverlay/SelectionOverlay.jsx) — renders selection handles/bbox on canvas.

### Canvas state / entry points

- [`useA4Elements.js`](../frontend/src/hooks/useA4Elements.js) — central element-array state hook; has its own `fontSize*1.35` height fallback.
- [`useApplyCvTemplate.js`](../frontend/src/hooks/useApplyCvTemplate.js) — applies a chosen template onto the live document.
- [`useDocumentHistory.js`](../frontend/src/hooks/useDocumentHistory.js) — undo/redo stack for the element array.
- [`Textarea.jsx`](../frontend/src/components/canvas/Textarea/Textarea.jsx) — the editable textarea element; where `reflowTextareaHeight` actually gets triggered from.
- [`SectionsPanel.jsx`](../frontend/src/components/editor/SectionsPanel/SectionsPanel.jsx) — sidebar section list; triggers reorder/remove/lane-transfer.

### Templates

- [`templates/`](../frontend/src/templates/) — 15 files, one per design (`axis.js`, `harbor.js`, `nimbus.js`, etc.), sharing element-spec factories from [`templates/helpers.js`](../frontend/src/templates/helpers.js). Frontend-preview mirrors of the backend Python generators. `axis.js` and `harbor.js` contain explicit `record-overlay` elements.

## Backend

### PDF layout engine

The source of truth for constants like `1.35` (font-size → line-height ratio) mirrored on the frontend.

- [`cv_generator_primitives.py`](../backend/app/services/cv_generator_primitives.py) — `class Builder`: `.text()`, `.block()`, `.keep_together()`, `.need()` — the cursor-based layout DSL every template generator calls.
- [`shared/column_planner.py`](../backend/app/services/cv_templates/shared/column_planner.py) — plans main/sidebar column heights and multi-page section placement.
- [`shared/records.py`](../backend/app/services/cv_templates/shared/records.py) — **backend equivalent of `sectionRecord.js`**: `_experience_record_height`, `_place_experience_record`, `_education_record_height`.
- [`shared/text.py`](../backend/app/services/cv_templates/shared/text.py) — skills-chip/language-grid measurement, backend equivalent of `skillsLayout.js`.
- [`shared/extras.py`](../backend/app/services/cv_templates/shared/extras.py) — generic "extra sections" height/placement, sidebar-fit for overflow sections.
- [`shared/contact.py`](../backend/app/services/cv_templates/shared/contact.py) — contact-line/icon placement variants.
- [`shared/icons.py`](../backend/app/services/cv_templates/shared/icons.py) — icon glyph resolution/placement helper.
- [`registry.py`](../backend/app/services/cv_templates/registry.py) — dispatches a `template_id` to its generator function.
- [`pdf_generator.py`](../backend/app/services/pdf_generator.py) — renders the final element list to an actual PDF (ReportLab); consumes layout, doesn't compute it.
- [`build_pdf.py`](../backend/app/utils/build_pdf.py) — thin orchestration wrapper: elements → PDF bytes.

### Per-template generators

- [`cv_templates/templates/`](../backend/app/services/cv_templates/templates/) — 16 files, one per CV template (matches the registry's `template_id`s). Each builds a `Builder` and emits that design's full element list. `axis.py`, `nova.py`, `portico.py` contain their own `* 1.35` fallback constants; `axis.py` also matches on `flowRole`/`flowGroup` tokens.

### Layout analysis / AI editing

Powers the in-editor AI assistant's positioning features.

- [`layout_analysis.py`](../backend/app/services/layout_analysis.py) — canvas-side geometry ops: `resolve_shift`, `resolve_align`, `resolve_distribute`, `resolve_restructure_section`, etc. Has its own structure/lane helpers analogous to `sectionStructure.js`.
- [`layout_gpt.py`](../backend/app/services/layout_gpt.py) — builds the LLM prompt/contract for AI layout edits and parses the response into element patches.
- [`cv_data.py`](../backend/app/services/cv_data.py) — normalizes raw CV data into the record/section shapes (`experience`, `education`, `skill_groups`, custom sections) all layout code consumes. **Relevant when defining a new record shape** — validation starts here.

### AI-fill glue

- [`ai_service.py`](../backend/app/services/ai_service.py) — extracts CV data from an uploaded PDF, re-generates elements via the template registry; includes a post-generation height/reflow fix-up pass (`_fix_heights_and_reflow`).
- [`ai_assistant_service.py`](../backend/app/services/ai_assistant_service.py) — backend for the in-editor AI assistant (rate/fix-grammar/shorten/translate/layout actions); `_layout_session` invokes `layout_analysis.py`'s resolvers.
- [`routes/ai.py`](../backend/app/api/routes/ai.py) — HTTP route for AI CV fill/template application.
- [`routes/ai_assistant.py`](../backend/app/api/routes/ai_assistant.py) — HTTP route exposing AI assistant actions (including layout ops) to the frontend.
- [`fillTemplate.js`](../frontend/src/services/fillTemplate.js) — frontend orchestration for applying an AI-filled/template dataset onto canvas elements.

## `record-overlay` / `flowRole` / `flowGroup` awareness

- **Has explicit `record-overlay` handling:** `textareaReflow.js`, `templates/axis.js`, `templates/harbor.js`.
- **Uses `flowRole`/`flowGroup` generically but does NOT special-case `record-overlay`:** `sectionRecord.js`, `sectionStructure.js` — the gap that breaks Axis/Harbor on add/reorder — plus `skillsLayout.js`, `languagesLayout.js`, `transferSectionLane.js`, `collapseMainIntoSidebar.js`, `sectionBuilder.js`.
- **No flow awareness at all (pure geometry/UI):** `spacingGuides.js`, `elementBounds.js`, `pageDrag.js`, `layoutDensity.js`.

If adding new record/section shapes: `sectionRecord.js` and `sectionStructure.js` are the highest-risk files to update in lockstep on the frontend. On the backend, the equivalent shape assumptions live in `cv_templates/shared/records.py` and `layout_analysis.py`'s `resolve_restructure_section`.
