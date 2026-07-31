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

test("sidebarowe metadane wykształcenia używają koloru metadanych", async () => {
    const expectedMetadataColors = [
        ["quarry.js", "Politechnika Warszawska, Warszawa", "SLATE"],
        ["garnet.js", "Uniwersytet Warszawski, Warszawa", "MUTE"],
        ["harbor.js", "Uniwersytet Gdański, Gdańsk", "MUTE"],
    ];

    for (const [file, school, color] of expectedMetadataColors) {
        const source = await read(file);
        const schoolPattern = new RegExp(
            `block\\("${school}",[^\\n]+, ${color}, SANS\\)`,
        );

        // The school line is metadata; it must not accidentally inherit the
        // pale rule/accent color reserved for decorative canvas elements.
        assert.match(source, schoolPattern, `${file}: nieprawidłowy kolor szkoły`);
    }
});
