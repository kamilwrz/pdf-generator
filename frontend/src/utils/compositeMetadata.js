/** Shared inline metadata guidance for Experience and Education, excluding rails. */
import { sliceRuns } from "./textRuns.js";

export const EXPERIENCE_METADATA_HINTS = ["Nazwa firmy", "Miasto", "MM RRRR – obecnie"];
export const EDUCATION_METADATA_HINTS = ["Miasto", "RRRR – RRRR"];
export const METADATA_SEPARATOR = " · ";

/** Return hints for known combined rows, never separate fields or other sections. */
export function compositeMetadataHints(element) {
  if (element?.category !== "textarea" || element.bulletList || element.flowRole === "record-overlay") return null;
  const bindings = element.cvDataBindings || [];
  const layouts = [
    { section: "experience", fields: ["company", "city", "period"], hints: EXPERIENCE_METADATA_HINTS },
    { section: "education", fields: ["city", "period"], hints: EDUCATION_METADATA_HINTS },
  ];
  for (const layout of layouts) {
    if (bindings.length === layout.fields.length && bindings.every((binding, index) => (
      binding.path?.[0] === layout.section && binding.path?.[2] === layout.fields[index]
      && binding.path?.[1] === bindings[0].path?.[1]
    ))) return bindings.map((binding, index) => binding.placeholder || layout.hints[index]);
  }
  // Newly added records carry section semantics instead of profile bindings.
  // Exact slot counts exclude organization-only and date/location rail rows.
  const layout = layouts.find((candidate) => candidate.section === element.editorSectionType);
  if (layout && String(element.placeholder || "").split(" · ").length === layout.fields.length) {
    return element.placeholder.split(" · ");
  }
  return null;
}

/** Split the specified slot count without shifting dates into an empty city/company. */
export function compositeMetadataParts(content = "", slotCount = 3) {
  const text = String(content);
  // Consume spacing around separators, including legacy template wide gaps.
  const separators = [...text.matchAll(/[ \t]*·[ \t]*/g)].slice(0, slotCount - 1);
  let start = 0;
  const parts = separators.map((match) => {
    const part = { text: text.slice(start, match.index), start };
    start = match.index + match[0].length;
    return part;
  });
  parts.push({ text: text.slice(start), start });
  while (parts.length < slotCount) parts.push({ text: "", start: text.length });
  return parts;
}

/** Render-only compaction preserves inline marks while removing empty slots. */
export function compactCompositeMetadata(element) {
  const hints = compositeMetadataHints(element);
  if (!hints) return element;
  const parts = compositeMetadataParts(element.content, hints.length).filter((part) => part.text.trim());
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
