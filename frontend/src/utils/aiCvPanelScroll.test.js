import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const panelUrl = new URL("../components/ai/AiCvPanel/AiCvPanel.jsx", import.meta.url);
const stylesUrl = new URL("../components/ai/AiCvPanel/AiCvPanel.module.css", import.meta.url);

test("CV import history keeps its controls fixed and scrolls only the snapshot list", async () => {
    const [panelSource, stylesSource] = await Promise.all([
        readFile(panelUrl, "utf8"),
        readFile(stylesUrl, "utf8"),
    ]);

    assert.match(panelSource, /className=\{classes\.historyList\}/);
    assert.match(panelSource, /role="region"/);
    assert.match(panelSource, /aria-label="Lista importów CV"/);
    assert.match(panelSource, /tabIndex=\{0\}/);

    const historyPaneRule = stylesSource.match(/\.historyPane\s*\{[^}]+\}/s)?.[0] ?? "";
    const historyListRule = stylesSource.match(/\.historyList\s*\{[^}]+\}/s)?.[0] ?? "";
    assert.match(historyPaneRule, /overflow:\s*hidden/);
    assert.match(historyListRule, /flex:\s*1/);
    assert.match(historyListRule, /min-height:\s*0/);
    assert.match(historyListRule, /overflow-y:\s*auto/);
    assert.match(historyListRule, /scrollbar-gutter:\s*stable/);
});

test("CV upload step remains scrollable on short viewports", async () => {
    const stylesSource = await readFile(stylesUrl, "utf8");
    const stepPaneRule = stylesSource.match(/\.stepPane\s*\{[^}]+\}/s)?.[0] ?? "";

    assert.match(stepPaneRule, /min-height:\s*0/);
    assert.match(stepPaneRule, /overflow-y:\s*auto/);
    assert.match(stepPaneRule, /overscroll-behavior:\s*contain/);
});
