/**
 * Compare server-generated templates against the same verified interview CV.
 * Browser fonts and the editor's S/compact transactions determine eligibility;
 * this module never sends requests, edits prose or changes the active preview.
 */
import { applyTemplateSmallTypography } from './templatePageFit.js';
import { applyFlowSpacing } from './sectionStructure.js';
import { COMPACT_FLOW_SPACING } from './flowSpacing.js';
import { contentMaxPage, reconcileDocumentPages } from './structureOperation.js';
import { createCanvasTextWidthMeasurer } from './textareaHeight.js';
import { resolveBrowserTextLayouts } from './browserTextLayout.js';

const PAGE_HEIGHT = 842;
const PAGE_WIDTH = 595;
const FLOW_BOTTOM = 770;
const EPSILON = 1;
const CHROME_ROLES = new Set(['record-overlay', 'section-chrome', 'sidebar-chrome']);
const IMMUTABLE_FIELDS = ['content', 'category', 'src', 'fixedToPage', 'flowRole', 'flowGroup',
  'flowLane', 'textTransform', 'fontFamily', 'color', 'backgroundColor', 'bold', 'italic',
  'underline', 'zIndex', 'runs', 'align', 'bulletList'];
const textElement = (element) => ['text', 'textarea'].includes(element.category) && /\S/.test(element.content || '');
const resizedHeight = (element) => element.category === 'textarea' && !element.fixedToPage
  && !['masthead', 'masthead-anchor', ...CHROME_ROLES].includes(element.flowRole);

function localIdFactory(elements) {
  const used = new Set(elements.map(element => element.element_id));
  let next = 0;
  return () => {
    let id;
    do { id = `interview-template-fit-${++next}`; } while (used.has(id));
    used.add(id);
    return id;
  };
}

function withoutLines(elements) {
  return elements.map(element => {
    const { resolvedLines: ignored, ...rest } = element;
    void ignored;
    return rest;
  });
}

async function measuredElements(elements, resolveLayouts) {
  // Discard any old export metadata before every measurement. Font load failure
  // must never be mistaken for a successful earlier measurement of this box.
  const source = withoutLines(elements);
  const resolved = await resolveLayouts(source.map(element => textElement(element)
    ? { ...element, category: 'textarea',
      width: Number(element.width) > 0 ? Number(element.width) : PAGE_WIDTH - Number(element.left),
      lineHeight: Number(element.lineHeight) || Number(element.fontSize) * 1.2 } : element));
  if (!Array.isArray(resolved) || resolved.length !== source.length) throw new Error('Template measurement changed content.');
  return resolved.map((element, index) => {
    const original = source[index];
    if (!original || element.element_id !== original.element_id) throw new Error('Invalid template text measurement.');
    if (element.content !== original.content) throw new Error('Template measurement changed content.');
    if (textElement(original) && !element.resolvedLines?.length) throw new Error('Template fonts could not be measured.');
    const height = element.resolvedLines?.length * Number(element.lineHeight);
    if (textElement(original) && (!Number.isFinite(height) || height <= 0)) throw new Error('Invalid template text height.');
    // The canvas display block has no padding or border. The heuristic's six
    // extra pixels belong to unmeasured estimates; repeating that allowance
    // for every measured field incorrectly rejects otherwise fitting CVs.
    return { ...original, resolvedLines: element.resolvedLines,
      ...(resizedHeight(original) ? { height: Math.ceil(height), preserveInitialLayout: true } : {}) };
  });
}

function preservesContent(source, candidate) {
  const byId = new Map(candidate.map(element => [element.element_id, element]));
  if (byId.size !== candidate.length || candidate.some(element => !element.element_id || element.deleted)) return false;
  // Match the server's geometry-only commit contract. Each template already
  // supplies its own column allocation; fitting cannot reclassify sections or
  // drop non-fixed chrome, even when the generic editor packer permits that.
  return source.filter(element => !element.fixedToPage).every(element => {
    const next = byId.get(element.element_id);
    return next && IMMUTABLE_FIELDS.every(key => JSON.stringify(next[key]) === JSON.stringify(element[key]))
      && (!element.fontSize || Number(next.fontSize) >= Number(element.fontSize) * .85)
      && (!next.photoSlotHidden || element.photoSlotHidden);
  });
}

function overlap(left, right) {
  return Math.min(left.right, right.right) - Math.max(left.left, right.left) > EPSILON
    && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > EPSILON;
}

function hasValidGeometry(elements) {
  const painted = [];
  for (const element of elements) {
    if (!textElement(element) && !(element.src && !element.fixedToPage && !CHROME_ROLES.has(element.flowRole))) continue;
    const left = Number(element.left);
    // Single-line template text stores its optical baseline rather than a
    // textarea box. Reuse its canvas em-box convention without persisting a
    // synthetic width/height or changing the fixed PDF heading geometry.
    const singleLine = element.category === 'text';
    const lineHeight = Number(element.lineHeight) || Number(element.fontSize) * 1.2;
    const top = Number(element.top) - (singleLine ? Number(element.fontSize) * .67 : 0);
    const width = Number(element.width) > 0 ? Number(element.width) : PAGE_WIDTH - left;
    const height = singleLine ? lineHeight : Number(element.height);
    if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0
      || left < -EPSILON || top < -EPSILON || left + width > PAGE_WIDTH + EPSILON
      || top + height > PAGE_HEIGHT + EPSILON || Number(element.page || 1) !== 1) return false;
    if (resizedHeight(element) && top + height > FLOW_BOTTOM + EPSILON) return false;
    if (!textElement(element)) {
      painted.push({ id: element.element_id, left, top, right: left + width, bottom: top + height });
      continue;
    }
    if (singleLine && element.resolvedLines.length !== 1) return false;
    if (element.resolvedLines.length * lineHeight > height + EPSILON) return false;
    element.resolvedLines.forEach((line, index) => {
      if (!/\S/.test(line.text || '')) return;
      const offset = Number(line.xOffset);
      const advance = Number(line.advanceWidth);
      painted.push({ id: element.element_id, left: left + offset, top: top + index * lineHeight,
        right: left + offset + advance, bottom: top + (index + 1) * lineHeight,
        invalid: !Number.isFinite(offset) || !Number.isFinite(advance) || advance <= 0
          || offset < -EPSILON || offset + advance > width + EPSILON });
    });
  }
  // Check painted lines instead of full textarea rectangles. Dates and titles
  // may intentionally share a wide alignment box while their glyphs do not.
  return !painted.some((box, index) => box.invalid || painted.slice(index + 1)
    .some(other => box.id !== other.id && overlap(box, other)));
}

/**
 * Measure one template at S and the shared compact spacing floor.
 *
 * @param {object} candidate - Server template geometry for verified CV content.
 * @param {object} [options] - Lifecycle guard and injectable browser measurement.
 * @returns {Promise<object|null>} A verified one-page layout, or null if it does
 * not fit or the caller became stale. Throws for unmeasurable/invalid geometry.
 */
export async function measureInterviewTemplateCandidate(candidate, {
  isCurrent = () => true, resolveLayouts = resolveBrowserTextLayouts,
  measureTextWidth = createCanvasTextWidthMeasurer(),
} = {}) {
  if (!isCurrent()) return null;
  if (!candidate?.template_id || !Array.isArray(candidate.elements) || candidate.elements.length === 0) {
    throw new Error('Missing template layout.');
  }
  const source = await measuredElements(candidate.elements, resolveLayouts);
  if (!isCurrent()) return null;
  const createId = localIdFactory(source);
  const spacing = { ...COMPACT_FLOW_SPACING };
  let elements = applyTemplateSmallTypography({ elements: withoutLines(source),
    templateId: candidate.template_id, spacing, createId, measureTextWidth });
  if (!elements) throw new Error('Template does not support small typography.');
  // Remeasure after packing so contact relayout and typography changes cannot
  // preserve stale wrap heights. Keep the canonical template's lane allocation;
  // the optional editor-only main-to-sidebar transfer changes immutable style.
  for (let pass = 0; pass < 3; pass += 1) {
    elements = await measuredElements(elements, resolveLayouts);
    if (!isCurrent()) return null;
    elements = reconcileDocumentPages(applyFlowSpacing(withoutLines(elements), spacing, PAGE_HEIGHT),
      createId, { collapseEmpty: true }).elements;
  }
  const measured = await measuredElements(elements, resolveLayouts);
  if (!isCurrent()) return null;
  if (!preservesContent(candidate.elements, measured)) throw new Error('Template fitting changed content.');
  if (contentMaxPage(measured) !== 1) return null;
  // The last measurement validates the committed boxes; a final height change
  // would need another pack, so it must not silently certify this candidate.
  if (measured.some((element, index) => resizedHeight(element)
    && Number(element.height) > Number(elements[index]?.height) + EPSILON)
    || !hasValidGeometry(measured)) throw new Error('Template fitting could not verify a clear one-page layout.');
  return { ...candidate, elements: withoutLines(measured), pages: 1,
    spacing_px: spacing, typography_preset: 'S' };
}

/**
 * Check templates sequentially without exposing stale or fallback-font results.
 *
 * @param {object} response - The revision-bound preview-templates API response.
 * @param {object} [options] - isCurrent guards navigation/revision changes;
 * onProgress receives {completed,total,templateId} after each completed trial.
 * measureCandidate is injectable for deterministic lifecycle tests.
 * @returns {Promise<{candidates: object[], failedTemplateIds: string[], cancelled: boolean}>}
 * Failed measurements do not discard successful alternatives. A cancelled scan
 * returns no selectable candidates because its source snapshot may be stale.
 */
export async function measureInterviewTemplateCandidates(response, {
  isCurrent = () => true, onProgress = () => {}, measureCandidate = measureInterviewTemplateCandidate,
} = {}) {
  const candidates = [];
  const failedTemplateIds = [];
  const source = response?.candidates;
  if (!Array.isArray(source) || Number(response?.target_pages) !== 1
    || source.some(item => !item || typeof item.template_id !== 'string' || !item.template_id)
    || new Set(source.map(item => item.template_id)).size !== source.length) {
    throw new Error('Invalid template comparison response.');
  }
  const cancelled = () => ({ candidates: [], failedTemplateIds, cancelled: true });
  for (let index = 0; index < source.length; index += 1) {
    if (!isCurrent()) return cancelled();
    const candidate = source[index];
    try {
      const measured = await measureCandidate(candidate, { isCurrent });
      if (!isCurrent()) return cancelled();
      if (measured?.pages === 1) candidates.push(measured);
    } catch {
      if (!isCurrent()) return cancelled();
      failedTemplateIds.push(candidate.template_id);
    }
    onProgress({ completed: index + 1, total: source.length, templateId: candidate.template_id });
    // Loaded fonts can resolve every await in the same microtask queue. Yield
    // between templates so progress can paint and cancel/save input can run
    // even when the whole font set is already cached.
    if (index + 1 < source.length) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return isCurrent() ? { candidates, failedTemplateIds, cancelled: false } : cancelled();
}
