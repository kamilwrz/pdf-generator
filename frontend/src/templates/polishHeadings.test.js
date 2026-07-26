import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const ENGLISH_SECTION_HEADINGS = [
    "PROFILE",
    "SUMMARY",
    "EXPERIENCE",
    "EDUCATION & EXPERTISE",
    "STACK & EDUCATION",
    "CONTACT",
    "FOCUS",
    "CORE STACK",
    "PRACTICE",
];

test("static CV templates use Polish section headings", async () => {
    const directory = new URL("./", import.meta.url);
    const files = (await readdir(directory))
        .filter((file) => file.endsWith(".js") && !file.endsWith(".test.js"));

    for (const file of files) {
        const source = await readFile(new URL(file, directory), "utf8");
        for (const heading of ENGLISH_SECTION_HEADINGS) {
            assert.doesNotMatch(
                source,
                new RegExp(`text\\("${heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
                `${file} contains the English section heading "${heading}"`,
            );
        }
    }
});
