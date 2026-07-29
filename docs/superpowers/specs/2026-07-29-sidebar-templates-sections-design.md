# Sidebar templates — sekcje Wykształcenie / Umiejętności / Języki

Data: 2026-07-29
Powiązane: BUGZ.MD #14 (SZABLONY — „sidebarowe szablony maja byc na jedna strone; kategorie sidebar i main column")

## Problem

W szablonach z układem panelu bocznego sekcje są rozmieszczone niespójnie:

- **Wykształcenie** znajduje się w kolumnie głównej (jako „EDUKACJA I KOMPETENCJE"), a powinno być w sidebarze.
- **Umiejętności** istnieją w sidebarze, ale jako zwykły blok tekstu (bez wypunktowania) i pod tematyczną nazwą.
- **Języki** nie istnieją jako osobna sekcja w żadnym z tych szablonów.

Efektem jest zbyt długa kolumna główna (ryzyko przelania na drugą stronę) i niespójny układ względem oczekiwanego wzorca „CV z panelem bocznym".

## Zakres

Pięć szablonów o układzie panelu bocznego:

| Szablon  | Plik            | Tło sidebara            | Kolor tekstu sidebara |
|----------|-----------------|-------------------------|-----------------------|
| Quarry   | `quarry.js`     | ciemny navy (grafika)   | jasny (INK)           |
| Moss     | `moss.js`       | jasny kremowy papier    | ciemny (FOREST)       |
| Garnet   | `garnet.js`     | burgund, łuk art déco u góry | jasny             |
| Harbor   | `harbor.js`     | navy + marmur u góry    | jasny                 |
| Obsidian | `obsidian.js`   | lity czarny (prostokąt) | jasny (BODY)          |

Pozostałe szablony (Ledger, Nimbus, Banking, Darktheme poza Obsidianem, itd.) — bez zmian.

## Wymagania

### 1. Sekcje w sidebarze

Każdy z pięciu szablonów ma w sidebarze (kolumna x≈24, szerokość ≈136 px) następujący stos sekcji, w kolejności:

1. **KONTAKT** — bez zmian.
2. **[tematyczny nagłówek umiejętności]** — zachowany z każdego szablonu:
   - Quarry → `GŁÓWNE TECHNOLOGIE`
   - Moss → `KOMPETENCJE`
   - Garnet → `OBSZARY`
   - Harbor → `OBSZARY`
   - Obsidian → `OBSZARY`

   Treść przeformatowana na **listę wypunktowaną**: każda pozycja w osobnej linii z prefiksem `• `, blok owinięty helperem `bulleted(...)`.
3. **JĘZYKI** — nowa sekcja, **lista wypunktowana** (2–3 pozycje), format pozycji: `• Język — poziom` (np. `• Polski — ojczysty`, `• Angielski — C1`).
4. **WYKSZTAŁCENIE** — przeniesione z kolumny głównej, **jeden wpis** w formacie trójwierszowym:
   ```
   Nazwa dyplomu — data / przedział czasowy      (pogrubione)
   Uczelnia, Miasto                              (kolor przygaszony/mute)
   krótki opis                                   (kolor tekstu body)
   ```

Nagłówki nowych sekcji stylizowane jak istniejące nagłówki sidebara (`tracked(text(...))`, ten sam rozmiar/kolor akcentu/letterSpacing co KONTAKT w danym szablonie). Bez znaczników kółek (sidebar ich nie używa).

### 2. Kolumna główna

Z kolumny głównej usuwana jest sekcja „EDUKACJA I KOMPETENCJE" wraz z jej dekoracyjnym znacznikiem (`circle`/`ellipse` z `id` `*-education`) i linią podkreślenia nagłówka.

Pozostają bez zmian: nagłówek/imię, PROFIL, DOŚWIADCZENIE oraz elementy stopki (`fixedToPage`).

Usuwane znaczniki edukacji nie są celem żadnego `connector(...)` (konektory odnoszą się tylko do `*-frame` / `*-orbit`/`*-leaf`/`*-arc`/`*-wave` / `*-node`/`*-seed`/`*-seal`/`*-point`), więc usunięcie jest bezpieczne.

### 3. Strefy bezpieczne układu (respektowanie grafiki tła)

- **Quarry, Moss, Obsidian** — cała wysokość sidebara jest czytelna; stos sekcji zaczyna się w górnej części (KONTAKT ≈ y 73–110) i schodzi w dół z równym rytmem.
- **Garnet, Harbor** — górna część sidebara zajęta grafiką; stos sekcji zaczyna się **poniżej y≈290** (jasny tekst na litym tle) i mieści się w zakresie y≈300–770.

Rytm pionowy (spójny w obrębie szablonu): odstęp nagłówek→treść ≈ 18–20 px; odstęp koniec-treści→następny-nagłówek ≈ 22–26 px. Cały stos musi zmieścić się nad stopką (linia/kółko przy y≈783).

### 4. Treść

Treść pozostaje przykładowa (placeholder) — jak dotychczas w szablonach. Istniejące przykłady umiejętności/edukacji są adaptowane do nowego formatu; języki dobrane 2–3 pozycje pasujące do persony danego szablonu. Cała treść i nagłówki po polsku.

## Ograniczenia / testy

- [polishHeadings.test.js](../../../frontend/src/templates/polishHeadings.test.js) musi dalej przechodzić — wszystkie nagłówki po polsku, żadnych angielskich nagłówków z listy zakazanej.
- Każdy zmodyfikowany szablon musi się poprawnie parsować i ładować do edytora (tablica elementów, poprawne helpery).
- Weryfikacja wizualna: każdy z 5 szablonów mieści się na jednej stronie A4, sidebar bez przelania sekcji poza stopkę, tekst czytelny na tle.

## Poza zakresem

- Model danych / kategorie sekcji („kategorie sidebar i main column" z BUGZ #14) — ten spec dotyczy wyłącznie statycznych definicji szablonów, nie wprowadza abstrakcji kategorii.
- Pozostałe punkty BUGZ.MD.
- Zmiany w innych szablonach niż wymienione pięć.
