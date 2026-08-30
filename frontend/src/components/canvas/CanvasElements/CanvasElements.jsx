/**
 * Renders the live canvas element list by category.
 * Passes `fixedToPage` so decorative chrome stays pointer-inert.
 * Content enter fades come from ids marked via `markElementsEnter` /
 * `markContentElementsEnter`; decorative chrome is never animated.
 *
 * Template-mode section headings and record title bands reveal one shared,
 * grouped toolbar in an A4 gutter. A single page uses the nearest lane edge;
 * a two-page spread sends each toolbar to its page's outside edge. Hover
 * reveals it, click pins it, and the matching semantic block is highlighted
 * without covering authored content. Direct controls add/reorder; layout,
 * lane transfer, and deletion live in the overflow menu. Flat-list section
 * bodies (Languages, flat custom sections —
 * exactly one textarea per section) get a `FlatSectionLayoutToggle` icon to
 * their left, centered on the block's height, instead — opening a modal to
 * switch between an inline mid-dot row and a bullet list. A main-column
 * Skills heading additionally carries `skillsMode` on its `SectionRecordAdd`
 * anchor, which renders one more hover icon opening `SkillsLayoutModal` to
 * switch between inline / bullet / chip pills — a strict superset of
 * `FlatSectionLayoutToggle`'s two modes, so any heading carrying a
 * `skillsMode` anchor is excluded from `flatSectionAnchorsById` below to
 * avoid showing both icons on the same row.
 */
import { use, useEffect, useMemo } from 'react';
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
import FlatSectionLayoutToggle from '../FlatSectionLayoutToggle/FlatSectionLayoutToggle';
import ContactChannelControls from '../ContactChannelControls/ContactChannelControls';
import { listContactBands } from '../../../utils/contactBands';
import MastheadIdentityControls from '../MastheadIdentityControls/MastheadIdentityControls';
import { listMastheadBands } from '../../../utils/mastheadBands';
import ProfilePhotoControls from '../ProfilePhotoControls/ProfilePhotoControls';
import { profilePhotoControlAnchor } from '../../../utils/profilePhotoVisibility';
import { useCanvasEnterIds } from '../../../hooks/useCanvasEnterIds';
import { PdfContext } from '../../../store/pdfgenerator-context';
import { EDITOR_MODE_TEMPLATE } from '../../../utils/editorMode';
import {
  listDocumentSections,
  listFlatSectionAnchors,
  listSidebarSections,
  sectionElementIds,
  sidebarSectionElementIds,
} from '../../../utils/sectionStructure';
import { listRecordBlockAddAnchors } from '../../../utils/sectionRecord';
import { resolveSectionLaneTransfer } from '../../../utils/transferSectionLane';
import { listSkillsDisplayAnchors } from '../../../utils/skillsDisplayMode';
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
    // A section outline is page-local. Its lower edge stops at the next visual
    // chrome start in the same lane/page, or at the physical page edge when the
    // lane continues on another page. The upper limit prevents stale or
    // polluted membership from pulling a moved section into its predecessor.
    const maxBottom = next?.page === page ? next.minTop : pageHeight;
    const highlightLimits = { minTop, maxBottom };
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
    pushToast,
  } = use(PdfContext);
  const pageHeight = pageSize?.height ?? 842;
  const documentElements = A4_Elements?.length ? A4_Elements : elements;
  const allowLaneTransfer = LANE_TRANSFER_TEMPLATE_IDS.has(activeTemplateId);

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
    );
    fillSectionAnchors(
      map,
      listSidebarSections(documentElements, pageHeight),
      documentElements,
      pageHeight,
      allowLaneTransfer,
      sidebarSectionElementIds,
      "left",
    );
    // Skills layout picker (chips / list / text) is main-column only — a
    // sidebar kicker's headingId never matches, so this only ever augments
    // an entry `fillSectionAnchors` already created above.
    for (const anchor of listSkillsDisplayAnchors(documentElements, pageHeight)) {
      const existing = map.get(anchor.headingId);
      if (existing) existing.skillsMode = anchor.mode;
    }
    return map;
  }, [editorMode, documentElements, pageHeight, allowLaneTransfer]);

  useEffect(() => {
    if (editorMode !== EDITOR_MODE_TEMPLATE || sectionAnchorsById.size === 0) return;
    if (localStorage.getItem(STRUCTURAL_TOOLBAR_HINT_KEY)) return;
    localStorage.setItem(STRUCTURAL_TOOLBAR_HINT_KEY, "1");
    pushToast?.({
      title: "Edytuj bezpośrednio na CV",
      msg: "Najedź na sekcję lub wpis. Kliknij, aby przypiąć kontrolki; kliknij tekst dwukrotnie, aby go edytować.",
      variant: "success",
      replaceKey: "canvas-structural-toolbar-hint",
    });
  }, [editorMode, pushToast, sectionAnchorsById]);

  const recordBlockAnchorsById = useMemo(() => {
    const map = new Map();
    if (editorMode !== EDITOR_MODE_TEMPLATE) return map;
    for (const anchor of listRecordBlockAddAnchors(documentElements, pageHeight)) {
      map.set(anchor.elementId, anchor);
    }
    return map;
  }, [editorMode, documentElements, pageHeight]);

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
    const flatAnchor = flatSectionAnchorsById.get(element.element_id);
    const sectionAnchor = sectionAnchorsById.get(element.element_id);
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
            selectAllOnEdit={element.selectAllOnEdit}
            textTransform={element.textTransform}
            mastheadRole={element.mastheadRole}
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
