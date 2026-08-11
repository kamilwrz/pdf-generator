import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SIDEBAR_TEMPLATES = ["tessera.js", "slate.js"];

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("sidebar templates umieszczają Wykształcenie/Umiejętności/Języki w sidebarze", async () => {
    for (const file of SIDEBAR_TEMPLATES) {
        const source = await read(file);

        // Hand-authored helpers use text("JĘZYKI"); backend dumps use JSON
        // "content": "JĘZYKI". Both shapes must keep these labels in the sidebar.
        assert.match(
            source,
            /(?:(?:text|sideHeading)\("JĘZYKI"|"content":\s*"JĘZYKI")/,
            `${file}: brak sekcji JĘZYKI`,
        );
        assert.match(
            source,
            /(?:(?:text|sideHeading)\("WYKSZTAŁCENIE"|"content":\s*"WYKSZTAŁCENIE")/,
            `${file}: brak sekcji WYKSZTAŁCENIE`,
        );
        assert.doesNotMatch(
            source,
            /EDUKACJA I KOMPETENCJE/,
            `${file}: pozostała sekcja "EDUKACJA I KOMPETENCJE" w kolumnie głównej`,
        );

        // Skills stay bulleted; languages are plain "Name - Level" lines.
        const helperBullets = source.match(/bulleted\(\s*block\(\s*"•/g) || [];
        const dumpBullets = source.match(/"bulletList":\s*true/g) || [];
        assert.ok(
            helperBullets.length >= 1 || dumpBullets.length >= 1,
            `${file}: oczekiwano wypunktowanych umiejętności w sidebarze`,
        );
        assert.match(
            source,
            /Polski - ojczysty/,
            `${file}: języki powinny być liniami "Name - Level" (hyphen)`,
        );
    }
});
