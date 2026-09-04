import { test } from "node:test";
import assert from "node:assert/strict";
import { buildScopedAiSnapshot, scopedCorrectionsToPatches, remapScopedRuns, scopedLengthSummary } from "./scopedAi.js";

const el = (element_id, content, top, props = {}) => ({ element_id, content, top, left: 66,
  width: 460, height: 16, page: 1, fontSize: 10, category: "textarea", ...props });
const heading = (id, text, top, props = {}) => el(id, text, top, { category: "text", flowRole: "section-chrome", bold: true, ...props });
const record = (id, top, page = 1) => [
  el(`${id}-title`, "Programista", top, { flowGroup: id, bold: true, page }),
  el(`${id}-meta`, "Firma · 2020–2023", top + 20, { category: "text", flowGroup: id, page }),
  el(`${id}-body`, "Tworzyłem aplikacje Python dla 30 klientów.", top + 40, { flowGroup: id, bulletList: true, page }),
];
const elements = [heading("experience", "DOŚWIADCZENIE", 100), ...record("one", 130), ...record("two", 230),
  heading("skills", "UMIEJĘTNOŚCI", 340), el("skills-body", "React · TypeScript", 370)];

test("entry sends only its description and protected record context", () => {
  const snapshot = buildScopedAiSnapshot(elements, { kind: "entry", elementId: "one-title" });
  assert.equal(snapshot.error, "");
  assert.equal(snapshot.payload.fragments.length, 1);
  assert.equal(snapshot.payload.fragments[0].id, "one-body:0");
  assert.deepEqual(snapshot.payload.records[0].context, ["Programista", "Firma · 2020–2023"]);
  assert.doesNotMatch(JSON.stringify(snapshot.payload), /React|TypeScript|two-body|fontSize|height|left|cv_data/);
});

test("whole section preserves record boundaries across pages", () => {
  const source = [heading("experience", "DOŚWIADCZENIE", 100), ...record("one", 140), ...record("two", 100, 2)];
  const snapshot = buildScopedAiSnapshot(source, { kind: "section", headingId: "experience" });
  assert.equal(snapshot.payload.records.length, 2);
  assert.equal(snapshot.payload.fragments.length, 2);
  assert.notEqual(snapshot.payload.fragments[0].record_id, snapshot.payload.fragments[1].record_id);
});

test("unrelated text and geometry do not stale a review, but context changes do", () => {
  const target = { kind: "entry", elementId: "one-body" };
  const original = buildScopedAiSnapshot(elements, target);
  const unrelated = elements.map((item) => item.element_id === "two-body" ? { ...item, content: "Inny opis" } : item);
  assert.equal(buildScopedAiSnapshot(unrelated, target).signature, original.signature);
  const moved = elements.map((item) => ({ ...item, top: item.top + 10 }));
  assert.equal(buildScopedAiSnapshot(moved, target).signature, original.signature);
  const context = elements.map((item) => item.element_id === "one-meta" ? { ...item, content: "Firma · Obecnie" } : item);
  assert.notEqual(buildScopedAiSnapshot(context, target).signature, original.signature);
});

test("flat and bullet Skills are individual stable fragments, including duplicates", () => {
  for (const [content, bulletList] of [["React · React · Praca zespołowa", false], ["• React\n• React\n• Praca zespołowa", true]]) {
    const source = [heading("skills", "UMIEJĘTNOŚCI", 100), el("body", content, 130, { bulletList })];
    const snapshot = buildScopedAiSnapshot(source, { kind: "section", headingId: "skills" });
    assert.deepEqual(snapshot.sources.map((f) => f.content), ["React", "React", "Praca zespołowa"]);
    const last = snapshot.sources[2];
    const patches = scopedCorrectionsToPatches(source, snapshot, [{ fragment_id: last.id, before: last.content, content: "Współpraca zespołowa" }]);
    assert.equal(patches[0].content, content.replace("Praca zespołowa", "Współpraca zespołowa"));
    assert.equal(snapshot.sources[0].id, "body:0");
    assert.equal(snapshot.sources[1].id, "body:1");
  }
});

test("Skills chips retain categories and exclude shape data", () => {
  const source = [heading("skills", "UMIEJĘTNOŚCI", 100),
    el("category", "Technologie", 125, { flowGroup: "group", bold: true }),
    el("chip", "Python", 160, { category: "text", flowRole: "grid-member", flowGroup: "group" }),
    el("shape", "", 150, { category: "rectangle", flowRole: "grid-member", flowGroup: "group" })];
  const snapshot = buildScopedAiSnapshot(source, { kind: "entry", elementId: "category" });
  assert.deepEqual(snapshot.payload.records[0].context, ["Technologie"]);
  assert.deepEqual(snapshot.payload.fragments.map((f) => f.content), ["Python"]);
});

test("protected fields and empty scopes never become editable fragments", () => {
  const source = [heading("languages", "JĘZYKI", 100, { editorSectionType: "languages" }), el("language", "Polski · C2", 130)];
  assert.equal(buildScopedAiSnapshot(source, { kind: "section", headingId: "languages" }).payload, null);
  assert.ok(buildScopedAiSnapshot(elements, { kind: "entry", elementId: "missing" }).error);
  const education = [heading("education", "Wykształcenie", 100),
    el("degree", "Magister", 130, { flowGroup: "edu", bold: true, editorRecordField: "title" }),
    el("school", "Uniwersytet", 150, { flowGroup: "edu", editorRecordField: "school" }),
    el("period", "2020–2023", 170, { flowGroup: "edu", editorRecordField: "meta" })];
  assert.ok(buildScopedAiSnapshot(education, { kind: "entry", elementId: "degree" }).error);
});

test("sidebar skills keep category labels read-only while exposing individual items", () => {
  const source = [heading("skills", "UMIEJĘTNOŚCI", 100),
    el("body", "Techniczne\n• Python\n• SQL\nMiękkie\n• Praca zespołowa", 130)];
  const snapshot = buildScopedAiSnapshot(source, { kind: "section", headingId: "skills" });
  assert.deepEqual(snapshot.sources.map((item) => item.content), ["Python", "SQL", "Praca zespołowa"]);
  assert.deepEqual(snapshot.payload.records[0].context, ["Techniczne", "Miękkie"]);
});

test("partial skill acceptance preserves the remaining fragment ids after offsets change", () => {
  const source = [heading("skills", "UMIEJĘTNOŚCI", 100), el("body", "Praca zespołowa · Zarządzanie projektami", 130)];
  const target = { kind: "section", headingId: "skills" };
  const snapshot = buildScopedAiSnapshot(source, target);
  const first = { fragment_id: "body:0", before: "Praca zespołowa", content: "Współpraca zespołowa" };
  const second = { fragment_id: "body:1", before: "Zarządzanie projektami", content: "Koordynowanie projektów" };
  const patches = scopedCorrectionsToPatches(source, snapshot, [first]);
  const next = source.map((item) => ({ ...item, ...(patches.find((patch) => patch.element_id === item.element_id) || {}) }));
  const rebased = buildScopedAiSnapshot(next, target);
  assert.equal(scopedCorrectionsToPatches(next, rebased, [second])[0].content, "Współpraca zespołowa · Koordynowanie projektów");
});

test("limits reject rather than truncate and provider ids cannot target a neighbor", () => {
  const huge = [heading("summary", "Podsumowanie", 100), el("body", "a".repeat(20_001), 130)];
  assert.match(buildScopedAiSnapshot(huge, { kind: "section", headingId: "summary" }).error, /20 000/);
  const snapshot = buildScopedAiSnapshot(elements, { kind: "entry", elementId: "one-title" });
  assert.throws(() => scopedCorrectionsToPatches(elements, snapshot, [{ fragment_id: "two-body:0", before: "x", content: "y" }]));
});

test("formatting remaps only retained unique spans and full-field formatting", () => {
  assert.deepEqual(remapScopedRuns("Hello Python", "Python", [{ start: 6, end: 12, bold: true }]), [{ start: 0, end: 6, bold: true }]);
  assert.deepEqual(remapScopedRuns("Hello", "Hi", [{ start: 0, end: 5, italic: true }]), [{ start: 0, end: 2, italic: true }]);
  assert.deepEqual(remapScopedRuns("Hello Python", "Java", [{ start: 6, end: 12, bold: true }]), []);
  assert.equal(scopedLengthSummary("abcd", "ab"), "4 → 2 znaki · -50%");
});
