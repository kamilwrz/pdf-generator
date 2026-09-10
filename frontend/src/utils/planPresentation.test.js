import assert from "node:assert/strict";
import test from "node:test";

import {
    applyPlanPresentation,
    FALLBACK_PLAN_CATALOG,
    FREE_PLAN_HIGHLIGHTS,
    PLAN_PRESENTATION,
    PRO_PLAN_HIGHLIGHTS,
} from "./planPresentation.js";

test("Free presentation exposes the complete usable plan contract", () => {
    assert.deepEqual(FREE_PLAN_HIGHLIGHTS, [
        "1 zapisany projekt CV",
        "1 udany import PDF miesięcznie",
        "3 szablony, każdy w 6 wersjach wyglądu",
        "Samodzielna zmiana czcionek, odstępów i sekcji",
        "3 pobrania PDF miesięcznie, bez znaku wodnego",
        "Edycja bez funkcji AI",
    ]);
    assert.equal(PLAN_PRESENTATION.free.period_note, "Nie potrzebujesz karty, plan nie ma limitu czasu.");
});

test("Pro presentation sells scale and assistance instead of output quality", () => {
    assert.deepEqual(PRO_PLAN_HIGHLIGHTS, [
        "Wywiad AI do zebrania doświadczenia i przygotowania CV pod ofertę",
        "Profil zawodowy do wykorzystania w kolejnych CV",
        "Wszystkie szablony i warianty wyglądu",
        "Nielimitowane projekty, importy i pobrania PDF",
        "AI do poprawiania tekstu, analizy ATS i układu",
        "200 kredytów na wywiad i pozostałe funkcje AI",
    ]);
    assert.doesNotMatch(JSON.stringify(FALLBACK_PLAN_CATALOG), /watermark|znak wodny|oznaczeni/i);
});

test("canonical presentation replaces stale catalog copy but preserves live price", () => {
    const displayed = applyPlanPresentation({
        slug: "free",
        price_pln: 7,
        highlights: ["stary limit"],
        period_note: "stara informacja",
    });

    assert.equal(displayed.price_pln, 7);
    assert.deepEqual(displayed.highlights, FREE_PLAN_HIGHLIGHTS);
    assert.equal(displayed.period_note, "Nie potrzebujesz karty, plan nie ma limitu czasu.");
});
