import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("layout mode waits for the user's message before sending a request", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /setMessages\(prev => \[\.\.\.prev, \{\s*id: nanoid\(\),\s*role: "assistant",\s*text: LAYOUT_MODE_GREETING/s);
    assert.match(source, /layoutSuggestions:\s*LAYOUT_SUGGESTIONS/);
    assert.match(source, /send\(layoutMode \? "layout" : "chat", text\)/);

    // Enabling the toggle must stay local. Suggestion chips may call send later.
    const toggleBranch = source.match(/if \(actionId === "layout"\) \{([\s\S]*?)\n\s*return;\n\s*\}\n\s*send\(actionId/);
    assert.ok(toggleBranch, "expected a local layout toggle branch");
    assert.doesNotMatch(toggleBranch[1], /\bsend\s*\(/);
});

test("layout suggestions expose short labels and fuller GPT prompts", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /const LAYOUT_SUGGESTIONS = \[/);
    assert.match(source, /handleLayoutSuggestion/);
    assert.match(source, /send\("layout", suggestion\.prompt, \{ displayText: suggestion\.label \}\)/);
    assert.match(source, /displayText: options\.displayText/);
    assert.match(source, /const visibleText = msg\.displayText \|\| msg\.text/);

    const block = source.match(/const LAYOUT_SUGGESTIONS = \[([\s\S]*?)\];/)?.[1] || "";
    const ids = [...block.matchAll(/id:\s*"([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, 10);
    assert.ok(ids.includes("header-gaps"));
    assert.ok(ids.includes("full-rhythm"));
    assert.match(block, /layout_contract/);
    assert.match(block, /real_gap/);
});

test("assistant send blocks parallel requests before isLoading re-renders", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /requestInFlightRef/);
    assert.match(source, /if \(requestInFlightRef\.current \|\| isLoading\) return/);
    assert.match(source, /requestInFlightRef\.current = true/);
    assert.match(source, /requestInFlightRef\.current = false/);
});
