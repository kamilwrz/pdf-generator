/**
 * Minimal semantic projection for toolbar AI. Offsets and canvas identities stay
 * local; only explicitly selected prose/skills and read-only record context are
 * serialized. Geometry never determines what the model may edit.
 */
import { listSectionContentElements, partitionSectionRecords, isSkillsSectionElement } from "./sectionRecord.js";
import { listDocumentSections, listSidebarSections } from "./sectionStructure.js";
import { collectSkillGroups } from "./skillsLayout.js";
import { normalizeRuns } from "./textRuns.js";

export const SCOPED_AI_ACTIONS = [
  { id: "shorten", label: "Skróć" },
  { id: "language", label: "Popraw styl" },
  { id: "improve", label: "Polepsz" },
];
export const SCOPED_AI_MAX_CHARS = 20_000;

const textOf = (element) => String(element?.content || "");
const isProtected = (element) => element.locked || element.fixedToPage
  || element.contactBandId || element.contactChannel || element.mastheadRole
  || ["masthead", "masthead-anchor", "record-overlay"].includes(element.flowRole);

/**
 * Resolve a section, record, or Skills category using the same membership as
 * structural actions. Returns a wire payload and a separate local source map.
 * Missing/empty/ambiguous targets return an empty scope without widening it.
 */
export function buildScopedAiSnapshot(elements, target, pageHeight = 842) {
  const sections = [...listDocumentSections(elements, pageHeight), ...listSidebarSections(elements, pageHeight)];
  const section = target.headingId
    ? sections.find((item) => item.headingId === target.headingId)
    : sections.find((item) => listSectionContentElements(elements, item.headingId, pageHeight)
      .some((member) => member.element_id === target.elementId));
  const heading = elements.find((element) => element.element_id === section?.headingId);
  const empty = { target, title: "Wybrany zakres", payload: null, sources: [], signature: "", error: "Ten zakres nie zawiera treści do poprawienia." };
  if (!heading) return empty;
  const sectionType = heading.editorSectionType || heading.extra_properties?.editorSectionType
    || heading.starterSectionKey || textOf(heading);
  const members = listSectionContentElements(elements, heading.element_id, pageHeight)
    .filter((element) => !isProtected(element));
  if (/^(languages|języki(?: obce)?|jezyki(?: obce)?|languages-grid|contact|contacts|kontakt|dane kontaktowe)$/i.test(sectionType)
    || members.some((element) => element.gridKind === "languages")) return empty;
  const skills = isSkillsSectionElement(heading);
  let groups = partitionSectionRecords(members);
  if (target.kind === "entry") {
    const anchor = members.find((element) => element.element_id === target.elementId);
    groups = groups.filter((group) => target.groupId
      ? group.some((element) => element.flowGroup === target.groupId
        || `flat:${element.element_id}` === target.groupId
        || `legacy:${element.element_id}` === target.groupId)
      : group.includes(anchor));
    // Skills entry controls supply their exact text triggers for legacy groups.
    if (!groups.length && target.memberIds?.length) {
      const selected = members.filter((element) => target.memberIds.includes(element.element_id));
      if (selected.length) groups = [selected];
    }
  }
  const records = [];
  const sources = [];
  for (const group of groups) {
    const recordId = group[0]?.flowGroup || group[0]?.element_id;
    if (!recordId) continue;
    const context = [];
    const append = (element, content, start, kind, category = "") => {
      if (!content.trim()) return;
      const id = `${element.element_id}:${sources.filter((source) => source.elementId === element.element_id).length}`;
      sources.push({ id, record_id: recordId, kind, content, elementId: element.element_id,
        start, end: start + content.length, category });
    };
    if (skills) {
      // Parse each source once, then locate items sequentially. Duplicate skill
      // labels keep distinct offset identities; category lines are context only.
      const isChip = group.some((el) => el.flowRole === "grid-member" && el.category === "text");
      const skillGroups = collectSkillGroups(group, heading.element_id);
      context.push(...skillGroups.map((g) => g.category).filter(Boolean));
      const cursors = new Map();
      for (const skillGroup of skillGroups) {
        for (const item of skillGroup.items) {
          for (const element of group) {
            if ((isChip && element.flowRole !== "grid-member")
              || (!isChip && group.length > 1 && element.bold)) continue;
            const text = textOf(element);
            const start = text.indexOf(item, cursors.get(element.element_id) || 0);
            if (start < 0) continue;
            append(element, item, start, "skill", skillGroup.category);
            cursors.set(element.element_id, start + item.length);
            break;
          }
        }
      }
    } else {
      for (const element of group) {
        const bindings = element.cvDataBindings || [];
        const paths = bindings.map((binding) => Array.isArray(binding.path) ? binding.path.join(".") : String(binding.path || ""));
        const boundDescription = element.editorRecordField === "description"
          || paths.some((path) => /(?:summary|description|responsibilities|achievements)(?:\.|$)/i.test(path));
        const protectedBinding = (paths.length > 0 || element.editorRecordField) && !boundDescription;
        const identityRecord = /experience|education|doświadc|doswiadc|wykszta|edukac/i.test(sectionType) || group.length >= 3;
        // Untagged template records conventionally reserve upper text lines
        // for identity/metadata; only the description textarea is writable.
        const descriptive = !protectedBinding && (boundDescription || element.bulletList
          || (!identityRecord && element.category === "textarea" && !element.bold
            && (group.length === 1 || element === group.at(-1))));
        if (descriptive) append(element, textOf(element), 0, "description");
        else if (textOf(element).trim()) context.push(textOf(element));
      }
    }
    records.push({ id: recordId, context });
  }
  const payload = {
    kind: target.kind, section_type: String(sectionType), language: "",
    records, fragments: sources.map(({ id, record_id, kind, content }) => ({ id, record_id, kind, content })),
  };
  const charCount = payload.section_type.length + sources.reduce((sum, source) => sum + source.content.length, 0)
    + records.reduce((sum, record) => sum + record.context.join("").length, 0);
  const title = target.kind === "section" ? textOf(heading)
    : `${textOf(heading)} · ${records[0]?.context[0] || "Wybrany wpis"}`;
  // Include local category and structural identity in freshness checks, never
  // geometry: reflow or an unrelated section edit must not stale this review.
  return { target, title, payload, sources, signature: JSON.stringify({ payload, sources, headingId: heading.element_id }),
    error: !sources.length ? empty.error : charCount > SCOPED_AI_MAX_CHARS || sources.length > 500 || records.length > 200
      || payload.section_type.length > 120 || records.some((record) => record.context.length > 20)
      ? "Zakres jest za duży. Wybierz pojedynczy wpis (limit 20 000 znaków)." : "" };
}

/** Build complete element patches locally; never trust provider-supplied offsets. */
export function scopedCorrectionsToPatches(elements, snapshot, corrections) {
  const changes = new Map();
  const ids = new Set();
  for (const correction of corrections) {
    const source = snapshot.sources.find((item) => item.id === correction.fragment_id);
    if (!source || ids.has(source.id) || correction.before !== source.content
      || typeof correction.content !== "string" || !correction.content.trim()) throw new Error("Nieprawidłowa propozycja AI.");
    ids.add(source.id);
    const element = elements.find((item) => item.element_id === source.elementId);
    if (!element || isProtected(element) || textOf(element).slice(source.start, source.end) !== source.content) {
      throw new Error("Treść zmieniła się od analizy. Wygeneruj propozycję ponownie.");
    }
    const list = changes.get(source.elementId) || [];
    list.push({ ...source, replacement: correction.content });
    changes.set(source.elementId, list);
  }
  return [...changes].map(([elementId, replacements]) => {
    const element = elements.find((item) => item.element_id === elementId);
    let content = textOf(element);
    for (const item of replacements.sort((a, b) => b.start - a.start)) {
      content = content.slice(0, item.start) + item.replacement + content.slice(item.end);
    }
    return { element_id: elementId, before: textOf(element), content,
      runs: remapScopedRuns(textOf(element), content, element.runs) };
  });
}

/** Preserve marks on uniquely retained phrases; discard ambiguous stale offsets. */
export function remapScopedRuns(before, after, runs) {
  return normalizeRuns(after, (runs || []).flatMap((run) => {
    if (run.start === 0 && run.end === before.length) return [{ ...run, end: after.length }];
    const phrase = before.slice(run.start, run.end);
    const start = phrase ? after.indexOf(phrase) : -1;
    return start >= 0 && after.indexOf(phrase, start + 1) < 0
      ? [{ ...run, start, end: start + phrase.length }] : [];
  }));
}

/** Unicode code-point lengths match the API's character accounting. */
export function scopedLengthSummary(before, after) {
  const oldLength = [...before].length;
  const newLength = [...after].length;
  const percentage = oldLength ? Math.round((newLength - oldLength) / oldLength * 100) : 0;
  return `${oldLength} → ${newLength} znaki · ${percentage > 0 ? "+" : ""}${percentage}%`;
}
