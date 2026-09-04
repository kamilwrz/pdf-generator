import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const componentUrl = new URL("./NewCvSetupModal.jsx", import.meta.url);
const stylesUrl = new URL("./NewCvSetupModal.module.css", import.meta.url);

describe("NewCvSetupModal contract", () => {
  it("uses one DialogShell with visible template, contact, section and custom controls", async () => {
    const source = await readFile(componentUrl, "utf8");
    assert.equal((source.match(/<DialogShell/g) || []).length, 1);
    assert.match(source, /surface="paper"/);
    assert.match(source, /Meridian jest wybrany na start/);
    assert.match(source, /STARTER_CONTACTS\.map/);
    assert.match(source, /Imię i nazwisko/);
    assert.match(source, /Własna sekcja/);
    assert.match(source, /draggable/);
    assert.match(source, /Przenieś \$\{section\.label\} wyżej/);
    assert.match(source, /Przenieś \$\{section\.label\} niżej/);
  });

  it("exposes Pro locks, photo compatibility feedback and a replacement confirmation", async () => {
    const source = await readFile(componentUrl, "utf8");
    assert.match(source, /isTemplateAllowed\(template, entitlements\)/);
    assert.match(source, /PHOTO_TEMPLATE_IDS\.has/);
    assert.match(source, /Opcja została wyłączona/);
    assert.match(source, /Obecny dokument pozostanie zapisany bez zmian/);
    assert.match(source, /data-confirm-new-cv/);
  });

  it("stacks on tablet/mobile and respects reduced motion", async () => {
    const styles = await readFile(stylesUrl, "utf8");
    assert.match(styles, /@media \(max-width: 900px\)/);
    assert.match(styles, /\.layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    assert.match(styles, /@media \(max-width: 640px\)/);
    assert.match(styles, /overflow-x: auto/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  });
});
