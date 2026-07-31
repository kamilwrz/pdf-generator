import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("layout mode waits for the user's message before sending a request", async () => {
    const source = await readFile(new URL("./AiAssistant.jsx", import.meta.url), "utf8");

    assert.match(source, /setMessages\(prev => \[\.\.\.prev, \{\s*id: nanoid\(\),\s*role: "assistant",\s*text: LAYOUT_MODE_GREETING/s);
    assert.match(source, /send\(layoutMode \? "layout" : "chat", text\)/);
    assert.doesNotMatch(source, /send\(\s*"layout"\s*,/);
});
