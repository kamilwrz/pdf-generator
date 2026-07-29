# Sidebar Templates — sekcje Wykształcenie/Umiejętności/Języki — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W pięciu szablonach z panelem bocznym przenieść Wykształcenie, Umiejętności i Języki do sidebara (kolumna główna zostaje z PROFIL + DOŚWIADCZENIE), z ustalonym formatem każdej sekcji.

**Architecture:** Szablony to statyczne tablice specyfikacji elementów (`frontend/src/templates/*.js`) pozycjonowanych absolutnie (`left`/`top`). Edycja polega na: (1) przeformatowaniu listy umiejętności na wypunktowaną, (2) dodaniu sekcji JĘZYKI w sidebarze, (3) przeniesieniu WYKSZTAŁCENIA z kolumny głównej do sidebara w nowym formacie, (4) usunięciu sekcji „EDUKACJA I KOMPETENCJE" z kolumny głównej wraz z jej znacznikiem. Guard strukturalny to test skanujący pliki jako tekst.

**Tech Stack:** React/Vite (frontend), helpery `frontend/src/templates/helpers.js` (`text`, `block`, `bulleted`, `line`, `circle`, `ellipse`), test runner `node --test` (`node:test` + `node:assert`).

## Global Constraints

- Wszystkie nagłówki i treść po polsku. `frontend/src/templates/polishHeadings.test.js` musi pozostać zielony (żaden zakazany angielski nagłówek renderowany przez `text("…")`).
- Kolumna sidebara: `left: 24`, szerokość bloków `136`.
- Nowe nagłówki sekcji stylizowane identycznie jak istniejący nagłówek `KONTAKT` danego szablonu (ten sam `fontSize`, kolor akcentu, `letterSpacing`, helper `tracked(text(...))`).
- Listy wypunktowane: każda pozycja w osobnej linii z prefiksem `• `, cały blok owinięty `bulleted(block(...))`.
- Wpis wykształcenia: dokładnie **jeden**, w formacie trójwierszowym: `Nazwa dyplomu — data` (pogrubione), `Uczelnia, Miasto`, `opis`. Realizowany jako `block()` (zawijanie w 136px), tytuł jako `bold(block(...))`.
- Usuwane znaczniki edukacji (`*-education`) nie są celem żadnego `connector(...)` — usunięcie jest bezpieczne.
- Nie zmieniać innych szablonów ani innych sekcji (nagłówek/imię, PROFIL, DOŚWIADCZENIE, stopka `fixedToPage`).
- Kolejność sekcji w sidebarze: `KONTAKT` → `[tematyczny nagłówek umiejętności]` → `JĘZYKI` → `WYKSZTAŁCENIE`.

---

### Task 1: Test strukturalny (czerwony)

Guard sprawdzający, że wszystkie pięć szablonów ma sekcje JĘZYKI + WYKSZTAŁCENIE w sidebarze i nie ma już „EDUKACJA I KOMPETENCJE". Test skanuje pliki jako tekst (szablonów nie można importować przez `import.meta.env`).

**Files:**
- Create: `frontend/src/templates/sidebarSections.test.js`

**Interfaces:**
- Consumes: pliki `quarry.js`, `moss.js`, `garnet.js`, `harbor.js`, `obsidian.js` (odczyt tekstu).
- Produces: brak eksportów (plik testowy).

- [ ] **Step 1: Napisz test**

```js
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
        // Sekcja umiejętności musi być listą wypunktowaną.
        assert.match(source, /bulleted\(block\("•/, `${file}: umiejętności nie są listą wypunktowaną`);
    }
});
```

- [ ] **Step 2: Uruchom test i potwierdź, że NIE przechodzi**

Run: `cd frontend && node --test src/templates/sidebarSections.test.js`
Expected: FAIL — każdy plik zgłasza brak `JĘZYKI`/`WYKSZTAŁCENIE` oraz obecność `EDUKACJA I KOMPETENCJE`.

- [ ] **Step 3: NIE commituj**

Test zostaje czerwony w drzewie roboczym do Zadania 7. Nie commituj tego pliku teraz.

---

### Task 2: Quarry

Szablon ciemny (jasny tekst na navy). Cała wysokość sidebara czytelna. Akcent `CYAN`, tekst `INK`, kolor drugorzędny `RULE`.

**Files:**
- Modify: `frontend/src/templates/quarry.js`

**Interfaces:**
- Consumes: helpery `text`, `block`, `bulleted`, `line`, `circle`, `ellipse` + lokalne `bold`, `tracked`, stałe `INK`, `CYAN`, `RULE`, `SANS`.
- Produces: zmodyfikowaną tablicę `quarryTemplate`.

- [ ] **Step 1: Przeformatuj umiejętności na listę wypunktowaną**

Zamień blok `GŁÓWNE TECHNOLOGIE` (obecnie zwykły `block`) na wypunktowany:

```js
    tracked(text("GŁÓWNE TECHNOLOGIE", 8, SANS, CYAN, 24, 205, 3), 1.3),
    bulleted(block("• TypeScript\n• Go\n• Kubernetes\n• AWS\n• PostgreSQL", 24, 225, 136, 70, 8.4, 13, INK, SANS)),
```

- [ ] **Step 2: Dodaj sekcje JĘZYKI i WYKSZTAŁCENIE w sidebarze**

Wstaw bezpośrednio po bloku umiejętności (przed dekoracyjnym `rect`/`quarry-frame`):

```js
    tracked(text("JĘZYKI", 8, SANS, CYAN, 24, 320, 3), 1.3),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Niemiecki — B1", 24, 340, 136, 42, 8.4, 13, INK, SANS)),

    tracked(text("WYKSZTAŁCENIE", 8, SANS, CYAN, 24, 415, 3), 1.3),
    bold(block("Informatyka — 2012–2017", 24, 435, 136, 14, 8.6, 12, INK, SANS)),
    block("Politechnika Warszawska, Warszawa", 24, 452, 136, 14, 7.9, 11, RULE, SANS),
    block("Systemy rozproszone, obserwowalność, SRE.", 24, 468, 136, 26, 8, 12, INK, SANS),
```

- [ ] **Step 3: Usuń sekcję „EDUKACJA I KOMPETENCJE" z kolumny głównej**

Usuń wszystkie sześć elementów (znacznik + nagłówek + linia + tytuł + data + blok):

```js
    { ...ellipse(218, 590, 13, 13, CYAN, false, 1, 3), id: "quarry-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, NAVY, 242, 590, 3), 1.3),
    line(242, 608, 304, 1, RULE, 2),
    bold(text("Informatyka  /  Politechnika Warszawska", 10.1, SANS, NAVY, 242, 627, 3)),
    text("2012 – 2017", 8.5, SANS, SLATE, 242, 645, 3),
    block("System design  ·  Event-driven architecture  ·  SRE\nCloud infrastructure  ·  Technical leadership", 242, 679, 304, 31, 9, 13, NAVY, SANS),
```

- [ ] **Step 4: Sprawdź składnię i nagłówki**

Run: `cd frontend && node --check src/templates/quarry.js && node --test src/templates/polishHeadings.test.js`
Expected: brak błędów składni; test polskich nagłówków PASS.

- [ ] **Step 5: Weryfikacja strukturalna pliku**

Run: `cd frontend && grep -q 'text("JĘZYKI"' src/templates/quarry.js && grep -q 'text("WYKSZTAŁCENIE"' src/templates/quarry.js && ! grep -q 'EDUKACJA I KOMPETENCJE' src/templates/quarry.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/templates/quarry.js
git commit -m "quarry: wyksztalcenie/jezyki/umiejetnosci w sidebarze"
```

---

### Task 3: Moss

Szablon jasny (ciemny tekst na kremie). Cała wysokość czytelna; stos zaczynamy nisko (jak oryginał, ~y=308). Akcent/tekst `FOREST`, drugorzędny `MUTE`, opis `BODY`.

**Files:**
- Modify: `frontend/src/templates/moss.js`

**Interfaces:**
- Consumes: helpery + lokalne `bold`, `tracked`, stałe `FOREST`, `MUTE`, `BODY`, `SANS`.
- Produces: zmodyfikowaną tablicę `mossTemplate`.

- [ ] **Step 1: Przeformatuj umiejętności na listę wypunktowaną (przesuń nieco w górę, by zmieścić 4 sekcje)**

Zamień blok `KOMPETENCJE`:

```js
    tracked(text("KOMPETENCJE", 8, SANS, FOREST, 24, 388, 3), 1.2),
    bulleted(block("• Service design\n• Research\n• Facilitation\n• Operating models", 24, 408, 136, 58, 8.3, 13, FOREST, SANS)),
```

- [ ] **Step 2: Dodaj JĘZYKI i WYKSZTAŁCENIE w sidebarze**

Wstaw po bloku umiejętności (przed dekoracyjnym `rect`/`moss-frame`):

```js
    tracked(text("JĘZYKI", 8, SANS, FOREST, 24, 482, 3), 1.2),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Hiszpański — B1", 24, 502, 136, 42, 8.3, 13, FOREST, SANS)),

    tracked(text("WYKSZTAŁCENIE", 8, SANS, FOREST, 24, 567, 3), 1.2),
    bold(block("Projektowanie Usług — 2011–2016", 24, 587, 136, 14, 8.6, 12, FOREST, SANS)),
    block("SWPS, Poznań", 24, 604, 136, 14, 7.9, 11, MUTE, SANS),
    block("Badania, service blueprints, facylitacja.", 24, 620, 136, 26, 8, 12, BODY, SANS),
```

- [ ] **Step 3: Usuń „EDUKACJA I KOMPETENCJE" z kolumny głównej**

```js
    { ...ellipse(218, 590, 13, 13, SAGE, false, 1, 3), id: "moss-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, FOREST, 242, 590, 3), 1.3),
    line(242, 608, 304, 1, RULE, 2),
    bold(text("Projektowanie Usług  /  SWPS", 10.1, SANS, FOREST, 242, 627, 3)),
    text("2011 – 2016", 8.5, SANS, MUTE, 242, 645, 3),
    block("Research  ·  Service blueprints  ·  Journey mapping\nFacilitation  ·  Systems thinking", 242, 679, 304, 31, 9, 13, BODY, SANS),
```

- [ ] **Step 4: Sprawdź składnię i nagłówki**

Run: `cd frontend && node --check src/templates/moss.js && node --test src/templates/polishHeadings.test.js`
Expected: brak błędów; PASS.

- [ ] **Step 5: Weryfikacja strukturalna pliku**

Run: `cd frontend && grep -q 'text("JĘZYKI"' src/templates/moss.js && grep -q 'text("WYKSZTAŁCENIE"' src/templates/moss.js && ! grep -q 'EDUKACJA I KOMPETENCJE' src/templates/moss.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/templates/moss.js
git commit -m "moss: wyksztalcenie/jezyki/umiejetnosci w sidebarze"
```

---

### Task 4: Garnet

Szablon ciemny (jasny tekst na burgundzie). Górę zajmuje łuk art déco — stos sekcji **poniżej y≈290**. Nagłówki jak w oryginale kolor `"#F4DEDE"`, tekst `"#FFF8F4"`, drugorzędny `ROSE`.

**Files:**
- Modify: `frontend/src/templates/garnet.js`

**Interfaces:**
- Consumes: helpery + lokalne `bold`, `tracked`, stałe `ROSE`, `SANS` (kolory tekstu jako literały hex jak w oryginale).
- Produces: zmodyfikowaną tablicę `garnetTemplate`.

- [ ] **Step 1: Przeformatuj umiejętności (`OBSZARY`) na listę wypunktowaną, przesuń wyżej**

```js
    tracked(text("OBSZARY", 8, SANS, "#F4DEDE", 24, 380, 3), 1.2),
    bulleted(block("• Brand strategy\n• Corporate narrative\n• Change communication\n• Leadership", 24, 400, 136, 58, 8.3, 13, "#FFF8F4", SANS)),
```

- [ ] **Step 2: Dodaj JĘZYKI i WYKSZTAŁCENIE w sidebarze**

Wstaw po bloku umiejętności (przed dekoracyjnym `rect`/`garnet-frame`):

```js
    tracked(text("JĘZYKI", 8, SANS, "#F4DEDE", 24, 474, 3), 1.2),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Francuski — B2", 24, 494, 136, 42, 8.3, 13, "#FFF8F4", SANS)),

    tracked(text("WYKSZTAŁCENIE", 8, SANS, "#F4DEDE", 24, 559, 3), 1.2),
    bold(block("Komunikacja i Media — 2011–2016", 24, 579, 136, 14, 8.6, 12, "#FFF8F4", SANS)),
    block("Uniwersytet Warszawski, Warszawa", 24, 596, 136, 14, 7.9, 11, ROSE, SANS),
    block("Narracja marki, reputacja, komunikacja zmiany.", 24, 612, 136, 26, 8, 12, "#FFF8F4", SANS),
```

- [ ] **Step 3: Usuń „EDUKACJA I KOMPETENCJE" z kolumny głównej**

```js
    { ...ellipse(218, 590, 13, 13, WINE, false, 1, 3), id: "garnet-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, WINE, 242, 590, 3), 1.3),
    line(242, 608, 304, 1, RULE, 2),
    bold(text("Komunikacja i Media  /  UW", 10.1, SANS, INK, 242, 627, 3)),
    text("2011 – 2016", 8.5, SANS, MUTE, 242, 645, 3),
    block("Brand architecture  ·  Narrative design  ·  Reputation\nChange communication  ·  Executive counsel", 242, 679, 304, 31, 9, 13, INK, SANS),
```

- [ ] **Step 4: Sprawdź składnię i nagłówki**

Run: `cd frontend && node --check src/templates/garnet.js && node --test src/templates/polishHeadings.test.js`
Expected: brak błędów; PASS.

- [ ] **Step 5: Weryfikacja strukturalna pliku**

Run: `cd frontend && grep -q 'text("JĘZYKI"' src/templates/garnet.js && grep -q 'text("WYKSZTAŁCENIE"' src/templates/garnet.js && ! grep -q 'EDUKACJA I KOMPETENCJE' src/templates/garnet.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/templates/garnet.js
git commit -m "garnet: wyksztalcenie/jezyki/umiejetnosci w sidebarze"
```

---

### Task 5: Harbor

Szablon ciemny (jasny tekst na navy). Górę zajmuje marmur — stos **poniżej y≈290**; dolna lewa część może przechodzić w jaśniejszy marmur, więc stos kończymy możliwie wysoko (≤~630) i weryfikujemy kontrast wizualnie. Nagłówki `"#EAF0F3"`, tekst `"#F7FAFB"`, drugorzędny `RULE`.

**Files:**
- Modify: `frontend/src/templates/harbor.js`

**Interfaces:**
- Consumes: helpery + lokalne `bold`, `tracked`, stałe `RULE`, `SANS` (kolory tekstu jako literały hex jak w oryginale).
- Produces: zmodyfikowaną tablicę `harborTemplate`.

- [ ] **Step 1: Przeformatuj umiejętności (`OBSZARY`) na listę wypunktowaną, przesuń wyżej**

```js
    tracked(text("OBSZARY", 8, SANS, "#EAF0F3", 24, 378, 3), 1.2),
    bulleted(block("• Programme design\n• Strategy\n• Governance\n• Stakeholders", 24, 398, 136, 58, 8.3, 12.5, "#F7FAFB", SANS)),
```

- [ ] **Step 2: Dodaj JĘZYKI i WYKSZTAŁCENIE w sidebarze**

Wstaw po bloku umiejętności (przed dekoracyjnym `rect`/`harbor-frame`):

```js
    tracked(text("JĘZYKI", 8, SANS, "#EAF0F3", 24, 468, 3), 1.2),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Niemiecki — B1", 24, 488, 136, 40, 8.3, 12.5, "#F7FAFB", SANS)),

    tracked(text("WYKSZTAŁCENIE", 8, SANS, "#EAF0F3", 24, 548, 3), 1.2),
    bold(block("Zarządzanie — 2011–2016", 24, 568, 136, 14, 8.6, 12, "#F7FAFB", SANS)),
    block("Uniwersytet Gdański, Gdańsk", 24, 584, 136, 14, 7.9, 11, RULE, SANS),
    block("Zarządzanie programami i realizacja strategii.", 24, 600, 136, 26, 8, 12, "#F7FAFB", SANS),
```

- [ ] **Step 3: Usuń „EDUKACJA I KOMPETENCJE" z kolumny głównej**

```js
    { ...ellipse(218, 590, 13, 13, STEEL, false, 1, 3), id: "harbor-education" },
    tracked(text("EDUKACJA I KOMPETENCJE", 8.4, SANS, NAVY, 242, 590, 3), 1.3),
    line(242, 608, 304, 1, RULE, 2),
    bold(text("Zarządzanie  /  Uniwersytet Gdański", 10.1, SANS, NAVY, 242, 627, 3)),
    text("2011 – 2016", 8.5, SANS, MUTE, 242, 645, 3),
    block("Programme governance  ·  Strategy execution  ·  Planning\nStakeholder management  ·  Change delivery", 242, 679, 304, 31, 9, 13, NAVY, SANS),
```

- [ ] **Step 4: Sprawdź składnię i nagłówki**

Run: `cd frontend && node --check src/templates/harbor.js && node --test src/templates/polishHeadings.test.js`
Expected: brak błędów; PASS.

- [ ] **Step 5: Weryfikacja strukturalna pliku**

Run: `cd frontend && grep -q 'text("JĘZYKI"' src/templates/harbor.js && grep -q 'text("WYKSZTAŁCENIE"' src/templates/harbor.js && ! grep -q 'EDUKACJA I KOMPETENCJE' src/templates/harbor.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/templates/harbor.js
git commit -m "harbor: wyksztalcenie/jezyki/umiejetnosci w sidebarze"
```

---

### Task 6: Obsidian

Szablon ciemny (lity czarny sidebar rysowany prostokątem). Cała wysokość czytelna. Akcent `GOLD`, tytuł `INK`, drugorzędny `MUTED`, opis `BODY`.

**Files:**
- Modify: `frontend/src/templates/obsidian.js`

**Interfaces:**
- Consumes: helpery + lokalne `bold`, `tracked`, stałe `GOLD`, `INK`, `MUTED`, `BODY`, `SANS`.
- Produces: zmodyfikowaną tablicę `obsidianTemplate`.

- [ ] **Step 1: Przeformatuj umiejętności (`OBSZARY`) na listę wypunktowaną**

```js
    tracked(text("OBSZARY", 8, SANS, GOLD, 24, 200, 3), 1.3),
    bulleted(block("• Strategia operacyjna\n• Zarządzanie zmianą\n• Optymalizacja procesów\n• Budżetowanie\n• Przywództwo zespołowe", 24, 220, 136, 90, 8.2, 13, BODY, SANS)),
```

- [ ] **Step 2: Dodaj JĘZYKI i WYKSZTAŁCENIE w sidebarze**

Wstaw po bloku umiejętności (przed znacznikiem `circle(L - 18, 152, ...)` / sekcją PROFIL):

```js
    tracked(text("JĘZYKI", 8, SANS, GOLD, 24, 320, 3), 1.3),
    bulleted(block("• Polski — ojczysty\n• Angielski — C1\n• Francuski — B2", 24, 340, 136, 42, 8.2, 13, BODY, SANS)),

    tracked(text("WYKSZTAŁCENIE", 8, SANS, GOLD, 24, 405, 3), 1.3),
    bold(block("MBA — 2013–2015", 24, 425, 136, 14, 8.6, 12, INK, SANS)),
    block("Akademia Leona Koźmińskiego, Warszawa", 24, 442, 136, 24, 7.9, 11, MUTED, SANS),
    block("Zarządzanie operacyjne i transformacja.", 24, 470, 136, 26, 8, 12, BODY, SANS),
```

Uwaga: „Akademia Leona Koźmińskiego, Warszawa" może zawinąć się do 2 linii — dlatego kolejny element (opis) startuje z zapasem (top=470).

- [ ] **Step 3: Usuń „EDUKACJA I KOMPETENCJE" z kolumny głównej**

```js
    circle(L - 18, 505, 7, GOLD, true, 1, 3),
    tracked(text("EDUKACJA I KOMPETENCJE", 8.6, SANS, INK, L, 503, 3), 1.2),
    line(L, 519, W, 1, RULE, 2),
    bold(text("MBA  /  Akademia Leona Koźmińskiego", 10.3, SANS, INK, L, 538, 2)),
    text("2013 – 2015  ·  Warszawa", 8.7, SANS, MUTED, L, 556, 2),
    block(
        "Zarządzanie operacyjne  ·  Transformacja  ·  Lean  ·  Budżetowanie  ·  Przywództwo",
        L, 591, W, 28, 9.4, 13.3, BODY, SANS
    ),
```

- [ ] **Step 4: Sprawdź składnię i nagłówki**

Run: `cd frontend && node --check src/templates/obsidian.js && node --test src/templates/polishHeadings.test.js`
Expected: brak błędów; PASS.

- [ ] **Step 5: Weryfikacja strukturalna pliku**

Run: `cd frontend && grep -q 'text("JĘZYKI"' src/templates/obsidian.js && grep -q 'text("WYKSZTAŁCENIE"' src/templates/obsidian.js && ! grep -q 'EDUKACJA I KOMPETENCJE' src/templates/obsidian.js && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/templates/obsidian.js
git commit -m "obsidian: wyksztalcenie/jezyki/umiejetnosci w sidebarze"
```

---

### Task 7: Zielony guard + weryfikacja wizualna

Domknięcie: test strukturalny przechodzi, build się kompiluje, każdy z 5 szablonów zweryfikowany wizualnie (jedna strona, sidebar bez przelania, czytelność).

**Files:**
- Modify (commit) : `frontend/src/templates/sidebarSections.test.js` (z Task 1)

- [ ] **Step 1: Uruchom test strukturalny — teraz zielony**

Run: `cd frontend && node --test src/templates/sidebarSections.test.js`
Expected: PASS (wszystkie 5 szablonów).

- [ ] **Step 2: Uruchom pełen zestaw testów szablonów**

Run: `cd frontend && node --test src/templates/polishHeadings.test.js src/templates/sidebarSections.test.js`
Expected: 2 pliki, wszystkie testy PASS.

- [ ] **Step 3: Sprawdź, że build się kompiluje**

Run: `cd frontend && npm run build`
Expected: build kończy się sukcesem (brak błędów parsowania/importów).

- [ ] **Step 4: Weryfikacja wizualna każdego szablonu**

Uruchom aplikację (`cd frontend && npm run dev`) lub wygeneruj PDF i dla każdego z: Quarry, Moss, Garnet, Harbor, Obsidian sprawdź:
- sidebar zawiera KONTAKT → [umiejętności wypunktowane] → JĘZYKI → WYKSZTAŁCENIE, nic nie wychodzi poza stopkę (linia/kółko przy y≈783);
- kolumna główna zawiera tylko nagłówek/imię, PROFIL, DOŚWIADCZENIE; brak sekcji edukacji;
- tekst czytelny na tle (szczególnie **Harbor**: dolna lewa część sidebara — jeśli tekst wpada na jasny marmur, skompresuj odstępy sekcji, przesuwając WYKSZTAŁCENIE wyżej, albo zmień kolor drugorzędny na jaśniejszy);
- całość mieści się na jednej stronie A4.

Jeśli wykryto problem układu/kontrastu — popraw współrzędne/kolory w danym pliku i powtórz Step 1–3.

- [ ] **Step 5: Commit testu strukturalnego**

```bash
git add frontend/src/templates/sidebarSections.test.js
git commit -m "test: guard sekcji sidebar (wyksztalcenie/jezyki/umiejetnosci)"
```

---

## Self-Review (wypełnione przy pisaniu planu)

**1. Spec coverage:**
- Sekcje w sidebarze (KONTAKT → umiejętności bulleted → JĘZYKI → WYKSZTAŁCENIE) → Tasks 2–6, Steps 1–2. ✔
- Format umiejętności (lista wypunktowana) → Steps 1 w każdym zadaniu + guard w Task 1/7. ✔
- Format języków (lista wypunktowana) → Steps 2. ✔
- Format wykształcenia (dyplom—data / uczelnia, miasto / opis, 1 wpis) → Steps 2. ✔
- Usunięcie „EDUKACJA I KOMPETENCJE" z kolumny głównej + znacznik → Steps 3 + guard. ✔
- Strefy bezpieczne (garnet/harbor poniżej y≈290) → współrzędne w Task 4/5 + weryfikacja wizualna Task 7. ✔
- Polskie nagłówki (test) → Steps 4 w każdym zadaniu. ✔
- Zakres: dokładnie 5 szablonów → Tasks 2–6. ✔

**2. Placeholder scan:** brak TBD/TODO; każdy krok ma konkretny kod i komendy. ✔

**3. Type consistency:** wszystkie sekcje używają istniejących helperów (`text`, `block`, `bulleted`, `bold`, `tracked`) i stałych zdefiniowanych w każdym pliku; kolory podane jako stałe lub literały hex zgodne z oryginałem danego szablonu. ✔
