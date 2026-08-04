# Slate — nowy szablon CV (design)

Data: 2026-08-04

## 1. Cel

Dodać nowy szablon CV o nazwie **Slate**: dwukolumnowy layout inspirowany
referencyjnym szablonem Enhancv (sidebar ze zdjęciem, kontaktami, edukacją,
umiejętnościami, językami i narzędziami + główna kolumna z podsumowaniem i
doświadczeniem), przełożony na możliwości CV STUDIO. Paleta **niebiesko-szaro-
czarna** ("stalowy błękit"), własny język dekoracji **wyraźnie odróżniający się
od szablonu Tessera**, prostokątny slot na zdjęcie (jak w Tessera).

Slate jest szablonem płatnym (`tier: "paid"`), z tagami układu
`["sidebar", "icons"]`.

## 2. Podejście architektoniczne

Rozważane opcje:

- **A (wybrana): reużyć sprawdzonej architektury generatora Tessery i
  przeskórować.** Ten sam silnik układu (`Builder`, `_sidebar_candidates`,
  `_fit_sidebar_sections`, `_place_experience_record`, `_place_education_record`,
  `_extra_sections`) już poprawnie obsługuje przepływ sekcji sidebaru, paginację
  i atomowe rekordy. Zmieniamy wyłącznie: kolory, dekoracje, fonty i motyw ikon.
  Zero ryzyka regresji w logice układu, pełna odrębność wizualna.
- B: nowy generator od zera — większe ryzyko regresji paginacji bez korzyści.
- C: wspólny sparametryzowany generator dwukolumnowy dla Tessery i Slate — duży
  refaktor niepowiązany z zadaniem, odrzucony (YAGNI).

**Decyzja: A.**

## 3. Paleta i typografia

| Rola | Hex |
|---|---|
| papier / tło | `#FFFFFF` |
| pasek boczny (chłodny, delikatny) | `#F1F4F8` |
| akcent (stalowy błękit) | `#3E5C76` |
| tusz / nazwisko / nagłówki | `#1C2530` |
| tekst body | `#3A424C` |
| szary muted | `#7A8794` |
| hairline / cienkie linie | `#D3DAE2` |
| jasny akcent (tło slotu zdjęcia) | `#E7ECF2` |
| biały (glify na badge'ach) | `#FFFFFF` |

Typografia świadomie inna niż Tessera (która ma serifowy masthead
PlayfairDisplay): Slate używa **Montserrat** — nazwisko wersalikami z trackingiem
(korporacyjny, precyzyjny ton). Body również Montserrat. Fonty renderowalne przez
backend obejmują Montserrat, więc nie ma ryzyka braku fontu.

## 4. Układ

Dwukolumnowy. Geometria kolumn dziedziczona ze sprawdzonej Tessery, żeby
paginacja i dopasowanie sekcji sidebaru działały identycznie:

- sidebar: szerokość ~178 px, lewy margines treści `side_left = 25`,
  szerokość treści sidebaru `side_body_width = 128`,
- kolumna główna: `main_left = 218`, `main_width = 329`.

Kolejność sidebaru (jak w Tessera): prostokątny slot na zdjęcie → KONTAKT →
dopasowane sekcje z `_sidebar_candidates` (kolejność: education, skills,
languages, certifications, interests). Sekcje, które się nie zmieszczą, spływają
do głównej kolumny.

Kolumna główna: masthead (nazwisko + pigułka z tytułem + linia kontaktu +
ornament) → podsumowanie → doświadczenie → sekcje nadmiarowe (after_experience) →
edukacja/umiejętności, jeśli nie trafiły do sidebaru → after_skills.

## 5. Język dekoracji Slate (odróżnienie od Tessery)

Tessera = ciepła "mozaika": obrysowane kafelki z przesunięciem, koralowe koła,
ochrowe elipsy, serif. **Slate = chłodny "blueprint / precyzja", wyłącznie
wypełnione figury geometryczne.** Ograniczenie techniczne: dostępne prymitywy to
tylko wypełniony prostokąt (`_line`), obrysowany prostokąt (`_rect`), koło
(`_circle`), elipsa (`_ellipse`), tekst, obraz/ikona — **bez zaokrąglonych rogów
i bez ścieżek**, więc "bloby" nie są rysowalne. Tożsamość niosą figury
geometryczne.

| Element | Tessera | Slate |
|---|---|---|
| Badge nagłówka | biały kafel + koralowy obrys + ochrowe koło | pełny, wypełniony kwadratowy badge w akcencie (`_line`) z białym glifem |
| Tytuł stanowiska | cienki koralowy kafelek | pełna pigułka w akcencie (`_line`) z białym tekstem |
| Dekoracja zdjęcia | ochrowa elipsa + koralowe koła (organiczne) | podwójna cienka ramka z przesunięciem (muted `_rect`) + małe kwadraciki akcentu (`_line`) w narożnikach + pionowy pasek akcentu przy krawędzi + jasne tło slotu `#E7ECF2` |
| Ornament mastheadu (prawy górny róg) | pojedynczy kafel mozaiki | siatka 3×3 małych kwadracików akcentu (motyw "precyzyjnej siatki") |
| Rozdzielenie sidebaru | gruby 4 px koralowy pasek | cienki 2 px hairline akcentu + chłodny jasny band `#F1F4F8` |
| Stopka / kontynuacja | koralowe koło + ochrowa elipsa | numer strony w małym wypełnionym kwadracie-tabie + hairline |
| Masthead nazwiska | serif (PlayfairDisplay) | sans geometryczny (Montserrat), wersaliki, tracking |

## 6. Ikony — dwa warianty (wzorzec jak Harbor)

Skrypt `scripts/generate_iconic_icons.py` generuje jednokolorowe line-art PNG.
Dodajemy dwa motywy w `SUBSET_THEMES`:

- **`slate`** → glify **białe** `#FFFFFF` (do wypełnionych badge'y nagłówków),
- **`slate-accent`** → glify w **akcencie** `#3E5C76` (do gołych wierszy kontaktu
  i placeholdera portretu).

Zestaw glifów jak w Tessera: `email, phone, github, location, calendar, portrait,
summary, experience, education, skills, languages, interests, references,
certifications, other`.

Frontend ładuje ikony z URL backendu
(`${API_BASE_URL}/template-assets/iconic/slate` oraz `…/slate-accent`), więc
wystarczy wygenerować pliki w `backend/template_assets/iconic/`.

## 7. Slot na zdjęcie

Jak w Tessera: prostokątny, zablokowany (`fixedToPage` + `locked`) klaster
dekoracyjny. Ramka to `_rect` z `id: "slate-photo-frame"` (wysokość > szerokość).
Wewnątrz placeholder `portrait` (obraz), który użytkownik podmienia na własne
zdjęcie bez usuwania dekoracji. Za placeholderem jasne tło `#E7ECF2`, żeby glif
w akcencie był czytelny. Tylko klaster zdjęcia i szyny stron są nieinteraktywne;
wiersze kontaktu i dopasowane sekcje sidebaru pozostają edytowalne.

## 8. Pliki

Dodane:
- `backend/app/services/cv_templates/templates/slate.py` — generator `_gen_slate`.
- `frontend/src/templates/slate.js` — statyczny podgląd `slateTemplate`.
- `backend/template_assets/iconic/slate/*.png` i `…/slate-accent/*.png` —
  wygenerowane skryptem.
- `frontend/src/templates/slate.test.js` — test podglądu.

Zmienione:
- `backend/app/services/cv_templates/registry.py` — import `_gen_slate`, wpis w
  `TEMPLATE_LAYOUTS` (`frozenset({"sidebar", "icons"})`) i `_GENERATORS`.
- `frontend/src/templates/index.js` — import `slateTemplate` i wpis w `TEMPLATES`
  (`id: "slate"`, `tier: "paid"`, `accent: "#3E5C76"`,
  `layouts: ["sidebar", "icons"]`).
- `scripts/generate_iconic_icons.py` — wpisy `slate` i `slate-accent` w
  `SUBSET_THEMES`.
- `backend/app/services/entitlements.py` — tylko jeśli utrzymuje jawną listę
  płatnych/dostępnych szablonów (do sprawdzenia w implementacji).
- `backend/tests/test_cv_template_layouts.py` — test warstw dla Slate.
- Ewentualne testy trzymające kanoniczną listę szablonów
  (`frontend/src/templates/sidebarSections.test.js`,
  `frontend/src/utils/cvTemplateSelection.test.js`,
  `frontend/src/utils/templateLayouts.test.js`) — dodać Slate, jeśli wymagają.
- `README.md` — sekcja szablonów/Features (EN + PL).

Uwaga: podgląd w pickerze/Hero renderuje się na żywo z `elements` (jak Tessera),
więc statyczny plik `frontend/public/template-mockups/slate.png` nie jest
wymagany. Do potwierdzenia w implementacji.

## 9. Testy

- Backend (`test_cv_template_layouts.py`), analogicznie do testu Tessery:
  - slot zdjęcia `id: "slate-photo-frame"` jest prostokątem, `height > width`,
    ma `fixedToPage` + `locked`,
  - poprawny przepływ wielostronicowy (używa `LONG_CV`), brak zakazanych
    prymitywów (np. `connector`),
  - wiersze kontaktu / ciała sekcji sidebaru pozostają edytowalne (nie wszystkie
    elementy w pasie sidebaru mają `fixedToPage`).
- Frontend (`slate.test.js`): obecność slotu zdjęcia, badge'y nagłówków, obu
  wariantów ikon, pigułki tytułu.
- Uruchomić istniejące zestawy (layout / selection / sidebar) i dodać Slate tam,
  gdzie testy trzymają kanoniczną listę szablonów.

## 10. Dokumentacja (README)

Dodać Slate do sekcji szablonów/Features w obu wersjach językowych (EN + PL):
opis palety, motywu ikon (dwa warianty), slotu zdjęcia i tagów układu. Zgodnie z
wymogami README w CLAUDE.md — zweryfikować odwołania do plików i nie zgadywać
numerów linii.

## 11. Kryteria akceptacji

1. `slate` zarejestrowany w backendzie i frontendzie; `generate_resume("slate",
   cv)` zwraca poprawny, wielostronicowy układ dla `LONG_CV`.
2. Slot zdjęcia prostokątny, zablokowany, z `id: "slate-photo-frame"`.
3. Dekoracje wizualnie odrębne od Tessery (wypełnione badge, pigułka tytułu,
   wsporniki zdjęcia, siatka 3×3, hairline sidebaru, tab stopki).
4. Paleta zgodna z tabelą z sekcji 3; masthead w Montserrat.
5. Ikony w dwóch wariantach (`slate` biały, `slate-accent` akcent) wygenerowane
   i serwowane.
6. Wszystkie testy backendu i frontendu przechodzą; README zaktualizowane w obu
   językach.
