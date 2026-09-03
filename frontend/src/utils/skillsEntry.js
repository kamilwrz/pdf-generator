/**
 * Direct, mode-aware additions to main-column Skills groups.
 *
 * The canvas stores the same semantic list in three different shapes: one
 * textarea joined with mid-dots, one bullet textarea, or rectangle/line + text
 * chip pairs. These helpers expose one group descriptor to the UI and update
 * only the chosen group, keeping existing element identities and styling.
 */
import { nanoid } from "nanoid";
import { measureTextareaHeight } from "./textareaHeight.js";
import { parseFlatListItems } from "./flatSectionLayout.js";
import {
  applyFlowSpacing,
  deriveSectionStyle,
  isSidebarLaneElement,
  listDocumentSections,
  sectionElementIds,
} from "./sectionStructure.js";
import {
  SKILL_CHIP_PAD_X,
  SKILL_CHIP_PAD_Y,
  SKILLS_LAYOUT_CHIPS,
  detectSkillsDisplayMode,
  isSkillsSectionTitle,
  layoutSkillChips,
} from "./skillsLayout.js";

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function absoluteTop(element, pageHeight) {
  const page = Math.max(1, Math.trunc(finiteNumber(element?.page, 1)));
  return (page - 1) * pageHeight + finiteNumber(element?.top);
}

function elementHeight(element) {
  const explicit = finiteNumber(element?.height);
  if (explicit > 0) return explicit;
  return Math.max(1, finiteNumber(element?.fontSize, 10) * 1.35);
}

function absoluteBottom(element, pageHeight) {
  return absoluteTop(element, pageHeight) + elementHeight(element);
}

function atAbsoluteTop(element, top, pageHeight) {
  const safeTop = Math.max(0, finiteNumber(top));
  const page = Math.max(1, Math.floor(safeTop / pageHeight) + 1);
  return {
    ...element,
    page,
    top: safeTop - (page - 1) * pageHeight,
  };
}

function byReadingOrder(pageHeight) {
  return (left, right) => {
    const topDelta = absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight);
    if (Math.abs(topDelta) > 0.01) return topDelta;
    return finiteNumber(left?.left) - finiteNumber(right?.left);
  };
}

function isTextElement(element) {
  return element?.category === "text" || element?.category === "textarea";
}

function isSectionChrome(element) {
  return element?.flowRole === "section-chrome"
    || element?.flowRole === "sidebar-chrome";
}

function normalizedSkill(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function sameSkill(left, right) {
  return normalizedSkill(left).toLocaleLowerCase("pl-PL")
    === normalizedSkill(right).toLocaleLowerCase("pl-PL");
}

function groupIdFor(element) {
  return element?.flowGroup || `flat:${element?.element_id}`;
}

function groupDescriptorsForSection(elements, section, pageHeight) {
  const memberIds = sectionElementIds(elements, section.headingId, pageHeight);
  const members = elements.filter((element) => memberIds.has(element.element_id));
  const mode = detectSkillsDisplayMode(members);
  const readingOrder = byReadingOrder(pageHeight);
  const groups = [];

  if (mode === SKILLS_LAYOUT_CHIPS) {
    const labels = members
      .filter((element) => element?.flowRole === "grid-member" && element.category === "text")
      .sort(readingOrder);
    const orderedIds = [...new Set(labels.map(groupIdFor))];
    for (const groupId of orderedIds) {
      const nativeFlowGroup = groupId.startsWith("flat:") ? null : groupId;
      const groupMembers = nativeFlowGroup
        ? members.filter((element) => element?.flowGroup === nativeFlowGroup)
        : labels.filter((element) => groupIdFor(element) === groupId);
      const groupLabels = labels.filter((element) => groupIdFor(element) === groupId);
      groups.push({
        headingId: section.headingId,
        groupId,
        nativeFlowGroup,
        mode,
        members,
        groupMembers,
        body: null,
        category: groupMembers.find((element) => (
          isTextElement(element) && element.flowRole !== "grid-member" && Boolean(element.bold)
        )) || null,
        labels: groupLabels,
        shapes: groupMembers
          .filter((element) => (
            element?.flowRole === "grid-member"
            && (element.category === "rectangle" || element.category === "line")
          ))
          .sort(readingOrder),
        items: groupLabels.map((element) => normalizedSkill(element.content)).filter(Boolean),
      });
    }
    return groups;
  }

  const content = members
    .filter((element) => isTextElement(element) && !isSectionChrome(element))
    .sort(readingOrder);
  const byFlowGroup = new Map();
  for (const element of content) {
    if (!element.flowGroup) continue;
    const bucket = byFlowGroup.get(element.flowGroup) || [];
    bucket.push(element);
    byFlowGroup.set(element.flowGroup, bucket);
  }

  if (byFlowGroup.size > 0) {
    for (const [nativeFlowGroup, groupMembers] of byFlowGroup) {
      const category = groupMembers.find((element) => Boolean(element.bold)) || null;
      const body = groupMembers.find((element) => !element.bold) || null;
      groups.push({
        headingId: section.headingId,
        groupId: nativeFlowGroup,
        nativeFlowGroup,
        mode,
        members,
        groupMembers,
        body,
        category,
        labels: [],
        shapes: [],
        items: body ? parseFlatListItems(body.content, Boolean(body.bulletList)) : [],
      });
    }
    // A flat Skills body can coexist with unrelated decorative flow groups.
    // Keep every ungrouped non-heading body independently addressable.
    for (const body of content.filter((element) => !element.flowGroup && !element.bold)) {
      groups.push({
        headingId: section.headingId,
        groupId: groupIdFor(body),
        nativeFlowGroup: null,
        mode,
        members,
        groupMembers: [body],
        body,
        category: null,
        labels: [],
        shapes: [],
        items: parseFlatListItems(body.content, Boolean(body.bulletList)),
      });
    }
  } else if (content.length === 1 || content.every((element) => !element.bold)) {
    // A category-free Skills section is one anonymous group regardless of how
    // many legacy text fragments happen to represent it. The normal generated
    // shape is a single textarea and is the editable insertion target.
    const body = content.find((element) => !element.bold) || content[0];
    if (body) {
      groups.push({
        headingId: section.headingId,
        groupId: groupIdFor(body),
        nativeFlowGroup: null,
        mode,
        members,
        groupMembers: [body],
        body,
        category: null,
        labels: [],
        shapes: [],
        items: parseFlatListItems(body.content, Boolean(body.bulletList)),
      });
    }
  } else {
    // Legacy grouped sections may predate flowGroup. Pair each bold category
    // with the following body in reading order so they still receive a useful
    // per-category add control without rewriting the document first.
    let pendingCategory = null;
    for (const element of content) {
      if (element.bold) {
        pendingCategory = element;
        continue;
      }
      groups.push({
        headingId: section.headingId,
        groupId: `legacy:${pendingCategory?.element_id || element.element_id}`,
        nativeFlowGroup: null,
        mode,
        members,
        groupMembers: [pendingCategory, element].filter(Boolean),
        body: element,
        category: pendingCategory,
        labels: [],
        shapes: [],
        items: parseFlatListItems(element.content, Boolean(element.bulletList)),
      });
      pendingCategory = null;
    }
  }

  return groups.sort((left, right) => {
    const leftTop = Math.min(...left.groupMembers.map((element) => absoluteTop(element, pageHeight)));
    const rightTop = Math.min(...right.groupMembers.map((element) => absoluteTop(element, pageHeight)));
    return leftTop - rightTop;
  });
}

function skillGroupDescriptors(elements, pageHeight) {
  const list = elements || [];
  return listDocumentSections(list, pageHeight).flatMap((section) => (
    isSkillsSectionTitle(section.title)
      ? groupDescriptorsForSection(list, section, pageHeight)
      : []
  ));
}

function anchorForGroup(group, pageHeight) {
  const visualMembers = group.groupMembers.filter((element) => (
    !isSectionChrome(element) && element?.category !== "connector"
  ));
  if (visualMembers.length === 0) return null;
  const bottomAbs = Math.max(...visualMembers.map((element) => absoluteBottom(element, pageHeight)));
  const page = Math.max(1, Math.floor(Math.max(0, bottomAbs - 0.01) / pageHeight) + 1);
  const onPage = visualMembers.filter((element) => (
    Math.max(1, Math.trunc(finiteNumber(element.page, 1))) === page
  ));
  const horizontalMembers = onPage.length > 0 ? onPage : visualMembers;
  const left = Math.min(...horizontalMembers.map((element) => finiteNumber(element.left)));
  const right = Math.max(...horizontalMembers.map((element) => (
    finiteNumber(element.left) + Math.max(
      1,
      finiteNumber(element.width, finiteNumber(element.fontSize, 10) * normalizedSkill(element.content).length * 0.56),
    )
  )));
  // Grouped Skills reserve the category label for the existing structural
  // record toolbar. The body (or chip cells) owns the entry action, so pointer
  // and keyboard discovery never races two exclusive toolbars on one node.
  const textTriggers = group.groupMembers
    .filter((element) => isTextElement(element) && element !== group.category)
    .map((element) => element.element_id);
  const shapeTriggers = group.groupMembers
    .filter((element) => element?.flowRole === "grid-member")
    .map((element) => element.element_id);
  const triggerIds = [...new Set([...textTriggers, ...shapeTriggers])];
  // Mount on a stable authored node rather than the last chip label. A newly
  // appended chip then moves the anchor without unmounting an open/closing
  // controller before it can restore keyboard focus.
  const mounted = group.category
    || group.body
    || [...group.groupMembers].filter(isTextElement).sort(byReadingOrder(pageHeight))[0];
  if (!mounted || triggerIds.length === 0) return null;

  return {
    headingId: group.headingId,
    groupId: group.groupId,
    mode: group.mode,
    categoryLabel: normalizedSkill(group.category?.content),
    triggerIds,
    mountElementId: mounted.element_id,
    page,
    left,
    width: Math.max(1, right - left),
    bottom: bottomAbs - (page - 1) * pageHeight,
    items: group.items,
  };
}

/**
 * Return one application-only insertion anchor for every main-column Skills
 * category, or one anonymous anchor for a category-free section.
 *
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {Array<object>}
 */
export function listSkillsEntryAnchors(elements, pageHeight = 842) {
  return skillGroupDescriptors(elements, pageHeight)
    .map((group) => anchorForGroup(group, pageHeight))
    .filter(Boolean);
}

function shiftFollowingMainContent(elements, excludedIds, thresholdAbs, delta, pageHeight) {
  if (!(delta > 0)) return elements;
  return elements.map((element) => {
    if (!element || excludedIds.has(element.element_id) || element.fixedToPage) return element;
    if (element.flowRole === "masthead" || element.flowRole === "masthead-anchor") return element;
    if (isSidebarLaneElement(element)) return element;
    if (absoluteTop(element, pageHeight) + 0.01 < thresholdAbs) return element;
    return atAbsoluteTop(element, absoluteTop(element, pageHeight) + delta, pageHeight);
  });
}

function insertElementsAfterGroup(elements, groupIds, additions) {
  const lastIndex = elements.reduce(
    (index, element, candidateIndex) => (groupIds.has(element.element_id) ? candidateIndex : index),
    -1,
  );
  if (lastIndex < 0) return [...elements, ...additions];
  return [
    ...elements.slice(0, lastIndex + 1),
    ...additions,
    ...elements.slice(lastIndex + 1),
  ];
}

function cloneAsNewElement(source, elementId) {
  const next = {
    ...source,
    element_id: elementId,
    isSelected: false,
    isEditing: false,
    isMove: false,
    preserveInitialLayout: false,
  };
  delete next.pdf_id;
  delete next.resolvedLines;
  return next;
}

function addTextModeSkill(elements, group, value, pageHeight, options) {
  const body = group.body;
  const style = deriveSectionStyle(elements, pageHeight, group.headingId, { lane: "main" });
  const isBullet = group.mode === "bullet";
  let insertedId = body?.element_id || options.idFactory();
  let updatedBody;
  let oldBottomAbs;
  const groupIds = new Set(group.groupMembers.map((element) => element.element_id));

  if (body) {
    const current = String(body.content || "").replace(/\s+$/, "");
    const content = current
      ? `${current}${isBullet ? "\n• " : "  ·  "}${value}`
      : `${isBullet ? "• " : ""}${value}`;
    const fontSize = Math.max(1, finiteNumber(body.fontSize, finiteNumber(style?.body?.fontSize, 9.5)));
    const lineHeight = Math.max(1, finiteNumber(body.lineHeight, finiteNumber(style?.body?.lineHeight, fontSize * 1.4)));
    const width = Math.max(1, finiteNumber(body.width, finiteNumber(style?.recordWidth, 300)));
    updatedBody = {
      ...body,
      content,
      bulletList: isBullet,
      height: measureTextareaHeight(content, width, fontSize, lineHeight, {
        bulletList: isBullet,
        measureTextWidth: options.measureTextWidth,
        textStyle: {
          fontFamily: body.fontFamily,
          fontSize,
          bold: Boolean(body.bold),
          italic: Boolean(body.italic),
          letterSpacing: finiteNumber(body.letterSpacing),
        },
      }),
      autoHeight: true,
      preserveInitialLayout: false,
    };
    oldBottomAbs = absoluteBottom(body, pageHeight);
  } else {
    const category = group.category;
    if (!category) return null;
    const bodyStyle = style?.body || {};
    const fontSize = Math.max(1, finiteNumber(bodyStyle.fontSize, finiteNumber(category.fontSize, 9.5)));
    const lineHeight = Math.max(1, finiteNumber(bodyStyle.lineHeight, fontSize * 1.4));
    const width = Math.max(1, finiteNumber(style?.recordWidth, finiteNumber(category.width, 300)));
    const topAbs = absoluteBottom(category, pageHeight) + finiteNumber(options.spacing?.stack, 4);
    const content = `${isBullet ? "• " : ""}${value}`;
    updatedBody = atAbsoluteTop({
      element_id: insertedId,
      category: "textarea",
      content,
      left: finiteNumber(style?.bodyLeft, finiteNumber(category.left)),
      width,
      height: measureTextareaHeight(content, width, fontSize, lineHeight, {
        bulletList: isBullet,
        measureTextWidth: options.measureTextWidth,
        textStyle: { ...bodyStyle, fontSize },
      }),
      fontSize,
      lineHeight,
      fontFamily: bodyStyle.fontFamily || category.fontFamily,
      color: bodyStyle.color || category.color,
      bold: false,
      italic: false,
      underline: false,
      runs: null,
      align: "left",
      bulletList: isBullet,
      autoHeight: true,
      preserveInitialLayout: false,
      flowRole: "content",
      flowGroup: group.nativeFlowGroup || `skill-group-${options.idFactory()}`,
      zIndex: 3,
    }, topAbs, pageHeight);
    oldBottomAbs = absoluteBottom(category, pageHeight);
  }

  const oldHeight = body ? elementHeight(body) : 0;
  const growth = body
    ? Math.max(0, elementHeight(updatedBody) - oldHeight)
    : Math.max(0, absoluteBottom(updatedBody, pageHeight) - oldBottomAbs);
  let next = elements.map((element) => (
    body && element.element_id === body.element_id ? updatedBody : element
  ));
  if (!body) next = insertElementsAfterGroup(next, groupIds, [updatedBody]);
  next = shiftFollowingMainContent(next, new Set([...groupIds, insertedId]), oldBottomAbs, growth, pageHeight);
  next = applyFlowSpacing(next, options.spacing, pageHeight);
  return { elements: next, elementId: insertedId };
}

function addChipModeSkill(elements, group, value, pageHeight, options) {
  if (group.labels.length === 0 || group.shapes.length === 0) return null;
  const readingOrder = byReadingOrder(pageHeight);
  const labels = [...group.labels].sort(readingOrder);
  const shapes = [...group.shapes].sort(readingOrder);
  const baseLabel = labels[0];
  const baseShape = shapes[0];
  const style = deriveSectionStyle(elements, pageHeight, group.headingId, { lane: "main" });
  const fontSize = Math.max(1, finiteNumber(baseLabel.fontSize, finiteNumber(style?.body?.fontSize, 9.5)));
  const chipHeight = baseShape.category === "rectangle"
    ? Math.max(1, finiteNumber(baseShape.height, fontSize + 2 * SKILL_CHIP_PAD_Y))
    : fontSize + 2 * SKILL_CHIP_PAD_Y;
  const bodyLeft = Math.min(...shapes.map((shape) => finiteNumber(shape.left)));
  const recordWidth = Math.max(1, finiteNumber(style?.recordWidth, 300));
  const startAbs = Math.min(...labels.map((label) => (
    absoluteTop(label, pageHeight) - chipHeight / 2
  )));
  const oldBottomAbs = Math.max(...shapes.map((shape) => absoluteBottom(shape, pageHeight)));
  const { placements, height } = layoutSkillChips(
    [...group.items, value],
    recordWidth,
    fontSize,
    {
      measureTextWidth: options.measureTextWidth,
      textStyle: {
        fontFamily: baseLabel.fontFamily,
        fontSize,
        bold: Boolean(baseLabel.bold),
        italic: Boolean(baseLabel.italic),
        letterSpacing: finiteNumber(baseLabel.letterSpacing),
      },
    },
  );
  const updates = new Map();

  labels.forEach((label, index) => {
    const placement = placements[index];
    if (!placement) return;
    updates.set(label.element_id, atAbsoluteTop({
      ...label,
      left: bodyLeft + placement.dx + SKILL_CHIP_PAD_X,
      ...(Number.isFinite(Number(label.width))
        ? { width: Math.max(1, placement.width - 2 * SKILL_CHIP_PAD_X) }
        : {}),
      preserveInitialLayout: false,
    }, startAbs + placement.dy + chipHeight / 2, pageHeight));
  });
  shapes.forEach((shape, index) => {
    const placement = placements[index];
    if (!placement) return;
    const shapeTop = startAbs + placement.dy
      + (shape.category === "line" ? chipHeight - 1 : 0);
    updates.set(shape.element_id, atAbsoluteTop({
      ...shape,
      left: bodyLeft + placement.dx,
      width: placement.width,
      preserveInitialLayout: false,
    }, shapeTop, pageHeight));
  });

  const placement = placements.at(-1);
  const shapeId = options.idFactory();
  const labelId = options.idFactory();
  const shapeTop = startAbs + placement.dy
    + (baseShape.category === "line" ? chipHeight - 1 : 0);
  const newShape = atAbsoluteTop({
    ...cloneAsNewElement(baseShape, shapeId),
    left: bodyLeft + placement.dx,
    width: placement.width,
    flowGroup: group.nativeFlowGroup || baseShape.flowGroup,
  }, shapeTop, pageHeight);
  const newLabel = atAbsoluteTop({
    ...cloneAsNewElement(baseLabel, labelId),
    content: value,
    runs: null,
    left: bodyLeft + placement.dx + SKILL_CHIP_PAD_X,
    ...(Number.isFinite(Number(baseLabel.width))
      ? { width: Math.max(1, placement.width - 2 * SKILL_CHIP_PAD_X) }
      : {}),
    flowGroup: group.nativeFlowGroup || baseLabel.flowGroup,
  }, startAbs + placement.dy + chipHeight / 2, pageHeight);

  const groupIds = new Set(group.groupMembers.map((element) => element.element_id));
  let next = elements.map((element) => updates.get(element.element_id) || element);
  next = insertElementsAfterGroup(next, groupIds, [newShape, newLabel]);
  const growth = Math.max(0, startAbs + height - oldBottomAbs);
  next = shiftFollowingMainContent(
    next,
    new Set([...groupIds, shapeId, labelId]),
    oldBottomAbs,
    growth,
    pageHeight,
  );
  next = applyFlowSpacing(next, options.spacing, pageHeight);
  return { elements: next, elementId: labelId };
}

/**
 * Add one skill to a main-column category without changing its display mode.
 *
 * @param {object[]} elements
 * @param {string} headingId
 * @param {string} groupId
 * @param {string} value
 * @param {number} [pageHeight=842]
 * @param {{spacing?:object,idFactory?:()=>string,measureTextWidth?:Function|null}} [options]
 * @returns {{elements?:object[],elementId?:string,error?:"empty"|"duplicate"|"not-found"}}
 */
export function insertSkillItem(
  elements,
  headingId,
  groupId,
  value,
  pageHeight = 842,
  options = {},
) {
  const skill = normalizedSkill(value);
  if (!skill) return { error: "empty" };
  const group = skillGroupDescriptors(elements, pageHeight).find((candidate) => (
    candidate.headingId === headingId && candidate.groupId === groupId
  ));
  if (!group) return { error: "not-found" };
  if (group.items.some((item) => sameSkill(item, skill))) return { error: "duplicate" };

  const resolvedOptions = {
    spacing: options.spacing,
    idFactory: options.idFactory || nanoid,
    measureTextWidth: options.measureTextWidth || null,
  };
  const result = group.mode === SKILLS_LAYOUT_CHIPS
    ? addChipModeSkill(elements, group, skill, pageHeight, resolvedOptions)
    : addTextModeSkill(elements, group, skill, pageHeight, resolvedOptions);
  return result || { error: "not-found" };
}
