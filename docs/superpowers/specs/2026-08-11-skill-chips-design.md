# Chipsy umiejętności (rounded pills) — design

Data: 2026-08-11

## 1. Cel

Umożliwić renderowanie sekcji UMIEJĘTNOŚCI jako rzędu zaokrąglonych "pigułek"
(chipsów) — jeden `rectangle` + jeden `text` na skill — zamiast dzisiejszego
tekstu inline (kropki) lub listy punktowanej. Wygląd docelowy: jak w
referencyjnym screenie użytkownika (np. "Analiza AML/KYC", "SQL", "Python"
każdy w osobnej zaokrąglonej ramce, zawijane do kolejnych wierszy).

Wymaganie nadrzędne: reflow/zawijanie chipsów **nie może** psuć pozycjonowania
innych elementów na stronie — sekcja umiejętności musi się nadal zachowywać
jak dziś (przewidywalny, atomowy blok w pionowym stackowaniu strony).

## 2. Decyzje zakresu (z rozmowy brainstormingowej)

1. **Generowanie wyłącznie po stronie backendu**, tak jak dzisiejsza sekcja
   umiejętności — brak nowego, edytowalnego w canvasie typu elementu.
   Chipsy nie są ręcznie przesuwalne pojedynczo; edycja odbywa się przez dane
   wejściowe skilli, tak jak dziś działa dla trybu `inline`/`bullets`.
2. **Nowy wspólny wariant `mode="chips"`** w `_place_skills_section` (a nie
   zmiana jednego szablonu) — każdy z ~20 szablonów korzystających z tej
   funkcji może opcjonalnie włączyć chipsy, przekazując `mode="chips"`.
   Domyślne zachowanie pozostałych szablonów jest niezmienione.
3. **Kolor chipsów pochodzi z istniejącej palety szablonu** (ten sam słownik
   kolorów, który już jest przekazywany do `_place_skills_section` jako
   `body_color`/paleta akcentu) — brak nowego pola konfiguracyjnego.
4. **Podział stron: cały blok kategorii (etykieta + wszystkie wiersze
   pigułek) przechodzi razem na kolejną stronę**, nigdy nie jest przecinany
   w połowie wiersza — przez ponowne użycie istniejącego mechanizmu
   `Builder.keep_together`/`flowGroup`, bez nowej logiki dzielenia.

## 3. Podejście architektoniczne

Rozważane opcje:

- **A (wybrana): rozszerzyć `shared/text.py` o tryb `"chips"`, emitujący
  istniejące kategorie elementów `rectangle` + `text`.** Zero zmian w
  schemacie (`pdf_schema.py`, `shared/pdf-element.schema.json`), zero nowego
  case'u w dispatchu renderera (`pdf_generator.py`), zero nowego komponentu
  canvas. `rectangle` już ma sprawdzoną parytetową obsługę `borderRadius` +
  `filled` po obu stronach (canvas `Rectangle.jsx`, PDF `renderRectangle` w
  `pdf_generator.py:223`, dispatch `pdf_generator.py:1105`). Wzorzec
  zawijania do kolejnych wierszy już istnieje jako jednorazowy hack w
  `axis.py` (`_place_skill_chips`, linie 221–237) — generalizujemy go do
  `shared/text.py`, naprawiając przy okazji lukę opisaną w sekcji 5.
- B: nowy typ elementu `chip-list`/`chip-group` w schemacie, renderowany
  jako jeden element zawierający N pod-elementów. Wymagałby zmian w 5+
  plikach (enum kategorii, dispatch backendu, fabryka frontendowa, komponent
  canvas, ewentualnie `textareaReflow.js`), bez korzyści — bo chipsy i tak
  nie mają być edytowalne w canvasie (decyzja #1). Odrzucone jako
  nieproporcjonalne do zakresu.
- C: renderować chipsy jako pojedynczy `textarea` z ręcznie wstawionymi
  spacjami/tabulacją imitującą pigułki. Odrzucone — `textarea` nie ma
  per-fragmentowego tła/obramowania, więc nie da realnego wyglądu pigułki
  bez CSS/rich-text, którego renderer PDF nie obsługuje.

**Decyzja: A.**

## 4. Przepływ danych i miejsce zmian

`_place_skills_section` (`backend/app/services/cv_templates/shared/text.py:146`)
zyskuje trzecią wartość `mode`: `"inline" | "bullets" | "chips"`. Dla
`mode="chips"`:

- `_skill_group_body_content` (linia 78) nie może już zwracać zwykłego
  stringa przekazywanego do `b.block(...)` — chipsy nie są jednym blokiem
  tekstu, tylko N par `rectangle`+`text` o niezależnych pozycjach. Zamiast
  tego `_place_skills_section` dla `mode="chips"` wywołuje nową funkcję
  `_place_skill_chips_row(b, items, left, width, fs, color, font)` zamiast
  `b.block(...)`.
- `_measure_skill_group` (linia 89) zyskuje analogiczną gałąź
  `_measure_skill_chips_row(...)`, licząc **całkowitą** wysokość
  zawiniętego bloku (liczba wierszy × wysokość wiersza), żeby
  `keep_together` w `_place_skills_section` (linia 203) zarezerwował
  poprawną przestrzeń dla całej kategorii naraz — patrz sekcja 5.

Nowe funkcje trafiają do `shared/text.py`, obok istniejących helperów
`_skills_inline_content`/`_bullet_list_content`, żeby cały wybór trybu
renderowania skilli został w jednym module.

## 5. Algorytm zawijania (i poprawka względem `axis.py`)

Wzorzec bazowy: `axis.py:221` (`_place_skill_chips`) — kursor `cx`/`cy`,
dla każdego skilla liczona jest szerokość tekstu (`_text_width`, `axis.py:42`,
oparte o `PDF_Generator._resolve_font` + `stringWidth`), a gdy
`cx + advance > R`, kursor wraca do lewej krawędzi i schodzi o `row_step` w
dół.

`_text_width` zostaje **przeniesione do `shared/text.py`** (lub
`cv_generator_primitives.py`) jako funkcja współdzielona, bo `axis.py` i
nowy kod w `shared/text.py` potrzebują tej samej logiki pomiaru.

**Poprawka:** `axis.py:225` rezerwuje miejsce tylko na jeden wiersz
(`b.need(row_step)`) *przed* zawinięciem, więc kategoria z wieloma skillami
może wystrzelić poza stopkę w trakcie zawijania — dzisiejszy `axis.py` nie
używa tu `keep_together`. Nowa, współdzielona wersja liczy **najpierw**
całkowitą liczbę wierszy (measure pass, jak każdy inny blok w tym pliku), a
dopiero potem rysuje (place pass) wewnątrz `keep_together(group_h)`, tak jak
już dziś robi to `_place_skills_section` dla trybu `inline`/`bullets`
(linia 203). To realizuje wymaganie #4 z sekcji 2 bez nowej logiki
podziału stron — cały mechanizm dziedziczymy z `Builder.keep_together`
(`cv_generator_primitives.py:244`).

Renderowanie pojedynczego chipa:

- `rectangle`: `left/top` z kursora `cx/cy`, `width` = szerokość tekstu +
  padding poziomy, `height` = wysokość wiersza, `filled=True`,
  `borderRadius` = połowa wysokości (pełna pigułka), `backgroundColor` z
  palety szablonu.
- `text`: wyśrodkowany wewnątrz prostokąta (ten sam `cx/cy` + offset
  liczony z `fs` i paddingu), kolor kontrastowy do tła (z palety szablonu,
  tak jak dziś np. `C['bg']` na kolorowym tle w innych miejscach szablonów).

Konieczna mała, addytywna zmiana: `_rect()` w
`cv_generator_primitives.py:168` dziś tworzy wyłącznie obrys (bez
`filled`/`borderRadius` — w przeciwieństwie do `_circle`/`_ellipse`, które
już mają `filled`). Dodajemy oba parametry jako opcjonalne kwargs z
wartościami domyślnymi zgodnymi z obecnym zachowaniem (`filled=False,
borderRadius=None`), więc żadne istniejące wywołanie `_rect()` się nie
zmienia.

## 6. Strony/pliki

Zmienione:

- `backend/app/services/cv_templates/shared/text.py` — `mode="chips"` w
  `_place_skills_section`, `_skill_group_body_content`,
  `_measure_skill_group`; nowe `_place_skill_chips_row`,
  `_measure_skill_chips_row`.
- `backend/app/services/cv_generator_primitives.py` — `_rect()` zyskuje
  `filled`/`borderRadius` kwargs (linia 168); ewentualnie przenosi się tu
  `_text_width` jako współdzielony helper pomiaru.
- `backend/app/services/cv_templates/templates/axis.py` — `_place_skill_chips`
  zaczyna korzystać ze współdzielonego `_text_width` (usunięcie duplikacji);
  bez zmiany wizualnej dla Axis (Axis zostaje przy swoim stylu
  tekst+podkreślenie, nie przechodzi na `rectangle`-pigułki, chyba że
  osobno zdecydujemy inaczej).
- Wybrany szablon(y) docelowy(e) — dodanie `mode="chips"` do wywołania
  `_place_skills_section` (do ustalenia który/które szablony faktycznie
  mają dostać nowy wygląd; ten spec dodaje **możliwość**, włączenie w
  konkretnym szablonie to osobna, mała zmiana per szablon).

Bez zmian (potwierdzone w rozpoznaniu):

- `backend/app/schemas/pdf_schema.py`, `shared/pdf-element.schema.json` —
  `rectangle` już ma `borderRadius`/`filled` w schemacie.
- `backend/app/services/pdf_generator.py` — `renderRectangle`/dispatch już
  obsługują zaokrąglone, wypełnione prostokąty.
- `frontend/src/components/canvas/Rectangle/Rectangle.jsx`,
  `frontend/src/utils/a4ElementFactories.js` — brak zmian, bo chipsy nie są
  interaktywnym typem elementu w edytorze (decyzja #1).
- `frontend/src/utils/textareaReflow.js` — brak zmian; chipsy nie są
  `textarea`, więc nie wchodzą w istniejący mechanizm cascade/push-down, a
  ich pozycje są ustalone raz przy generowaniu, tak jak każdy inny
  wygenerowany blok.

## 7. Testy

- Backend: nowy test w stylu `test_cv_template_layouts.py` (lub obok testów
  `shared/text.py`, jeśli istnieją) weryfikujący:
  - zawijanie do kolejnego wiersza, gdy suma szerokości chipsów przekracza
    szerokość sekcji,
  - że cały blok kategorii (etykieta + wszystkie wiersze) ląduje na jednej
    stronie razem (test na `flowGroup`/brak podziału `page` w obrębie
    jednej kategorii) przy długiej liście skilli blisko końca strony,
  - że `rectangle` chipsy mają `filled=True` i `borderRadius > 0`, a
    `backgroundColor` zgadza się z paletą przekazaną do funkcji.
- Uruchomić istniejący zestaw testów szablonów, które dziś wołają
  `_place_skills_section`, żeby potwierdzić brak regresji dla trybów
  `inline`/`bullets` (parametr `mode` musi być w pełni opcjonalny/wsteczny).

## 8. Dokumentacja (README)

Zgodnie z wymogami README w `CLAUDE.md`: po implementacji dodać do sekcji
Features (EN + PL) opis trybu `chips` w sekcji umiejętności, z realnymi
odwołaniami do plików/linii zweryfikowanymi po scaleniu kodu (nie zgadywać
numerów linii na etapie tego spec doc).

## 9. Kryteria akceptacji

1. `_place_skills_section(..., mode="chips")` renderuje każdy skill jako
   osobny zaokrąglony, wypełniony `rectangle` + wyśrodkowany `text`, kolor
   z palety szablonu.
2. Chipsy zawijają się do kolejnych wierszy, gdy nie mieszczą się w
   szerokości sekcji; brak nakładania się chipsów.
3. Cała kategoria (etykieta + wszystkie wiersze chipsów) trafia razem na tę
   samą stronę — nigdy nie jest przecięta w połowie wiersza pigułek — dzięki
   poprawnie zmierzonej wysokości przekazanej do `keep_together`.
4. Tryby `inline` i `bullets` zachowują dokładnie dzisiejsze zachowanie
   (brak regresji — parametr `mode="chips"` jest czysto addytywny).
5. `_rect()` pozostaje wstecznie kompatybilny — istniejące wywołania bez
   `filled`/`borderRadius` renderują się identycznie jak dziś.
6. Testy z sekcji 7 przechodzą; README zaktualizowane w obu językach po
   implementacji.
