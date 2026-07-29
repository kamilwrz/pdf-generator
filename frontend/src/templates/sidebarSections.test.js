import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const SIDEBAR_TEMPLATES = ["quarry.js", "moss.js", "garnet.js", "harbor.js", "obsidian.js"];

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("sidebar templates umieszczają Wykształcenie/Umiejętności/Języki w sidebarze", async () => {
    for (const file of SIDEBAR_TEMPLATES) {
        const source = await read(file);

        assert.match(source, /text\("JĘZYKI"/, `${file}: brak sekcji JĘZYKI`);
        assert.match(source, /text\("WYKSZTAŁCENIE"/, `${file}: brak sekcji WYKSZTAŁCENIE`);
        assert.doesNotMatch(
            source,
            /EDUKACJA I KOMPETENCJE/,
            `${file}: pozostała sekcja "EDUKACJA I KOMPETENCJE" w kolumnie głównej`,
        );
        // Umiejętności i języki muszą być listami wypunktowanymi (stąd co najmniej 2).
        const bulletBlocks = source.match(/bulleted\(block\("•/g) || [];
        assert.ok(
            bulletBlocks.length >= 2,
            `${file}: oczekiwano co najmniej 2 list wypunktowanych (umiejętności + języki), znaleziono ${bulletBlocks.length}`,
        );
    }
});
