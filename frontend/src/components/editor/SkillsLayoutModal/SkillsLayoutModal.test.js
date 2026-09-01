import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const componentUrl = new URL("./SkillsLayoutModal.jsx", import.meta.url);
const stylesUrl = new URL("./SkillsLayoutModal.module.css", import.meta.url);

test("skills layout choices use a short fixed example instead of CV content", async () => {
  const source = await readFile(componentUrl, "utf8");

  assert.match(source, /const PREVIEW_SKILLS = \["React", "TypeScript", "Node\.js", "SQL"\]/);
  assert.doesNotMatch(source, /collectSkillGroups/);
  assert.match(source, /aria-pressed=\{active\}/);
});

test("skills layout modal is wide with three side-by-side desktop choices", async () => {
  const [source, styles] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(source, /width=\{960\}/);
  assert.match(styles, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*grid-template-columns:\s*1fr/);
});
