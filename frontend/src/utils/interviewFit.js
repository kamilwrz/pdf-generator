/**
 * Automatic interview layout uses the editor's real typography transactions.
 * Trials never touch React, history, answers or autosave. The server publishes
 * one verified content/geometry snapshot and owns all paid iteration limits.
 */
import { findTemplateFitForTarget } from './templatePageFit.js';
import { applyFitPack } from './fitToPages.js';
import { COMPACT_FLOW_SPACING, normalizeFlowSpacing } from './flowSpacing.js';
import { contentMaxPage, reconcileDocumentPages } from './structureOperation.js';
import { applyFlowSpacing } from './sectionStructure.js';
import { measureDocumentPageFills } from './layoutDensity.js';
import { createCanvasTextWidthMeasurer } from './textareaHeight.js';
import { resolveBrowserTextLayouts } from './browserTextLayout.js';
import { t as uiText } from '../i18n/index.js';

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

/** Spread whole records over the same number of pages, preserving authored order.
 * Earlier page breaks are tried using the structural packer's keep-together
 * rules. This changes geometry only; no whitespace is inserted into CV prose.
 */
export function balanceInterviewPages(elements, spacing, createId = idFactory(elements)) {
  const pages = contentMaxPage(elements);
  if (pages < 2) return elements;
  const imbalance = (list) => {
    const fills = measureDocumentPageFills(list, pages);
    return Math.max(...fills) - Math.min(...fills);
  };
  let best = elements;
  let score = imbalance(best);
  if (score <= .20) return best;
  for (let extra = 24; extra <= 240; extra += 24) {
    const trial = applyFlowSpacing(elements, spacing, 842, { bottomMargin: 72 + extra });
    if (contentMaxPage(trial) !== pages) continue;
    const nextScore = imbalance(trial);
    if (nextScore < score - .03) { best = trial; score = nextScore; }
  }
  return reconcileDocumentPages(best, createId, { collapseEmpty: true }).elements;
}

async function measure(elements) {
  const resolved = await resolveBrowserTextLayouts(elements);
  // A missing font must not turn fallback glyph widths into a paid reduction
  // estimate. Retain the server's verified layout until fonts are available.
  if (resolved.some(el => flowText(el) && textKey(el.content) && !el.resolvedLines?.length)) return null;
  return resolved.map(el => {
    const { resolvedLines, ...rest } = el;
    // Use the browser's exact wraps after loading the actual font files.
    // Overlay and masthead heights belong to their template transactions.
    return flowText(el) && resolvedLines?.length
      ? { ...rest, height: resolvedLines.length * Number(el.lineHeight) + 6, preserveInitialLayout: true }
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
  const elements = balanceInterviewPages(best.elements, best.spacing, createId);
  // Overflow can be caused by a record too large for any page, even when the
  // nominal page count fits. Leave the server baseline available for recovery.
  const clipped = elements.some(el => flowText(el) && Number(el.top) + Number(el.height) > BOTTOM + 1);
  if (clipped) throw new Error(uiText('interview:fit.layoutError'));
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
    current = await send(`/ai/interviews/${current.id}/preview-fit`, 'POST', {
      revision: current.revision, profile_revision: current.profile_revision,
      evidence_scope: current.evidence_scope, ...proposal,
    });
  }
  return current;
}
