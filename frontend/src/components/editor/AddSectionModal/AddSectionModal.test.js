import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [source, builderSource, css] = await Promise.all([
  readFile(new URL("./AddSectionModal.jsx", import.meta.url), "utf8"),
  readFile(new URL("../../../utils/sectionBuilder.js", import.meta.url), "utf8"),
  readFile(new URL("./AddSectionModal.module.css", import.meta.url), "utf8"),
]);

test("offers the six named CV section presets instead of generic layouts", () => {
  for (const title of [
    "Podsumowanie",
    "Doświadczenie",
    "Wykształcenie",
    "Języki",
    "Umiejętności",
    "Umiejętności (Kategorie)",
  ]) {
    assert.match(builderSource, new RegExp(`title: "${title.replace(/[()]/g, "\\$&")}"`));
  }
  assert.doesNotMatch(source, /Nazwa sekcji|Prosta treść|Wpis z opisem/);
});

test("renders structural miniatures from the starter placeholder contract", () => {
  assert.match(source, /STARTER_FIELD_PLACEHOLDERS/);
  assert.match(source, /experience_title/);
  assert.match(source, /experience_period/);
  assert.match(source, /education_degree/);
  assert.match(source, /language_name/);
  assert.match(source, /language_level/);
  assert.match(source, /SectionStructurePreview/);
});

test("uses an accessible responsive radio-card grid", () => {
  assert.match(source, /name="section-type"/);
  assert.match(source, /initialFocusSelector='input\[name="section-type"\]:checked'/);
  assert.match(source, /<fieldset/);
  assert.match(source, /<legend/);
  assert.match(css, /grid-template-columns: repeat\(3/);
  assert.match(css, /@media \(max-width: 860px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
