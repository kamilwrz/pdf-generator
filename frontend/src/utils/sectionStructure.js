/**
 * Structural section helpers for template-mode editing.
 *
 * Prefer explicit `flowRole: "section-chrome"` headings. For older / untagged
 * generators (e.g. Cinder), fall back to short label text sitting just above
 * a horizontal rule — the usual section chrome pattern.
 */

function absoluteTop(element, pageHeight = 842) {
  const page = Math.max(1, Math.trunc(Number(element?.page) || 1));
  return (page - 1) * pageHeight + (Number(element?.top) || 0);
}

function hasSectionRuleBelow(element, elements, pageHeight) {
  const abs = absoluteTop(element, pageHeight);
  const left = Number(element.left) || 0;
  return (elements || []).some((other) => {
    if (!other || other.fixedToPage) return false;
    if (other.category !== "line") return false;
    const width = Number(other.width) || 0;
    const height = Number(other.height) || 0;
    // Section underlines are wide and thin; page frames are full-bleed tall.
    if (width < 120 || height > 4) return false;
    const otherAbs = absoluteTop(other, pageHeight);
    const gap = otherAbs - abs;
    if (gap < 1 || gap > 32) return false;
    // Same visual column (Cinder rules start near the label left).
    const otherLeft = Number(other.left) || 0;
    return Math.abs(otherLeft - left) <= 40;
  });
}

/**
 * Whether this element is a section heading label.
 * @param {object|null|undefined} element
 * @param {object[]} [elements]
 * @param {number} [pageHeight=842]
 */
export function isSectionHeading(element, elements = [], pageHeight = 842) {
  if (!element || element.fixedToPage) return false;
  if (element.category !== "text" && element.category !== "textarea") return false;
  const content = String(element.content || "").trim();
  if (!content) return false;

  if (element.flowRole === "section-chrome") return true;
  // Explicit body content is never a section title.
  if (element.flowRole === "content") return false;
  if (element.autoHeight || element.flowGroup) return false;
  if (content.length > 56) return false;

  const fontSize = Number(element.fontSize) || 12;
  // Masthead names are larger; body copy is usually autoHeight textareas.
  if (fontSize < 7 || fontSize > 11.5) return false;

  return hasSectionRuleBelow(element, elements, pageHeight);
}

/**
 * List document sections in reading order.
 * @param {object[]} elements
 * @param {number} [pageHeight=842]
 * @returns {{ id: string, title: string, headingId: string, startAbs: number, index: number }[]}
 */
export function listDocumentSections(elements, pageHeight = 842) {
  const list = elements || [];
  const headings = list
    .filter((element) => isSectionHeading(element, list, pageHeight))
    .sort((left, right) => absoluteTop(left, pageHeight) - absoluteTop(right, pageHeight));

  return headings.map((heading, index) => ({
    id: heading.element_id,
    title: String(heading.content || "").trim(),
    headingId: heading.element_id,
    startAbs: absoluteTop(heading, pageHeight),
    index,
  }));
}

/**
 * Collect element ids belonging to the section that starts at `headingId`
 * (heading + chrome nearby + content until the next section heading).
 */
export function sectionElementIds(elements, headingId, pageHeight = 842) {
  const sections = listDocumentSections(elements, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return new Set();
  const start = sections[index].startAbs;
  const end = index + 1 < sections.length
    ? sections[index + 1].startAbs
    : Number.POSITIVE_INFINITY;

  const ids = new Set();
  for (const element of elements || []) {
    if (element.fixedToPage) continue;
    const abs = absoluteTop(element, pageHeight);
    // Include chrome a few px above the heading (icon/rule band).
    if (abs >= start - 24 && abs < end - 0.01) {
      ids.add(element.element_id);
    }
  }
  return ids;
}

/**
 * Swap two adjacent sections by exchanging their absolute vertical spans.
 * @returns {object[]|null} new elements, or null if move is invalid
 */
export function reorderSection(elements, headingId, direction, pageHeight = 842) {
  const sections = listDocumentSections(elements, pageHeight);
  const index = sections.findIndex((section) => section.headingId === headingId);
  if (index < 0) return null;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= sections.length) return null;

  const a = sections[index];
  const b = sections[swapWith];
  const first = a.startAbs <= b.startAbs ? a : b;
  const second = a.startAbs <= b.startAbs ? b : a;
  const idsFirst = sectionElementIds(elements, first.headingId, pageHeight);
  const idsSecond = sectionElementIds(elements, second.headingId, pageHeight);
  const firstBottom = Math.max(
    ...[...elements]
      .filter((element) => idsFirst.has(element.element_id))
      .map((element) => absoluteTop(element, pageHeight) + (Number(element.height) || Number(element.fontSize) || 12)),
  );
  const secondBottom = Math.max(
    ...[...elements]
      .filter((element) => idsSecond.has(element.element_id))
      .map((element) => absoluteTop(element, pageHeight) + (Number(element.height) || Number(element.fontSize) || 12)),
  );
  const heightFirst = firstBottom - first.startAbs;
  const heightSecond = secondBottom - second.startAbs;
  const gap = second.startAbs - firstBottom;
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 16;

  // Place former-second at first.startAbs, former-first after it.
  const deltaSecond = first.startAbs - second.startAbs;
  const newFirstStart = first.startAbs + heightSecond + safeGap;
  const deltaFirst = newFirstStart - first.startAbs;

  return (elements || []).map((element) => {
    let delta = 0;
    if (idsFirst.has(element.element_id)) delta = deltaFirst;
    else if (idsSecond.has(element.element_id)) delta = deltaSecond;
    else return element;

    const nextAbs = absoluteTop(element, pageHeight) + delta;
    const page = Math.max(1, Math.floor(nextAbs / pageHeight) + 1);
    const top = nextAbs - (page - 1) * pageHeight;
    return { ...element, page, top };
  });
}

/**
 * Find a likely profile-photo image slot for template drop targets.
 */
export function findProfilePhotoSlot(elements) {
  const images = (elements || []).filter((element) => (
    element.category === "image"
    && !element.fixedToPage
    && !/template-assets\/iconic\//.test(String(element.src || ""))
  ));
  if (images.length === 0) return null;
  // Prefer larger near-top images (typical headshot placement).
  return [...images].sort((a, b) => {
    const score = (element) => {
      const area = (Number(element.width) || 0) * (Number(element.height) || 0);
      const top = Number(element.top) || 0;
      return area - top * 2;
    };
    return score(b) - score(a);
  })[0];
}
