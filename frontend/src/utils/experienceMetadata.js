/** Three-slot guidance for Experience metadata; rail layouts never opt in. */
import { sliceRuns } from "./textRuns.js";

export const EXPERIENCE_METADATA_HINTS = ["Nazwa firmy", "Miasto", "MM RRRR – obecnie"];
export const METADATA_SEPARATOR = " · ";

/** Return hints only for a composite Experience row, never separate rail fields. */
export function experienceMetadataHints(element) {
  if (element?.category !== "textarea" || element.bulletList || element.flowRole === "record-overlay") return null;
  const bindings = element.cvDataBindings || [];
  const fields = ["company", "city", "period"];
  if (bindings.length === 3 && bindings.every((binding, index) => (
    binding.path?.[0] === "experience" && binding.path?.[2] === fields[index]
    && binding.path?.[1] === bindings[0].path?.[1]
  ))) return bindings.map((binding, index) => binding.placeholder || EXPERIENCE_METADATA_HINTS[index]);
  // Newly added records carry section semantics instead of profile bindings.
  // Requiring all three hints excludes the organization-only rail row.
  if (element.editorSectionType === "experience"
      && String(element.placeholder || "").split(" · ").length === 3) {
    return element.placeholder.split(" · ");
  }
  return null;
}

/** Split three stored slots without shifting dates into an empty city/company. */
export function experienceMetadataParts(content = "") {
  const text = String(content);
  // Consume spacing around separators, including legacy template wide gaps.
  const separators = [...text.matchAll(/[ \t]*·[ \t]*/g)].slice(0, 2);
  let start = 0;
  const parts = separators.map((match) => {
    const part = { text: text.slice(start, match.index), start };
    start = match.index + match[0].length;
    return part;
  });
  parts.push({ text: text.slice(start), start });
  while (parts.length < 3) parts.push({ text: "", start: text.length });
  return parts;
}

/** Render-only compaction preserves inline marks while removing empty slots. */
export function compactExperienceMetadata(element) {
  if (!experienceMetadataHints(element)) return element;
  const parts = experienceMetadataParts(element.content).filter((part) => part.text.trim());
  let content = "";
  const runs = [];
  for (const part of parts) {
    if (content) content += METADATA_SEPARATOR;
    const start = content.length;
    runs.push(...sliceRuns(element.runs, part.start, part.start + part.text.length)
      .map((run) => ({ ...run, start: run.start + start, end: run.end + start })));
    content += part.text;
  }
  return { ...element, content, runs, starterPlaceholder: !content.trim() };
}
