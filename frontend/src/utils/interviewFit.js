/**
 * Automatic interview layout uses the editor's real typography transactions.
 * Trials never touch React, history, answers or autosave. The server publishes
 * one verified content/geometry snapshot and owns all paid iteration limits.
 */
import { applyTemplateTypography, findTemplateFitForTarget } from './templatePageFit.js';
import { applyFitPack, buildSpacingLadder } from './fitToPages.js';
import { COMPACT_FLOW_SPACING, normalizeFlowSpacing, scaleFlowSpacing } from './flowSpacing.js';
import { contentMaxPage, reconcileDocumentPages } from './structureOperation.js';
import { measureDocumentPageFills } from './layoutDensity.js';
import { createCanvasTextWidthMeasurer } from './textareaHeight.js';
import { resolveBrowserTextLayouts } from './browserTextLayout.js';
import { t as uiText } from '../i18n/index.js';
import { isTransientNetworkError } from '../services/api.js';

const PROSE_PATH = /^\/(?:summary|experience\/\d+\/bullets\/\d+|education\/\d+\/(?:description|bullets\/\d+)|custom_sections\/\d+\/items\/\d+(?:\/(?:description|bullets\/\d+))?)$/;
const PAGE_TOP = 66;
const BOTTOM = 770;
const textKey = (text) => String(text || '').replace(/[•\s]+/g, ' ').trim();
const flowText = (el) => el.category === 'textarea' && !el.fixedToPage
  && !['masthead', 'masthead-anchor', 'record-overlay', 'section-chrome', 'sidebar-chrome'].includes(el.flowRole);

/** Estimate reducible height from eligible prose, excluding fixed/locked text.
 * A textarea may combine several bullets. Only the fraction represented by
 * editable fields contributes to the budget; rails are measured separately.
 */
export function measureFitBudget(elements, changes, targetPages, facts = []) {
  const locked = new Set(facts.filter(f => f.kind === 'framing').map(f => f.id));
  const prose = changes.filter(f => PROSE_PATH.test(f.path) && !f.evidence_refs.some(id => locked.has(id))).map(f => textKey(f.value));
  let editableHeight = 0;
  const editableByLane = {};
  const laneOverflow = new Map();
  for (const el of elements) {
    if (el.fixedToPage || ['masthead', 'masthead-anchor', 'record-overlay'].includes(el.flowRole)) continue;
    const page = Number(el.page) || 1;
    const lane = el.flowLane || 'main';
    const bottom = Number(el.top || 0) + Number(el.height || el.lineHeight || 0);
    if (page > targetPages) {
      const key = `${lane}:${page}`;
      laneOverflow.set(key, Math.max(laneOverflow.get(key) || 0, bottom - PAGE_TOP));
    }
    if (!flowText(el)) continue;
    const text = textKey(el.content);
    const editableChars = prose.filter(value => value && text.includes(value)).reduce((sum, value) => sum + value.length, 0);
    const height = Number(el.height || 0) * Math.min(1, editableChars / Math.max(1, text.length));
    editableHeight += height;
    editableByLane[lane] = (editableByLane[lane] || 0) + height;
  }
  // A page reduction must fit every lane. Summing parallel columns would
  // overstate spill; take the bottleneck lane across continuation pages.
  const overflows = {};
  for (const [key, height] of laneOverflow) {
    const lane = key.split(':')[0];
    overflows[lane] = (overflows[lane] || 0) + Math.max(0, height);
  }
  const reduction = Math.max(0, ...Object.entries(overflows).map(([lane, height]) =>
    editableByLane[lane] > 0 ? height / editableByLane[lane] : 1));
  return { editable_height: editableHeight, required_reduction: editableHeight > 0 ? Math.min(1, reduction) : 1 };
}

function idFactory(elements) {
  const ids = new Set(elements.map(el => el.element_id));
  let count = 0;
  return () => { let id; do { id = `interview-fit-${++count}`; } while (ids.has(id)); ids.add(id); return id; };
}

function finishPack(elements, spacing, createId) {
  return reconcileDocumentPages(applyFitPack(elements, spacing, 842), createId, { collapseEmpty: true }).elements;
}

function preservesPageAssignments(elements, reference) {
  const pages = new Map(reference.filter(el => !el.fixedToPage).map(el => [el.element_id, Number(el.page) || 1]));
  const ids = new Set(elements.map(el => el.element_id));
  return contentMaxPage(elements) <= contentMaxPage(reference)
    && [...pages.keys()].every(id => ids.has(id))
    && elements.every(el => el.fixedToPage || (Number(el.page) || 1) <= pages.get(el.element_id));
}

function fillsEarlierPages(candidate, current) {
  const pages = contentMaxPage(current);
  if (contentMaxPage(candidate) < pages) return true;
  const next = measureDocumentPageFills(candidate, pages);
  const before = measureDocumentPageFills(current, pages);
  // Compare in reading order, never by the difference between pages. A sparse
  // final page must not win by taking a complete record off the first page.
  for (let page = 0; page < pages; page += 1) {
    if (Math.abs(next[page] - before[page]) > .001) return next[page] > before[page];
  }
  return false;
}

const clipsFlowText = (elements) => elements.some(el => flowText(el) && Number(el.top) + Number(el.height) > BOTTOM + 1);

/** Fill earlier pages to their real bottom margin before using later pages.
 * Repack whole records first, then try up to eleven spacing rhythms within
 * the editor's supported 1.3 expansion. Reject any expansion that pushes
 * existing content to a later page. The final page may remain shorter.
 * Returns the matching elements/spacing snapshot without changing the input;
 * one-page documents retain their successful page-reduction layout.
 */
export function fillInterviewPages(elements, spacing, createId = idFactory(elements)) {
  let best = { elements, spacing: normalizeFlowSpacing(spacing) };
  if (contentMaxPage(elements) < 2) return best;
  best.elements = finishPack(elements, best.spacing, createId);
  const packed = best.elements;
  if (contentMaxPage(packed) < 2) return best;
  const seen = new Set();
  for (const rhythm of buildSpacingLadder(best.spacing, scaleFlowSpacing(best.spacing, 1.3))) {
    const key = JSON.stringify(rhythm);
    if (seen.has(key)) continue;
    seen.add(key);
    const trial = finishPack(packed, rhythm, createId);
    if (preservesPageAssignments(trial, packed) && !clipsFlowText(trial) && fillsEarlierPages(trial, best.elements)) {
      best = { elements: trial, spacing: rhythm };
    }
  }
  return best;
}

/** Reclaim multi-page whitespace with the template's own larger type sizes.
 * Every candidate starts from the same successful fit, is browser-measured,
 * and keeps its earlier-page content. Missing metrics discard that candidate.
 * Paid shortening budgets are calculated before this free finishing pass.
 */
async function expandInterviewLayout(layout, templateId, createId, measureTextWidth) {
  let best = fillInterviewPages(layout.elements, layout.spacing, createId);
  if (contentMaxPage(best.elements) < 2) return best;
  const packed = finishPack(layout.elements, layout.spacing, createId);
  const fontSizes = new Map(packed.filter(flowText).map(el => [el.element_id, Number(el.fontSize) || 0]));
  for (const textSizeId of ['M', 'L', 'XL']) {
    const resized = applyTemplateTypography({ elements: packed, templateId, textSizeId,
      spacing: layout.spacing, createId, measureTextWidth });
    if (!resized || resized.some(el => flowText(el) && Number(el.fontSize) < fontSizes.get(el.element_id))) continue;
    const measured = await measure(resized);
    if (!measured) continue;
    const trial = fillInterviewPages(measured, layout.spacing, createId);
    if (preservesPageAssignments(trial.elements, packed) && !clipsFlowText(trial.elements)
      && fillsEarlierPages(trial.elements, best.elements)) best = trial;
  }
  return best;
}

async function measure(elements) {
  const resolved = await resolveBrowserTextLayouts(elements);
  // A missing font must not turn fallback glyph widths into a paid reduction
  // estimate. Retain the server's verified layout until fonts are available.
  if (resolved.some(el => flowText(el) && textKey(el.content) && !el.resolvedLines?.length)) return null;
  return resolved.map(el => {
    const { resolvedLines, ...rest } = el;
    // Measured line boxes already include the full content height: the canvas
    // has no padding/border. The heuristic's +6 allowance would persist empty
    // slack in every field (magnified at edit zoom) and inflate page counts.
    // Round up fractional line heights, as in template comparison; overlay
    // and masthead heights still belong to their template transactions.
    return flowText(el) && resolvedLines?.length
      ? { ...rest, height: Math.ceil(resolvedLines.length * Number(el.lineHeight)), preserveInitialLayout: true }
      : rest;
  });
}

/** Prepare a measured candidate and the cost-free decision for one server step.
 * The compact preset is the automatic floor. A failed fit never leaves the
 * final document at emergency density. M is retried after every text change.
 */
export async function prepareInterviewFit(session) {
  const { preview } = session;
  const baseline = normalizeFlowSpacing(session.fit_original?.spacing_px || session.spacing_px);
  const compact = Object.fromEntries(Object.entries(COMPACT_FLOW_SPACING).map(([key, value]) => [key, Math.min(value, baseline[key])]));
  const source = await measure(preview.elements);
  const unchanged = { action: 'finish', elements: preview.elements, spacing_px: baseline,
    target_pages: preview.pages, required_reduction: 0, editable_height: 0 };
  if (!source) return unchanged;
  const createId = idFactory(source);
  const measureTextWidth = createCanvasTextWidthMeasurer();
  let best = { elements: finishPack(source, baseline, createId), spacing: baseline };
  let target = contentMaxPage(best.elements) - 1;
  let probe = best;
  while (target >= 1) {
    probe = findTemplateFitForTarget({ elements: source, templateId: session.template_id,
      loosest: baseline, tightest: compact, targetPages: target, createId, measureTextWidth });
    const measured = await measure(probe.elements);
    if (!measured) return unchanged;
    probe.elements = finishPack(measured, probe.spacing, createId);
    if (contentMaxPage(probe.elements) > target) break;
    best = probe;
    target = contentMaxPage(best.elements) - 1;
  }
  const eligible = preview.fit.editable_paths ? preview.changes.filter(f => preview.fit.editable_paths.includes(f.path)) : preview.changes;
  const budget = measureFitBudget(probe.elements, eligible, Math.max(1, target), session.evidence_profile?.facts || []);
  const canShorten = target >= 1 && preview.fit.allow_shorten && !preview.fit.stop_reason
    && budget.required_reduction > 0 && budget.required_reduction <= .30;
  // Do not let presentation expansion inflate a later shortening estimate.
  // Only the final free commit needs the more spacious multi-page layout.
  if (!canShorten) best = await expandInterviewLayout(best, session.template_id, createId, measureTextWidth);
  const { elements } = best;
  // Overflow can be caused by a record too large for any page, even when the
  // nominal page count fits. Leave the server baseline available for recovery.
  if (clipsFlowText(elements)) throw new Error(uiText('interview:fit.layoutError'));
  return { action: canShorten ? 'shorten' : 'finish', elements, spacing_px: best.spacing,
    target_pages: Math.max(1, target), ...budget };
}

/** Complete only an explicitly started operation; loading a session is read-only.
 * At most three paid steps plus one stop response and one final commit are
 * allowed. Every server reply replaces the revision used by the next request.
 */
export async function completeInterviewFit(session, send, isCurrent = () => true, prepare = prepareInterviewFit) {
  let current = session;
  for (let step = 0; step < 5 && current.phase === 'preview' && current.preview?.fit?.status === 'pending'; step += 1) {
    if (!isCurrent()) return current;
    const proposal = await prepare(current);
    if (!isCurrent()) return current;
    try {
      current = await send(`/ai/interviews/${current.id}/preview-fit`, 'POST', {
        revision: current.revision, profile_revision: current.profile_revision,
        evidence_scope: current.evidence_scope, ...proposal,
      });
    } catch (error) {
      // The final write can commit before its response is lost. Recover only
      // that completed revision with a read; never replay a paid shortening or
      // continue from an unrelated edit, restored baseline or pending result.
      if (proposal.action === 'finish' && isCurrent() && isTransientNetworkError(error)) {
        try {
          const saved = await send(`/ai/interviews/${current.id}`);
          if (isCurrent() && saved.id === current.id && saved.revision === current.revision + 1
            && saved.profile_revision === current.profile_revision
            && saved.evidence_scope === current.evidence_scope && saved.template_id === current.template_id
            && saved.phase === 'preview' && saved.preview?.fit?.status === 'complete'
            && saved.preview.profile_revision === current.profile_revision) return saved;
        } catch { /* Keep the original write failure if the recovery read also fails. */ }
      }
      throw error;
    }
  }
  return current;
}
