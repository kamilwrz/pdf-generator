/**
 * Renders the live canvas element list by category.
 * Passes `fixedToPage` so decorative chrome stays pointer-inert.
 * Content enter fades come from ids marked via `markElementsEnter` /
 * `markContentElementsEnter`; decorative chrome is never animated.
 *
 * Template-mode section headings and record title bands reveal one shared,
 * grouped toolbar in an A4 gutter. A single page uses the nearest lane edge;
 * a two-page spread sends each toolbar to its page's outside edge. Plain body
 * hover keeps the complete heading-and-content section boundary visible,
 * while exact record/grid triggers retain their narrower controls. Direct
 * controls add/reorder; layout, lane transfer, and deletion live in the
 * overflow menu. Flat-list section
 * bodies (Languages, flat custom sections —
 * exactly one textarea per section) get a `FlatSectionLayoutToggle` icon to
 * their left, centered on the block's height, instead — opening a modal to
 * switch between an inline mid-dot row and a bullet list. A main-column
 * Skills heading additionally carries `skillsMode` on its `SectionRecordAdd`
 * anchor, which renders one more hover icon opening `SkillsLayoutModal` to
 * switch between inline / bullet / chip pills — a strict superset of
 * `FlatSectionLayoutToggle`'s two modes, so any heading carrying a
 * `skillsMode` anchor is excluded from `flatSectionAnchorsById` below to
 * avoid showing both icons on the same row. Language and editor-created grid
 * cells mount `GridEntryActions`: exactly `+` and trash are portalled into the
 * appropriate A4 gutter, so the controls never enter authored PDF content.
 */
import { useEffect, useMemo } from 'react';
import Text from '../Text/Text';
import Image from '../Image/Image';
import Line from '../Line/Line';
import Rectangle from '../Rectangle/Rectangle';
import Textarea from '../Textarea/Textarea';
import Ellipse from '../Ellipse/Ellipse';
import Polygon from '../Polygon/Polygon';
import Path from '../Path/Path';
import SectionRecordAdd from '../SectionRecordAdd/SectionRecordAdd';
import RecordBlockAdd from '../RecordBlockAdd/RecordBlockAdd';
import GridEntryActions from '../GridEntryActions/GridEntryActions';
import SkillsEntryActions from '../SkillsEntryActions/SkillsEntryActions';
import FlatSectionLayoutToggle from '../FlatSectionLayoutToggle/FlatSectionLayoutToggle';
import ContactChannelControls from '../ContactChannelControls/ContactChannelControls';
import { listContactBands } from '../../../utils/contactBands';
import MastheadIdentityControls from '../MastheadIdentityControls/MastheadIdentityControls';
import { listMastheadBands } from '../../../utils/mastheadBands';
import ProfilePhotoControls from '../ProfilePhotoControls/ProfilePhotoControls';
import { profilePhotoControlAnchor } from '../../../utils/profilePhotoVisibility';
import { useCanvasEnterIds } from '../../../hooks/useCanvasEnterIds';
import { useCanvasContext } from '../../../store/canvas-context';
import { useSession } from '../../../store/session-context';
import { EDITOR_MODE_TEMPLATE } from '../../../utils/editorMode';
import {
  listDocumentSections,
  listFlatSectionAnchors,
  listSidebarSections,
  sectionElementIds,
  sidebarSectionElementIds,
} from '../../../utils/sectionStructure';
import { listRecordBlockAddAnchors } from '../../../utils/sectionRecord';
import { listGridSectionEntryAnchors } from '../../../utils/gridSection';
import { resolveSectionLaneTransfer } from '../../../utils/transferSectionLane';
import { listSkillsDisplayAnchors } from '../../../utils/skillsDisplayMode';
import { listSkillsEntryAnchors } from '../../../utils/skillsEntry';
import {
  elementBoundsOnPage,
  sectionVisualStartOnPage,
} from '../../../utils/canvasHighlightBounds';
import classes from './CanvasElements.module.css';

/**
 * Lane-transfer hover control: templates whose generator output carries the
 * `flowLane: "sidebar"` / `flowRole` tags `transferSectionLane.js` depends on
 * to restyle a section for its destination column. Sterling, Slate,
 * and Linden emit the required tags for their sidebar sections, so the same
 * general utility works unchanged for all of them.
 */
// Keep this capability list aligned with generators that emit
// `sidebar-chrome` headings, otherwise the transfer utility remains
// available but its editor control is never offered to the user.
const LANE_TRANSFER_TEMPLATE_IDS = new Set([
  "sterling",
  "slate",
  "linden",
]);

const STRUCTURAL_TOOLBAR_HINT_KEY = "cv-studio:structuralToolbarHintSeen";

function enterClassName(elementId, heldIds, fadingIds) {
  if (fadingIds.has(elementId)) return classes.enter;
  if (heldIds.has(elementId)) return classes.enterHeld;
  return undefined;
}

/**
 * Map heading ids → ↑/↓ flags (and optional lane transfer) for one lane.
 * Indexes are lane-local so a sidebar kicker cannot reorder into the main column.
 */
function fillSectionAnchors(
  map,
  sections,
  documentElements,
  pageHeight,
  allowLaneTransfer,
  resolveMemberIds,
  gutterSide,
  nestedStructuralHoverIds,
) {
  // Resolve every lane-local start before building rectangles so the current
  // section can stop at the next section's true visual chrome edge. All values
  // come from persisted model geometry; reading DOM Ranges here would observe
  // the previous layout because this helper runs before React's commit.
  const anchors = sections.map((section) => {
    const heading = documentElements.find((element) => (
      element.element_id === section.headingId
    ));
    const page = Math.max(1, Math.trunc(Number(heading?.page) || 1));
    const memberIds = resolveMemberIds(documentElements, section.headingId, pageHeight);
    return {
      section,
      page,
      memberIds,
      minTop: sectionVisualStartOnPage(
        documentElements,
        memberIds,
        section.headingId,
        page,
        pageHeight,
        section.startAbs,
      ),
    };
  });

  anchors.forEach((anchor, index) => {
    const {
      section,
      page,
      memberIds,
      minTop,
    } = anchor;
    const next = anchors[index + 1];
    // A section shadow is page-local. Its lower edge stops at the next visual
    // chrome start in the same lane/page, or at the physical page edge when the
    // lane continues on another page. The upper limit prevents stale or
    // polluted membership from pulling a moved section into its predecessor.
    const maxBottom = next?.page === page ? next.minTop : pageHeight;
    const highlightLimits = { minTop, maxBottom };
    // Plain section copy (Summary, About, flat Skills/Languages, and custom
    // prose) should reveal the same complete heading+body boundary as the
    // heading itself. Record fields and repeatable grid cells keep their more
    // specific record/cell affordances, so exclude their trigger ids here
    // instead of stacking three competing depth layers on one pointer.
    const contentHoverIds = documentElements
      .filter((element) => (
        memberIds.has(element.element_id)
        && element.element_id !== section.headingId
        && Math.max(1, Math.trunc(Number(element.page) || 1)) === page
        && (element.category === "text" || element.category === "textarea") && element.flowRole !== "section-chrome" && element.flowRole !== "sidebar-chrome"
        && !nestedStructuralHoverIds.has(element.element_id)
      ))
      .map((element) => element.element_id);
    map.set(section.headingId, {
      canMoveUp: index > 0,
      canMoveDown: index < sections.length - 1,
      gutterSide,
      highlight: elementBoundsOnPage(
        documentElements,
        memberIds,
        page,
        highlightLimits,
      ),
      highlightLimits,
      contentHoverIds,
      nextHeadingId: next?.page === page ? next.section.headingId : null,
      laneTransfer: allowLaneTransfer
        ? resolveSectionLaneTransfer(documentElements, section.headingId, pageHeight)
        : null,
    });
  });
}

export default function CanvasElements({ elements, spreadSide = null }) {
  const { heldIds, fadingIds } = useCanvasEnterIds(elements);
  // `elements` is page-filtered by PdfCanvas. Reorder ↑/↓ must use the full
  // document so a heading/record on page 2 still sees neighbours on page 1.
  const {
    editorMode,
    pageSize,
    A4_Elements,
    activeTemplateId,
  } = useCanvasContext();
  const { pushToast } = useSession();
  const pageHeight = pageSize?.height ?? 842;
  const documentElements = A4_Elements?.length ? A4_Elements : elements;
  const allowLaneTransfer = LANE_TRANSFER_TEMPLATE_IDS.has(activeTemplateId);

  // One anchor per repeatable short entry. The utility deliberately excludes
  // Skills chips even though they share `flowRole: "grid-member"`, preserving
  // their dedicated section-level display controls.
  const gridEntryAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    for (const anchor of listGridSectionEntryAnchors(documentElements, pageHeight)) {
      map.set(anchor.elementId, anchor);
    }
    return map;
  }, [editorMode, documentElements, pageHeight]);

  const skillsEntryAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    for (const anchor of listSkillsEntryAnchors(documentElements, pageHeight)) {
      map.set(anchor.mountElementId, anchor);
    }
    return map;
  }, [editorMode, documentElements, pageHeight]);

  const recordBlockAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    const skillEntryTriggerIds = new Set(
      [...skillsEntryAnchorsById.values()].flatMap((anchor) => anchor.triggerIds),
    );
    for (const anchor of listRecordBlockAddAnchors(documentElements, pageHeight)) {
      // A Skills body/chip reveals the centred entry form; its category label
      // keeps the record menu. Splitting the trigger surfaces preserves both
      // operations and the one-toolbar-at-a-time canvas contract.
      const hoverIds = anchor.hoverIds.filter((id) => !skillEntryTriggerIds.has(id));
      map.set(anchor.elementId, { ...anchor, hoverIds });
    }
    return map;
  }, [editorMode, documentElements, pageHeight, skillsEntryAnchorsById]);

  const nestedStructuralHoverIds = useMemo(() => {
    const ids = new Set(gridEntryAnchorsById.keys());
    for (const anchor of skillsEntryAnchorsById.values()) {
      for (const id of anchor.triggerIds) ids.add(id);
    }
    for (const anchor of recordBlockAnchorsById.values()) {
      for (const id of anchor.hoverIds || [anchor.elementId]) ids.add(id);
    }
    return ids;
  }, [gridEntryAnchorsById, recordBlockAnchorsById, skillsEntryAnchorsById]);

  // Heading id → reorder / lane-transfer flags for the section hover affordance.
  const sectionAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    fillSectionAnchors(
      map,
      listDocumentSections(documentElements, pageHeight),
      documentElements,
      pageHeight,
      allowLaneTransfer,
      sectionElementIds,
      "right",
      nestedStructuralHoverIds,
    );
    fillSectionAnchors(
      map,
      listSidebarSections(documentElements, pageHeight),
      documentElements,
      pageHeight,
      allowLaneTransfer,
      sidebarSectionElementIds,
      "left",
      nestedStructuralHoverIds,
    );
    // Skills layout picker (chips / list / text) is main-column only — a
    // sidebar kicker's headingId never matches, so this only ever augments
    // an entry `fillSectionAnchors` already created above.
    for (const anchor of listSkillsDisplayAnchors(documentElements, pageHeight)) {
      const existing = map.get(anchor.headingId);
      if (existing) existing.skillsMode = anchor.mode;
    }
    return map;
  }, [
    editorMode,
    documentElements,
    pageHeight,
    allowLaneTransfer,
    nestedStructuralHoverIds,
  ]);

  useEffect(() => {
    if (editorMode !== EDITOR_MODE_TEMPLATE || sectionAnchorsById.size === 0) return;
    if (localStorage.getItem(STRUCTURAL_TOOLBAR_HINT_KEY)) return;
    localStorage.setItem(STRUCTURAL_TOOLBAR_HINT_KEY, "1");
    pushToast?.({
      title: "Edytuj bezpośrednio na CV",
      msg: "Najedź na sekcję lub wpis, aby zobaczyć kontrolki. Kliknij tekst raz, aby go edytować.",
      variant: "success",
      replaceKey: "canvas-structural-toolbar-hint",
    });
  }, [editorMode, pushToast, sectionAnchorsById]);

  // Content-element id → flat-list layout-toggle anchor (Languages, flat
  // custom sections). A section can only be either record-shaped
  // (recordBlockAnchorsById) or flat (exactly one body textarea), so the two
  // maps never target the same element in practice.
  //
  // A main-column Skills heading is excluded here even though it also
  // satisfies "exactly one body textarea": `sectionAnchorsById` already
  // carries a `skillsMode` anchor for it (`SkillsLayoutModal`, inline/bullet/
  // chips), and that picker's inline/bullet options are a strict superset of
  // this toggle's. Keeping both produced two overlapping hover icons on the
  // same row offering the same two modes twice.
  const flatSectionAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    for (const anchor of listFlatSectionAnchors(documentElements, pageHeight)) {
      if (sectionAnchorsById.get(anchor.headingId)?.skillsMode != null) continue;
      map.set(anchor.contentElementId, anchor);
    }
    return map;
  }, [editorMode, documentElements, pageHeight, sectionAnchorsById]);

  // Managed contact bands on this page (template mode only). Rendered after the
  // element nodes so the hover trash / add-channel menu overlay the chips.
  const contactBands = useMemo(
    () => (editorMode === EDITOR_MODE_TEMPLATE ? listContactBands(elements) : []),
    [editorMode, elements],
  );
  const mastheadBands = useMemo(
    () => (editorMode === EDITOR_MODE_TEMPLATE ? listMastheadBands(elements) : []),
    [editorMode, elements],
  );
  const photoControlAnchor = useMemo(
    () => (editorMode === EDITOR_MODE_TEMPLATE
      ? profilePhotoControlAnchor(documentElements, activeTemplateId)
      : null),
    [editorMode, documentElements, activeTemplateId],
  );
  const photoControlIsOnPage = photoControlAnchor
    ? elements.some((element) => (
      photoControlAnchor.slotElementIds.includes(element.element_id)
      || element.element_id === photoControlAnchor.name?.elementId
    ))
    : false;

  const elementNodes = elements.map((element) => {
    // Hidden slot members stay in document state for exact, reversible restore
    // but never produce canvas or PDF-visible chrome while the slot is hidden.
    if (element.photoSlotHidden === true) return null;
    const enterClass = enterClassName(element.element_id, heldIds, fadingIds);
    let node = null;
    const blockAnchor = recordBlockAnchorsById.get(element.element_id);
    const gridEntryAnchor = gridEntryAnchorsById.get(element.element_id);
    const skillsEntryAnchor = skillsEntryAnchorsById.get(element.element_id);
    const flatAnchor = flatSectionAnchorsById.get(element.element_id);
    const sectionAnchor = sectionAnchorsById.get(element.element_id);
    // Identity and contact fields are the most important direct-edit targets
    // in a generated CV, but their document typography can otherwise make
    // them look like static output. Mark only the semantic template fields;
    // Text/Textarea use the flag to paint application-only hover chrome that
    // never becomes part of the authored element geometry or PDF payload.
    const editorHoverOutline = editorMode === EDITOR_MODE_TEMPLATE && Boolean(
      element.contactChannel
      || element.mastheadRole === "name"
      || element.mastheadRole === "title",
    );
    // Section detection accepts both text primitives. Mount the same structural
    // toolbar outside the category branches so legacy/custom textarea headings
    // do not silently lose section controls while ordinary text headings work.
    const sectionToolbar = sectionAnchor ? (
      <SectionRecordAdd
        headingId={element.element_id}
        nextHeadingId={sectionAnchor.nextHeadingId}
        left={Number(element.left) || 0}
        top={Number(element.top) || 0}
        width={Number(element.width) || 0}
        fontSize={Number(element.fontSize) || 10}
        canMoveUp={sectionAnchor.canMoveUp}
        canMoveDown={sectionAnchor.canMoveDown}
        laneTransfer={sectionAnchor.laneTransfer}
        skillsMode={sectionAnchor.skillsMode ?? null}
        gutterSide={sectionAnchor.gutterSide}
        highlight={sectionAnchor.highlight}
        highlightLimits={sectionAnchor.highlightLimits}
        contentHoverIds={sectionAnchor.contentHoverIds}
        spreadSide={spreadSide}
      />
    ) : null;

    if (element.category === "textarea") {
      node = (
        <>
          <Textarea
            elementId={element.element_id}
            content={element.content}
            fontSize={element.fontSize}
            fontFamily={element.fontFamily}
            color={element.color}
            lineHeight={element.lineHeight}
            letterSpacing={element.letterSpacing}
            left={element.left}
            top={element.top}
            width={parseFloat(element.width)}
            height={parseFloat(element.height)}
            isSelected={element.isSelected}
            isEditing={element.isEditing}
            isMove={element.isMove}
            bold={element.bold}
            italic={element.italic}
            underline={element.underline}
            runs={element.runs}
            align={element.align}
            bulletList={element.bulletList}
            autoHeight={element.autoHeight}
            preserveInitialLayout={element.preserveInitialLayout}
            zIndex={element.zIndex}
            fixedToPage={element.fixedToPage}
            textTransform={element.textTransform}
            mastheadRole={element.mastheadRole}
            placeholder={element.placeholder}
            starterPlaceholder={element.starterPlaceholder}
            editorHoverOutline={editorHoverOutline}
          />
          {blockAnchor ? (
            <RecordBlockAdd
              elementId={blockAnchor.elementId}
              hoverIds={blockAnchor.hoverIds}
              left={blockAnchor.left}
              top={blockAnchor.top}
              height={blockAnchor.height}
              width={blockAnchor.width}
              fontSize={blockAnchor.fontSize}
              canMoveUp={blockAnchor.canMoveUp}
              canMoveDown={blockAnchor.canMoveDown}
              descriptionAction={blockAnchor.descriptionAction}
              highlight={blockAnchor.highlight}
              spreadSide={spreadSide}
            />
          ) : null}
          {flatAnchor ? (
            <FlatSectionLayoutToggle
              contentElementId={flatAnchor.contentElementId}
              left={Number(element.left) || 0}
              top={Number(element.top) || 0}
              height={Number(element.height) || 0}
              fontSize={Number(element.fontSize) || 10}
            />
          ) : null}
          {gridEntryAnchor ? (
            <GridEntryActions
              elementId={gridEntryAnchor.elementId}
              left={gridEntryAnchor.left}
              top={gridEntryAnchor.top}
              width={gridEntryAnchor.width}
              height={gridEntryAnchor.height}
              fontSize={gridEntryAnchor.fontSize}
              highlight={gridEntryAnchor.highlight}
              canDelete={gridEntryAnchor.canDelete}
              gridKind={gridEntryAnchor.gridKind}
              gutterSide={gridEntryAnchor.gutterSide}
              spreadSide={spreadSide}
            />
          ) : null}
          {skillsEntryAnchor ? (
            <SkillsEntryActions
              headingId={skillsEntryAnchor.headingId}
              groupId={skillsEntryAnchor.groupId}
              categoryLabel={skillsEntryAnchor.categoryLabel}
              triggerIds={skillsEntryAnchor.triggerIds}
              left={skillsEntryAnchor.left}
              width={skillsEntryAnchor.width}
              bottom={skillsEntryAnchor.bottom}
            />
          ) : null}
        </>
      );
    } else if (element.category === "text") {
      node = (
        <>
          <Text
            elementId={element.element_id}
            fontSize={element.fontSize}
            fontFamily={element.fontFamily}
            color={element.color}
            letterSpacing={element.letterSpacing}
            content={element.content}
            left={element.left}
            top={element.top}
            width={element.width}
            height={element.height}
            align={element.align}
            isSelected={element.isSelected}
            isEditing={element.isEditing}
            isMove={element.isMove}
            category={element.category}
            bold={element.bold}
            italic={element.italic}
            underline={element.underline}
            runs={element.runs}
            zIndex={element.zIndex}
            fixedToPage={element.fixedToPage}
            placeholder={element.placeholder}
            starterPlaceholder={element.starterPlaceholder}
            selectAllOnEdit={element.selectAllOnEdit}
            textTransform={element.textTransform}
            mastheadRole={element.mastheadRole}
            editorHoverOutline={editorHoverOutline}
          />
          {blockAnchor ? (
            <RecordBlockAdd
              elementId={blockAnchor.elementId}
              hoverIds={blockAnchor.hoverIds}
              left={blockAnchor.left}
              top={blockAnchor.top}
              height={blockAnchor.height}
              width={blockAnchor.width}
              fontSize={blockAnchor.fontSize}
              canMoveUp={blockAnchor.canMoveUp}
              canMoveDown={blockAnchor.canMoveDown}
              descriptionAction={blockAnchor.descriptionAction}
              highlight={blockAnchor.highlight}
              spreadSide={spreadSide}
            />
          ) : null}
          {skillsEntryAnchor ? (
            <SkillsEntryActions
              headingId={skillsEntryAnchor.headingId}
              groupId={skillsEntryAnchor.groupId}
              categoryLabel={skillsEntryAnchor.categoryLabel}
              triggerIds={skillsEntryAnchor.triggerIds}
              left={skillsEntryAnchor.left}
              width={skillsEntryAnchor.width}
              bottom={skillsEntryAnchor.bottom}
            />
          ) : null}
        </>
      );
    } else if (element.category === "image") {
      node = (
        <Image
          img_id={element.img_id}
          elementId={element.element_id}
          height={parseFloat(element.height)}
          width={parseFloat(element.width)}
          src={element.src}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
          alignWithText={element.alignWithText}
          borderRadius={element.borderRadius}
          objectFit={element.objectFit}
          photoSlot={element.photoSlot}
        />
      );
    } else if (element.category === "line") {
      node = (
        <Line
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    } else if (element.category === "rectangle") {
      node = (
        <Rectangle
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          borderRadius={element.borderRadius}
          filled={element.filled}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
          photoSlot={element.photoSlot}
          id={element.id}
        />
      );
    } else if (element.category === "circle" || element.category === "ellipse") {
      node = (
        <Ellipse
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          filled={element.filled}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    } else if (element.category === "polygon") {
      node = (
        <Polygon
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          filled={element.filled}
          points={element.points}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    } else if (element.category === "path") {
      node = (
        <Path
          elementId={element.element_id}
          width={parseFloat(element.width)}
          height={parseFloat(element.height)}
          backgroundColor={element.backgroundColor}
          borderWidth={element.borderWidth}
          curves={element.curves}
          left={element.left}
          top={element.top}
          isSelected={element.isSelected}
          isMove={element.isMove}
          category={element.category}
          zIndex={element.zIndex}
          fixedToPage={element.fixedToPage}
        />
      );
    }

    if (!node) return null;

    return (
      <div key={element.element_id} className={enterClass}>
        {node}
        {sectionToolbar}
      </div>
    );
  });

  return (
    <>
      {elementNodes}
      {contactBands.map((band) => (
        <ContactChannelControls
          key={band.bandId}
          bandId={band.bandId}
          chips={band.chips}
          inactive={band.inactive}
        />
      ))}
      {mastheadBands.map((band) => (
        <MastheadIdentityControls key={band.bandId} band={band} />
      ))}
      {photoControlAnchor && photoControlIsOnPage
        ? <ProfilePhotoControls anchor={photoControlAnchor} />
        : null}
    </>
  );
}
