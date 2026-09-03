/**
 * Structural operations for short, fixed-column section entries.
 *
 * Language sections are emitted by the template generator as one textarea per
 * entry with `flowRole: "grid-member"`. User-created grid sections use the
 * same geometry and identify their heading with `editorSectionLayout: "grid"`.
 * Skills pills also use `grid-member`, so that flow role alone is deliberately
 * not enough to opt a section into the entry controls.
 *
 * Inserting or removing an entry rebuilds the complete grid. Existing element
 * ids and content stay stable, rows receive independent `flowGroup` ids, and
 * the ordinary section packer moves following sections/page breaks. Treating
 * every cell as a generic record would instead stack the columns vertically;
 * `sectionRecord.js` intentionally rejects that shape for this reason.
 */
import { nanoid } from "nanoid";
import { DEFAULT_FLOW_SPACING } from "./flowSpacing.js";
import { isLanguagesGridSection } from "./languagesLayout.js";
import {
  applyFlowSpacing,
  deriveSectionStyle,
  isSidebarLaneElement,
  isSidebarSectionHeading,
  listDocumentSections,
  listSidebarSections,
  sectionElementIds,
  sidebarSectionElementIds,
} from "./sectionStructure.js";
import { measureTextareaHeight } from "./textareaHeight.js";
import { STARTER_FIELD_PLACEHOLDERS } from "./cvStarter.js";

const GRID_FLOW_ROLE = "grid-member";
const GRID_LAYOUT = "grid";
const DEFAULT_GRID_COLUMNS = 4;
const DEFAULT_GRID_GUTTER = 8;
const MAX_GRID_COLUMNS = 12;
const ROW_TOLERANCE = 0.75;

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pageOf(element) {
  return Math.max(1, Math.trunc(finiteNumber(element?.page, 1)));
}

function absoluteTop(element, pageHeight) {
  return (pageOf(element) - 1) * pageHeight + finiteNumber(element?.top);
}

function elementHeight(element) {
  const explicit = finiteNumber(element?.height, 0);
  if (explicit > 0) return explicit;
  return Math.max(1, finiteNumber(element?.lineHeight, finiteNumber(element?.fontSize, 10) * 1.35));
}

function atAbsoluteTop(element, nextAbsoluteTop, pageHeight) {
  const page = Math.max(1, Math.floor(Math.max(0, nextAbsoluteTop) / pageHeight) + 1);
  return {
    ...element,
    page,
    top: nextAbsoluteTop - (page - 1) * pageHeight,
  };
}

function isTextGridCell(element) {
  return Boolean(
    element
    && element.flowRole === GRID_FLOW_ROLE
    && (element.category === "text" || element.category === "textarea"),
  );
}

function isExplicitGridHeading(heading) {
  const layout = String(
    heading?.editorSectionLayout
    || heading?.sectionLayout
    || "",
  ).toLowerCase();
  return layout === GRID_LAYOUT
    || layout === "grid-entry"
    || layout === "entry-grid"
    || heading?.gridSection === true;
}

function sortCells(cells, pageHeight) {
  return [...cells].sort((left, right) => {
    const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
    if (Math.abs(topDelta) > ROW_TOLERANCE) return topDelta;
    const leftDelta = finiteNumber(left.left) - finiteNumber(right.left);
    if (Math.abs(leftDelta) > 0.01) return leftDelta;
    return String(left.element_id).localeCompare(String(right.element_id));
  });
}

function editableSections(elements, pageHeight) {
  return [
    ...listDocumentSections(elements || [], pageHeight).map((section) => ({
      ...section,
      sidebar: false,
    })),
    ...listSidebarSections(elements || [], pageHeight).map((section) => ({
      ...section,
      sidebar: true,
    })),
  ];
}

function memberIdsForSection(elements, heading, pageHeight) {
  if (isSidebarSectionHeading(heading)) {
    return sidebarSectionElementIds(elements, heading.element_id, pageHeight);
  }
  return sectionElementIds(elements, heading.element_id, pageHeight);
}

function sectionDescriptors(elements, pageHeight) {
  const list = elements || [];
  const descriptors = [];

  for (const section of editableSections(list, pageHeight)) {
    const heading = list.find((element) => element?.element_id === section.headingId);
    if (!heading) continue;
    const memberIds = memberIdsForSection(list, heading, pageHeight);
    const members = list.filter((element) => memberIds.has(element?.element_id));
    const cells = sortCells(members.filter(isTextGridCell), pageHeight);
    if (cells.length === 0) continue;

    const languageSection = isLanguagesGridSection(
      [heading, ...cells],
      section.title || heading.content,
    );
    const explicitlyManaged = isExplicitGridHeading(heading)
      || cells.some((cell) => (
        cell?.gridEntry === true
        || cell?.editorGridEntry === true
        || cell?.gridSectionId === heading.element_id
      ));
    if (!languageSection && !explicitlyManaged) continue;

    descriptors.push({
      ...section,
      heading,
      members,
      cells,
      languageSection,
      sidebar: section.sidebar || isSidebarSectionHeading(heading),
      documentElements: list,
    });
  }

  return descriptors;
}

function collapseNearbyValues(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const unique = [];
  for (const value of sorted) {
    const previous = unique[unique.length - 1];
    if (previous == null || Math.abs(previous - value) > ROW_TOLERANCE) {
      unique.push(value);
    }
  }
  return unique;
}

function observedRowSize(cells, pageHeight) {
  const rowCounts = [];
  let rowTop = null;
  let rowCount = 0;
  for (const cell of sortCells(cells, pageHeight)) {
    const top = absoluteTop(cell, pageHeight);
    if (rowTop == null || Math.abs(top - rowTop) <= ROW_TOLERANCE) {
      rowTop ??= top;
      rowCount += 1;
    } else {
      rowCounts.push(rowCount);
      rowTop = top;
      rowCount = 1;
    }
  }
  if (rowCount > 0) rowCounts.push(rowCount);
  return Math.max(1, ...rowCounts);
}

function explicitNumber(values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

/**
 * Infer the authored grid contract without depending on a template id.
 *
 * Generated documents do not currently persist a `gridColumns` field. The
 * full-width section rule and the distance between cell starts together still
 * reveal the intended empty trailing slot (for example, three language cells
 * in a four-column Regent grid). Explicit metadata wins for editor-built grids.
 */
function resolveGridGeometry(descriptor, options = {}) {
  const { cells, members, heading, languageSection } = descriptor;
  const first = cells[0];
  const sampledStyle = deriveSectionStyle(
    descriptor.documentElements,
    options.pageHeight || 842,
    descriptor.headingId,
    { lane: descriptor.sidebar ? "sidebar" : "main" },
  );
  const cellLefts = collapseNearbyValues(cells.map((cell) => finiteNumber(cell.left)));
  let columnStep = null;
  for (let index = 1; index < cellLefts.length; index += 1) {
    const delta = cellLefts[index] - cellLefts[index - 1];
    if (delta > 0.5 && (columnStep == null || delta < columnStep)) columnStep = delta;
  }

  const inferredGutter = columnStep == null
    ? null
    : columnStep - finiteNumber(first.width);
  const gutter = Math.max(0, explicitNumber([
    options.gutter,
    heading?.gridGutter,
    first?.gridGutter,
    inferredGutter != null && inferredGutter <= 32 ? inferredGutter : null,
    DEFAULT_GRID_GUTTER,
  ]) ?? DEFAULT_GRID_GUTTER);
  const gridLeft = explicitNumber([
    options.bodyLeft,
    heading?.gridLeft,
    heading?.editorGridBodyLeft,
    first?.gridLeft,
    sampledStyle?.bodyLeft,
  ]) ?? Math.min(...cells.map((cell) => finiteNumber(cell.left)));

  // Chrome rules commonly span the complete content column, even when the
  // final authored row has fewer cells than the fixed column count.
  const sectionRight = members.reduce((right, element) => {
    if (!element || element.fixedToPage) return right;
    const width = finiteNumber(element.width, 0);
    if (width <= 0) return right;
    const left = finiteNumber(element.left);
    if (left + width <= gridLeft) return right;
    return Math.max(right, left + width);
  }, gridLeft);
  const sectionSpan = Math.max(0, sectionRight - gridLeft);
  const observedColumns = observedRowSize(cells, options.pageHeight || 842);

  const explicitColumns = explicitNumber([
    options.columns,
    heading?.gridColumns,
    heading?.editorGridColumns,
    first?.gridColumns,
    first?.editorGridColumns,
  ]);
  let columns = explicitColumns ? Math.round(explicitColumns) : null;
  if (!columns && columnStep && sectionSpan > 0) {
    columns = Math.round(sectionSpan / columnStep);
  }
  if (!columns) {
    // A one-cell legacy grid has no horizontal step from which to recover its
    // authored empty slots. Match generator defaults explicitly: four columns
    // in a wide main lane, three in a narrow main lane, and two in the rail.
    // Non-language grids retain the observed-row fallback because their column
    // count is user-authored and cannot be inferred safely from one cell.
    if (languageSection) {
      columns = descriptor.sidebar
        ? 2
        : (sectionSpan >= 400 ? DEFAULT_GRID_COLUMNS : 3);
    } else {
      columns = observedColumns;
    }
  }
  columns = Math.max(observedColumns, Math.min(MAX_GRID_COLUMNS, Math.max(1, columns)));

  const explicitWidth = explicitNumber([
    options.recordWidth,
    options.gridWidth,
    heading?.gridWidth,
    heading?.editorGridRecordWidth,
    first?.gridWidth,
    first?.editorGridRecordWidth,
    sampledStyle?.recordWidth,
  ]);
  const steppedWidth = columnStep ? columnStep * columns : 0;
  const fallbackWidth = (Math.max(1, finiteNumber(first.width)) + gutter) * columns;
  const gridWidth = explicitWidth
    || (steppedWidth > 0 ? steppedWidth : Math.max(sectionSpan, fallbackWidth));

  return {
    columns,
    gutter,
    gridLeft,
    gridWidth,
    startAbs: Math.min(...cells.map((cell) => absoluteTop(cell, options.pageHeight || 842))),
  };
}

function buildInsertedCell(anchor, descriptor, idFactory, options) {
  // Generated Languages headings do not carry `editorSectionType`, but the
  // structural detector has already proved that this is a Languages grid.
  // Treat both generated and editor-created grids as the same data-entry
  // surface so the hint remains editor-only instead of becoming PDF content.
  const usesStarterGuidance = descriptor.languageSection
    || descriptor.heading?.editorSectionType === "languages";
  const placeholder = String(
    options.placeholder
    ?? (usesStarterGuidance
      ? `${STARTER_FIELD_PLACEHOLDERS.language_name} · ${STARTER_FIELD_PLACEHOLDERS.language_level}`
      : descriptor.languageSection ? "Język — poziom" : "Nowy wpis"),
  );
  const inserted = {
    ...anchor,
    element_id: idFactory(),
    content: usesStarterGuidance ? "" : placeholder,
    // Language levels receive no automatic colour, weight, or italic run.
    // The complete field remains available to the ordinary text inspector.
    runs: descriptor.languageSection ? null : anchor.runs,
    isSelected: false,
    isEditing: false,
    isMove: false,
    preserveInitialLayout: false,
    gridEntry: true,
    editorGridEntry: true,
    editorAddedGridEntry: true,
    gridSectionId: descriptor.headingId,
  };
  if (usesStarterGuidance) {
    inserted.placeholder = placeholder;
    inserted.starterPlaceholder = true;
    inserted.editorSectionType = "languages";
  }
  // A cloned persisted row must be inserted as a new row on save rather than
  // updating the database identity of the source cell.
  delete inserted.pdf_id;
  delete inserted.resolvedLines;
  return inserted;
}

function measureCellHeight(cell, width, options) {
  const fontSize = Math.max(1, finiteNumber(cell.fontSize, 9));
  const lineHeight = Math.max(1, finiteNumber(cell.lineHeight, fontSize * 1.4));
  return measureTextareaHeight(
    cell.content || cell.placeholder || "",
    width,
    fontSize,
    lineHeight,
    {
      bulletList: Boolean(cell.bulletList),
      measureTextWidth: options.measureTextWidth || null,
      textStyle: {
        fontFamily: cell.fontFamily,
        fontSize,
        bold: Boolean(cell.bold),
        italic: Boolean(cell.italic),
        letterSpacing: finiteNumber(cell.letterSpacing),
      },
    },
  );
}

function layoutCells(cells, descriptor, geometry, pageHeight, idFactory, options) {
  const columnWidth = geometry.gridWidth / geometry.columns;
  const cellWidth = Math.max(12, columnWidth - geometry.gutter);
  const updates = new Map();
  let rowAbs = geometry.startAbs;

  for (let rowStart = 0; rowStart < cells.length; rowStart += geometry.columns) {
    const row = cells.slice(rowStart, rowStart + geometry.columns);
    const rowGroup = `grid-row-${idFactory()}`;
    const heights = row.map((cell) => measureCellHeight(cell, cellWidth, options));
    const rowHeight = Math.max(1, ...heights);

    row.forEach((cell, columnIndex) => {
      const placed = atAbsoluteTop(cell, rowAbs, pageHeight);
      updates.set(cell.element_id, {
        ...placed,
        left: geometry.gridLeft + columnIndex * columnWidth,
        width: cellWidth,
        height: heights[columnIndex],
        autoHeight: true,
        preserveInitialLayout: false,
        flowRole: GRID_FLOW_ROLE,
        flowGroup: rowGroup,
        gridEntry: true,
        gridSectionId: descriptor.headingId,
        gridColumns: geometry.columns,
        gridGutter: geometry.gutter,
        gridWidth: geometry.gridWidth,
        gridLeft: geometry.gridLeft,
        ...(descriptor.languageSection
          ? { runs: null, gridKind: "languages" }
          : {}),
      });
    });
    rowAbs += rowHeight;
  }

  return {
    updates,
    bottomAbs: rowAbs,
  };
}

function sameLane(element, sidebar) {
  return sidebar ? isSidebarLaneElement(element) : !isSidebarLaneElement(element);
}

function rebuildElementOrder(elements, originalCellIds, updates, insertedAfterId = null) {
  const list = [];
  const emitted = new Set();
  for (const element of elements || []) {
    if (!originalCellIds.has(element?.element_id)) {
      list.push(element);
      continue;
    }
    const updated = updates.get(element.element_id);
    if (updated) {
      list.push(updated);
      emitted.add(element.element_id);
    }
    if (element.element_id === insertedAfterId) {
      for (const [elementId, candidate] of updates) {
        if (!originalCellIds.has(elementId) && !emitted.has(elementId)) {
          list.push(candidate);
          emitted.add(elementId);
        }
      }
    }
  }
  for (const [elementId, candidate] of updates) {
    if (!emitted.has(elementId)) list.push(candidate);
  }
  return list;
}

function shiftFollowingLaneContent(elements, descriptor, gridIds, thresholdAbs, delta, pageHeight) {
  if (!(delta > 0)) return elements;
  return (elements || []).map((element) => {
    if (!element || gridIds.has(element.element_id) || element.fixedToPage) return element;
    if (element.flowRole === "masthead" || element.flowRole === "masthead-anchor") return element;
    if (!sameLane(element, descriptor.sidebar)) return element;
    const top = absoluteTop(element, pageHeight);
    if (top + 0.01 < thresholdAbs) return element;
    return atAbsoluteTop(element, top + delta, pageHeight);
  });
}

function findDescriptorForCell(elements, elementId, pageHeight) {
  if (!elementId) return null;
  return sectionDescriptors(elements, pageHeight).find((descriptor) => (
    descriptor.cells.some((cell) => cell.element_id === elementId)
  )) || null;
}

/**
 * Return one hover-control anchor for every managed grid entry.
 *
 * The returned geometry is cell-local, so the integration can paint exactly
 * one outline and exactly two actions (`+` and trash) without exposing generic
 * record reorder/overflow controls.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {Array<object>}
 */
export function listGridSectionEntryAnchors(elements, pageHeight = 842) {
  const anchors = [];
  for (const descriptor of sectionDescriptors(elements, pageHeight)) {
    const geometry = resolveGridGeometry(descriptor, { pageHeight });
    for (const cell of descriptor.cells) {
      const height = elementHeight(cell);
      const width = Math.max(1, finiteNumber(cell.width, 1));
      anchors.push({
        elementId: cell.element_id,
        headingId: descriptor.headingId,
        hoverIds: [cell.element_id],
        left: finiteNumber(cell.left),
        top: finiteNumber(cell.top),
        height,
        width,
        fontSize: finiteNumber(cell.fontSize, 10),
        highlight: {
          left: finiteNumber(cell.left),
          top: finiteNumber(cell.top),
          width,
          height,
        },
        canDelete: descriptor.cells.length > 1,
        columns: geometry.columns,
        gridKind: descriptor.languageSection ? "languages" : "entries",
        gutterSide: descriptor.sidebar ? "left" : "right",
      });
    }
  }
  return anchors;
}

/**
 * Insert a placeholder entry immediately after `afterElementId`, then compact
 * all cells into the section's fixed column count and re-pack the document.
 *
 * Existing ids/content/style are preserved. Only the new cell receives a new
 * id and editor marker. Language cells deliberately receive no inline runs,
 * so the complete `Name — Level` line uses one uniform text style.
 *
 * @param {object[]} elements
 * @param {string} afterElementId
 * @param {number} [pageHeight=842]
 * @param {{columns?:number,gutter?:number,gridWidth?:number,recordWidth?:number,bodyLeft?:number,placeholder?:string,spacing?:object,idFactory?:()=>string,measureTextWidth?:Function}} [options]
 * @returns {{elements:object[],entryId:string,firstBodyId:string,headingId:string}|null}
 */
export function insertGridSectionEntry(
  elements,
  afterElementId,
  pageHeight = 842,
  options = {},
) {
  const descriptor = findDescriptorForCell(elements, afterElementId, pageHeight);
  if (!descriptor) return null;
  const anchorIndex = descriptor.cells.findIndex((cell) => cell.element_id === afterElementId);
  if (anchorIndex < 0) return null;

  const idFactory = options.idFactory || nanoid;
  const inserted = buildInsertedCell(
    descriptor.cells[anchorIndex],
    descriptor,
    idFactory,
    options,
  );
  const cells = [
    ...descriptor.cells.slice(0, anchorIndex + 1),
    inserted,
    ...descriptor.cells.slice(anchorIndex + 1),
  ];
  const geometry = resolveGridGeometry(descriptor, { ...options, pageHeight });
  const oldBottomAbs = Math.max(...descriptor.cells.map((cell) => (
    absoluteTop(cell, pageHeight) + elementHeight(cell)
  )));
  const { updates, bottomAbs } = layoutCells(
    cells,
    descriptor,
    geometry,
    pageHeight,
    idFactory,
    options,
  );
  const originalCellIds = new Set(descriptor.cells.map((cell) => cell.element_id));
  let next = rebuildElementOrder(elements, originalCellIds, updates, afterElementId);
  next = shiftFollowingLaneContent(
    next,
    descriptor,
    new Set(cells.map((cell) => cell.element_id)),
    oldBottomAbs,
    Math.max(0, bottomAbs - oldBottomAbs),
    pageHeight,
  );
  next = applyFlowSpacing(
    next,
    options.spacing || DEFAULT_FLOW_SPACING,
    pageHeight,
  );

  return {
    elements: next,
    entryId: inserted.element_id,
    firstBodyId: inserted.element_id,
    headingId: descriptor.headingId,
  };
}

/**
 * Delete one managed grid entry and compact later entries left/up.
 *
 * The last entry is protected: without a surviving cell there would be no
 * per-cell `+` trigger for rebuilding the section. Callers should render the
 * returned anchor's trash action disabled when `canDelete` is false.
 *
 * `removedElements` includes semantic grid metadata for the cv_data sync layer;
 * the generated language cell may predate those tags, so relying only on its
 * original `flowGroup` cannot identify the canonical `languages` array entry.
 *
 * @param {object[]} elements
 * @param {string} elementId
 * @param {number} [pageHeight=842]
 * @param {{columns?:number,gutter?:number,gridWidth?:number,recordWidth?:number,bodyLeft?:number,spacing?:object,idFactory?:()=>string,measureTextWidth?:Function}} [options]
 * @returns {{elements:object[],removedIds:Set<string>,removedElements:object[],headingId:string}|null}
 */
export function removeGridSectionEntry(
  elements,
  elementId,
  pageHeight = 842,
  options = {},
) {
  const descriptor = findDescriptorForCell(elements, elementId, pageHeight);
  if (!descriptor || descriptor.cells.length <= 1) return null;
  const removed = descriptor.cells.find((cell) => cell.element_id === elementId);
  if (!removed) return null;

  const cells = descriptor.cells.filter((cell) => cell.element_id !== elementId);
  const idFactory = options.idFactory || nanoid;
  const geometry = resolveGridGeometry(descriptor, { ...options, pageHeight });
  const { updates } = layoutCells(
    cells,
    descriptor,
    geometry,
    pageHeight,
    idFactory,
    options,
  );
  const originalCellIds = new Set(descriptor.cells.map((cell) => cell.element_id));
  let next = rebuildElementOrder(elements, originalCellIds, updates);
  next = applyFlowSpacing(
    next,
    options.spacing || DEFAULT_FLOW_SPACING,
    pageHeight,
  );

  return {
    elements: next,
    removedIds: new Set([elementId]),
    removedElements: [{
      ...removed,
      gridEntry: true,
      gridSectionId: descriptor.headingId,
      gridKind: descriptor.languageSection ? "languages" : "entries",
      deletedGridEntry: true,
    }],
    headingId: descriptor.headingId,
  };
}
