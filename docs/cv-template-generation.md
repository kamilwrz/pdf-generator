# Jak generowane są szablony CV

Ten dokument opisuje pełną ścieżkę od danych kandydata do elementów na płótnie A4: **gdzie kończy się AI, a gdzie zaczyna deterministyczny Python** w `backend/app/services/cv_generator.py`.

---

## 1. TL;DR — podział ról

| Warstwa | Co robi | Czego **nie** robi |
|---|---|---|
| **Geometria źródła (`cv_source_layout`)** | Rozdziela natywne linie PDF na kolumny, wykrywa nagłówki i po odpowiedzi modelu ugruntowuje podsumowanie, specjalizacje oraz referencje | Nie interpretuje elastycznych rekordów doświadczenia i edukacji ani skanów bez warstwy tekstowej |
| **AI (Cloudflare Workers AI)** | Czyta tekst PDF zachowujący kolumny (Llama 3.1 8B Fast + JSON Mode), a tylko strony skanowane jako obrazy (Qwen 3.8), i zwraca **ustrukturyzowany JSON** | Nie układa elementów, nie liczy Y, nie wybiera kolorów, nie paginuje |
| **`cv_data.normalize_cv_data`** | Ujednolica dane z PDF **i** z kreatora (wizard) do jednego schematu | Nie generuje layoutu |
| **`cv_generator.generate_resume`** | Bierze `(template_id, cv_data)` i zwraca listę elementów canvas | Nie woła OpenAI; nie „projektuje” wizualnie w locie |
| **Frontend (`templates/*.js`)** | Statyczna **próbka / podgląd** szablonu z przykładową treścią | Nie wypełnia realnym CV użytkownika |
| **Asystent AI na canvasie** | Edytuje już wygenerowane elementy (treść, pozycje, styl) | To osobny tor — **nie** zastępuje `cv_generator` |

**Najważniejsze zdanie:** AI wyciąga *co* napisać; Python decyduje *gdzie* i *jak* to ułożyć w wybranym szablonie.

```
PDF upload / kreator bio
        │
        ▼
┌───────────────────┐
│  AI extract_cv    │  ← tylko przy imporcie PDF
│  (opcjonalnie)    │
└─────────┬─────────┘
          │  surowy JSON
          ▼
┌───────────────────┐
│ ground from PDF   │  ← deterministyczne granice sekcji tekstowych
└─────────┬─────────┘
          │  JSON ugruntowany źródłem
          ▼
┌───────────────────┐
│ normalize_cv_data │  ← zawsze przed fill
└─────────┬─────────┘
          │  stabilny profil CV
          ▼
┌───────────────────┐
│ POST /ai/fill_    │
│ template          │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ cv_generator.     │  ← deterministyczny layout
│ generate_resume   │
└─────────┬─────────┘
          │  [{category, left, top, ...}, ...]
          ▼
     Canvas edytora  →  eksport PDF
```

---

## 2. Dwa wejścia do tych samych danych

Użytkownik może wypełnić CV na dwa sposoby. Oba kończą się tym samym obiektem `cv_data` i tym samym wywołaniem generatora.

### 2.1 Import PDF (`POST /ai/extract_cv`)

1. Frontend wysyła plik PDF.
2. `ai_service.extract_cv_data`:
   - odczytuje przez `PyMuPDF` linie i spany wraz z prostokątami położenia (domyślnie maks. 12 stron),
   - `cv_source_layout.extract_pdf_source_pages` grupuje początki linii w osobne kolumny, dzięki czemu nagłówek z lewego sidebara nie łączy się z treścią prawej kolumny,
   - przekazuje modelowi zwarty `SOURCE_SECTIONS` i tekst każdej kolumny w osobnych ogranicznikach,
   - wysyła zwykły dokument tekstowy do **Llama 3.1 8B Fast** w JSON Mode,
   - rasteruje do PNG wyłącznie strony bez wystarczającej warstwy tekstowej i wtedy przełącza całe żądanie na **Qwen 3.8 27B Vision**,
   - korzysta z OpenAI-compatible endpointu Cloudflare i promptu „zwróć wyłącznie JSON o takiej strukturze…”,
   - po pustym wyniku jawnego override'u Gemmy wykonuje najwyżej jeden fallback tekstowy na Llamę; domyślna konfiguracja używa Llamy od pierwszej próby.
3. Odpowiedź modelu jest parsowana. `ground_cv_data_from_source` składa pełne podsumowanie ze wszystkich zawiniętych wierszy, zachowuje łączone słowa, odczytuje pogrubione podkategorie Umiejętności/Specjalizacji i elementy rozdzielone kropką środkową oraz buduje referencje z rozpoznanych sekcji natywnego tekstu. Usuwa też skopiowany nagłówek WORK EXPERIENCE z pola stanowiska, jeśli źródło nie podaje jawnej roli. Dopiero tak ugruntowany obiekt przechodzi przez `normalize_cv_data`.
4. Frontend trzyma wynik i przy wyborze szablonu woła `fill_template`.

AI tu jest **ekstraktorem treści** (OCR/rozumienie dokumentu), nie silnikiem layoutu.

### 2.2 Kreator bio / wizard

1. Użytkownik wypełnia pola: imię, doświadczenie, wykształcenie, umiejętności, języki, własne sekcje, podsumowanie.
2. Szkic jest zapisywany (`bio_cv_draft`) i też normalizowany przez `normalize_cv_data`.
3. Przy „wygeneruj CV” frontend woła `POST /ai/fill_template` z `cv_data` + `template_id`.

**Tu AI w ogóle nie uczestniczy w layoutcie** — tylko wcześniej mógł pomóc w innych miejscach produktu (asystent na canvasie to osobna funkcja).

---

## 3. Endpoint, który buduje szablon: `fill_template`

Plik: `backend/app/api/routes/ai.py`

```text
POST /ai/fill_template
body: { template_id, cv_data }
```

Kolejność po stronie serwera:

1. Sprawdzenie planu / uprawnień do szablonu (`assert_template_allowed`).
2. `normalize_cv_data(cv_data, require_name=True)` — bez imienia nie generujemy.
3. `generate_resume(template_id, cv_data)` — z `ai_service`, które **tylko deleguje** do Pythona:

```python
# ai_service.generate_resume
from app.services.cv_generator import generate_resume as _python_layout
return _python_layout(template_id, cv_data)
```

4. Podmiana URL-i assetów szablonu na publiczny host (`_rebase_template_asset_urls`).
5. Odpowiedź: `{ "elements": [ ... ] }` — gotowa lista obiektów canvas.

Nazwa ścieżki `/ai/...` jest historyczna: fill **nie używa modelu językowego**.

---

## 4. Co to jest „element canvas”?

Zarówno frontendowe próbki (`frontend/src/templates/*.js`), jak i backendowy generator produkują **tę samą konwencję obiektów**:

| `category` | Rola |
|---|---|
| `text` | Jedna linia (imię, nagłówek sekcji, meta) |
| `textarea` | Wieloliniowy blok (`autoHeight: true`) — summary, bullet list, opis |
| `line` | Prostokąt wypełniony kolorem: tło, pasek, separator, rail |
| `rectangle` / `circle` / `ellipse` | Kształty dekoracyjne |
| `image` | Asset szablonu (np. sidebar PNG) |
| `connector` | Linia między dwoma elementami (akcenty redakcyjne) |

Wspólne pola pozycjonowania: `left`, `top`, `width`, `height`, `page`, `zIndex`, często `fixedToPage` dla dekoracji powtarzanych na każdej stronie.

Frontendowe pliki JS (`slate.js`, `sterling.js`, …) to **statyczny mock** z przykładową karierą — służą do podglądu w bibliotece i jako wizualny „kontrakt” designu.  
**Wypełnienie realnym CV zawsze idzie przez Pythona**, nie przez podmianę stringów w pliku JS.

---

## 5. Normalizacja danych (`cv_data.py`)

Zanim generator zobaczy dane, `normalize_cv_data` robi z nich stabilny profil:

```json
{
  "name": "...",
  "title": "...",
  "email": "...",
  "phone": "...",
  "location": "...",
  "summary": "...",
  "experience": [{ "title", "company", "city", "period", "bullets": [] }],
  "education": [{ "school", "city", "degree", "period", "description", "bullets", "detail" }],
  "skills": ["..."],
  "languages": [{ "name", "level" }],
  "custom_sections": [...],
  "extra_sections": [...],
  "labels": {
    "summary": "PODSUMOWANIE ZAWODOWE",
    "experience": "DOŚWIADCZENIE ZAWODOWE",
    "education": "WYKSZTAŁCENIE",
    "skills": "UMIEJĘTNOŚCI"
  }
}
```

Ważne szczegóły:

- **Języki** z wizarda (`languages`) są też dopisywane do `extra_sections` jako sekcja `kind: "languages"` — żeby starsze generatory sidebarów, które czytają tylko `extra_sections`, nadal je widziały.
- **Wykształcenie** ma osobne pola `school` / `city` / `degree` / `period` / `description`; pole `detail` to legacy „zlepka” dla starych payloadów z ekstrakcji.
- Walidacja: e-mail musi mieć `@`; przy fill wymagane jest imię.

Generator **ufnie zakłada** ten schemat — nie odpytuje AI o brakujące pola.

**Alias skills:** jeśli w `extra_sections` / `custom_sections` jest nagłówek w stylu „Obsługa komputera”, „Technologie”, „Narzędzia” itd., normalizacja rozpoznaje to bez AI jako slot skills: przenosi `items` do `skills`, zapisuje tytuł użytkownika w `labels.skills` i usuwa sekcję z `extra_sections`, żeby nie dublować treści. Gdy jest **kilka** rodzin (miękkie / twarde / narzędzia) albo wiersze `Kategoria: …`, normalizacja składa je w nazwane grupy `{category, items}` pod nadrzędnym `labels.skills = UMIEJĘTNOŚCI`; szablony rysują to przez `_place_skills_section` (chrome + pogrubione etykiety + chipy). Generatory sidebar (m.in. Tessera / Harbor) biorą nagłówek z `labels.skills` zamiast hardcodowanego „OBSZARY”.

---

## 6. Serce systemu: `cv_generator.py`

### 6.1 Publiczne API

```python
_GENERATORS = {
    "nimbus": _gen_nimbus,
    # ... 14 szablonów = te same id co frontend/src/templates/index.js
}

def generate_resume(template_id: str, cv_data: dict) -> list[dict]:
    fn = _GENERATORS.get(template_id)
    if fn is None:
        raise ValueError(...)
    return fn(cv_data)
```

Każdy `_gen_<id>` to funkcja: `cv_data → list[dict]` (elementy canvas).

### 6.2 Warstwy wewnątrz pliku

```
konstruktory elementów     _text, _block, _line, _rect, _circle, _ellipse
        │
Builder                    śledzi y + page, mierzy wysokość textarea
        │
helpery treści             _bullets, _company_period, _labels,
                           _place_education_record, _extra_sections,
                           logika sidebara (`_fit_sidebar_sections`)
        │
generatory per szablon     _gen_nimbus, _gen_monument, _gen_harbor,
                           _gen_slate, …
```

### 6.3 `Builder` — rytm pionowy i paginacja

`Builder` to kursor layoutu:

- `y` — aktualna pozycja od góry strony,
- `pg` — numer strony,
- `need(h)` — jeśli `y + h` przekracza `CONTENT_BOTTOM` (842 − 72 = **770**), skok na nową stronę i `y = PAGE_TOP` (66),
- `need_section(chrome, first_body)` — nagłówek sekcji **razem** z pierwszym blokiem treści (żeby nagłówek nie został sam na dole strony),
- `text` / `block` / `gap` / `line` — dokładają elementy i przesuwają `y`,
- `measure_block` — wysokość textarea liczona przez `PDF_Generator.measure_textarea_height` (metryki fontów zgodne z eksportem PDF).

Stałe rytmu (żeby wszystkie szablony „oddychały” podobnie):

| Stała | Znaczenie |
|---|---|
| `SPACE_STACK` (4) | Odstęp wewnątrz rekordu (tytuł → meta → body) |
| `SPACE_RECORD` (14) | Między rekordami (np. dwa joby) |
| `SPACE_SECTION` (18) | Po zakończonej sekcji |
| `SPACE_AFTER_RULE` (12) | Po linii pod nagłówkiem sekcji |

### 6.4 Typowy przebieg jednego `_gen_*`

Dla większości szablonów wzorzec jest ten sam:

1. **Kolory, fonty, lewy margines (`L`), szerokość kolumny (`W`)** — stałe motywu.
2. **`static`** — header (imię, tytuł, kontakt), dekoracje, ewentualny sidebar na stronie 1.
3. **`Builder(start_y)`** — przepływ treści w kolumnie głównej:
   - summary,
   - experience (pętla po *wszystkich* jobach — bez limitu slotów),
   - education (strukturalnie: dyplom bold / uczelnia / miasto·okres / opis jako bullet list),
   - skills w kolumnie głównej jako wiersz ze środkowymi kropkami (`_skills_inline_content`); bullet list tylko w sidebarze,
   - `extra_sections` w miejscach `after_experience` / `after_skills`.
4. **`page_decorations`** — dla każdej użytej strony: tło, rail, stopka z numerem, często `fixedToPage: true` (dekoracja nie przesuwa się przy reflow textarea na froncie).
5. Zwróć `page_decorations + static + flow`.

Liczba bloków doświadczenia = liczba wpisów w `cv_data["experience"]`. Jeśli nie mieszczą się na jednej stronie A4, `Builder` tworzy kolejne strony.

### 6.5 Rodziny szablonów (tagi layoutu)

Każdy z 14 szablonów ma osobny plik `cv_templates/templates/<id>.py` z funkcją `_gen_<id>`. Wspólna jest tylko warstwa helperów (`shared/records.py`, `shared/extras.py`, `shared/text.py`, `shared/icons.py`) oraz tagi w `TEMPLATE_LAYOUTS`:

| Tag layoutu | Szablony |
|---|---|
| `single` | nimbus, cinder, monument, atrium, blueprint |
| `icons` | nova, portico, axis (+ harbor, slate, atrium) |
| `sidebar` | harbor, slate, sterling |

Algorytm flow (summary → experience → …) jest wspólny koncepcyjnie; paleta, assety i chrome nagłówków są per szablon.

### 6.6 Sidebar: co trafia na lewy panel

Dla szablonów z tagiem `sidebar` działa wspólna logika w `shared/extras.py`:

1. `_sidebar_candidates` — buduje kandydatów: skills, languages/certyfikaty/zainteresowania z `extra_sections`, education (education niesie `entries` + `structured: true`, nie zbity string).
2. `_fit_sidebar_sections` — wkłada na pierwszą stronę **tylko kompletne sekcje**, które mieszczą się w **pozostałym budżecie wysokości** sidebara (z próbą mniejszych fontów). Education mierzy wysokość przez `_sidebar_education_section_height` (ten sam stack co `_place_education_record`). Nie ma osobnego limitu „max 160 px na sekcję” — taki limit odrzucał typowe listy z kreatora bio (~10–12 umiejętności) mimo wolnego miejsca. Sekcja, która nie mieści się w całości, **nie jest ucinana** — spada do kolumny głównej.
3. `_fitted_sidebar_body_elements` — education emituje osobne textarea (dyplom / uczelnia / meta / opis z `bulletList: true`); pozostałe sekcje zostają jednym blokiem.
4. Indeksy `extra_sections` już umieszczonych w sidebarze są pomijane w `_extra_sections`, żeby nie dublować treści.

Harbor, Slate i Sterling używają `_fit_sidebar_sections` ze wspólnymi kandydatami `_sidebar_candidates` (Harbor ma własny Builder sidebara z diamentami).

### 6.7 Extra sections

`_extra_sections(b, cv, placement, ...)` renderuje niestandardowe sekcje w kolumnie głównej w momencie wywołania (`after_experience` lub `after_skills`).

Dwa tryby treści (wybór po `kind` / tytule sekcji, patrz `cv_data.is_record_section`):

1. **Lista płaska** (`languages`, `certifications`, `interests`, …) — jeden blok `bulletList`.
2. **Rekordy** (`projects`, `references`, `awards`, `publications`, `volunteering`) — jak experience: pogrubiony `title`, opcjonalny `subtitle`, potem zagnieżdżone `bullets`.

Normalizacja (`cv_data.normalize_cv_data`) przyjmuje już obiekty `{title, bullets[]}` z ekstrakcji oraz **grupuje płaskie listy** heurystycznie, gdy ekstraktor spłaszczył tytuł projektu i punkty opisu do jednego poziomu. To most między swobodną strukturą CV z PDF a sztywnym szkieletem szablonu — bez per-szablonowych gałęzi „Projekty”.

---

## 7. Rola AI vs Python — precyzyjny kontrakt

### Co robi AI

| Zadanie | Moduł | Model |
|---|---|---|
| Ekstrakcja treści z PDF → JSON | `ai_service.extract_cv_data` | Cloudflare Llama 3.1 8B Fast (tekst) / Qwen 3.8 (tylko skany) |
| Asystent na canvasie (edycja, ATS, układ istniejących elementów) | `ai_assistant_service` | osobny tor, po wygenerowaniu CV |

Przy ekstrakcji AI dostaje **instrukcję schematu JSON** (experience, education z `school/city/degree/...`, skills, labels PL, `extra_sections` z `kind` / `placement` oraz **rekordowymi** `items` dla projektów/referencji). Temperatura jest niska (`0.1`). Llama tekstowa używa `max_tokens=8000` i oficjalnego `response_format=json_object`; Qwen Vision używa `max_completion_tokens=8000` oraz `reasoning_effort=low`, bez JSON Mode. Ścisły prompt i parser backendu nadal wymagają jednego obiektu JSON oraz tolerują wyłącznie opcjonalny Markdown fence lub typowane fragmenty tekstowe. Jawny rollback OpenAI używa `response_format=json_object`.

Heurystyczna grupacja w Pythonie pokrywa typowe spłaszczenia; pełna decyzyjność przy niejednoznacznych listach to naturalne miejsce na opcjonalny drugi pass LLM (Standard/Premium, kredyty AI) **przed** `generate_resume`, bez zmiany geometrii szablonów.

### Czego AI **nie** robi (i świadomie nie powinno)

- Nie wybiera `left` / `top` elementów szablonu przy fill.
- Nie liczy wysokości textarea pod PDF.
- Nie decyduje, czy education idzie do sidebara.
- Nie generuje „17 wariantów layoutu” promptem — każdy szablon to **ręcznie napisany** kod Pythona odwzorowujący design z JS.

### Co robi Python (`cv_generator`)

- Mapuje `template_id` → funkcja layoutu.
- Składa dekoracje i treść w spójny dokument wielostronicowy.
- Gwarantuje powtarzalność: **te same `cv_data` + ten sam szablon = te same elementy** (determinizm).
- Pilnuje granic A4, rytmu odstępów, `fixedToPage`, bullet list, struktury education.

Dlaczego tak? Layout CV musi być przewidywalny, testowalny (`backend/tests/test_cv_template_layouts.py`) i metrycznie zgodny z eksportem PDF. Modele językowe są dobre w czytaniu dokumentów, ale złe w pixel-perfect layoutcie.

---

## 8. Frontend: próbka vs wypełnienie

```
Biblioteka szablonów
   TEMPLATES[i].elements  ←  statyczny import z slate.js / sterling.js / …
   (przykładowa treść „Katarzyna Zielińska” itd.)

Wybór „wypełnij z PDF / z wizarda”
   → API fill_template
   → canvas dostaje NOWĄ listę elements z backendu
   → stary mock znika; użytkownik edytuje wygenerowany dokument
```

Pliki JS i funkcje `_gen_*` powinny wizualnie się zgadzać (kolory, szerokość sidebara, lewy tekst, itd.), ale **źródłem prawdy dla fill jest Python**. Gdy zmienia się layout fill (np. skills w sidebarze Tessera), backend jest obowiązkowy; aktualizacja JS to spójność podglądu w bibliotece.

---

## 9. Co dzieje się po wygenerowaniu

1. Elementy lądują na płótnie React (PdfCanvas).
2. Użytkownik może przeciągać, zmieniać fonty, dodawać kształty.
3. **Asystent AI** operuje już na liście elementów (zmiana treści, przesunięcia grup, analiza ATS) — to nie jest ponowne `generate_resume`.
4. Eksport PDF (`pdf_generator`) renderuje te same kategorie elementów z metrykami zgodnymi z `measure_textarea_height`.

Czyli: generator buduje **punkt startowy**; canvas + asystent to dalsza edycja.

---

## 10. Jak dodać / zmiennić szablon (mentalny checklist)

1. Design próbki w `frontend/src/templates/<id>.js` + wpis w `index.js`.
2. Generator `_gen_<id>` (lub wpis w istniejącym motywie) w `cv_generator.py`.
3. Rejestracja w `_GENERATORS`.
4. Testy w `test_cv_template_layouts.py` (np. czy sidebar dostaje skills, czy dekoracje są `fixedToPage`).
5. Assety w `backend/template_assets/` jeśli szablon używa `image`.
6. Tier free/paid w entitlements / `TEMPLATES[].tier`.

Bez kroku 2–3 podgląd w bibliotece istnieje, ale **fill_template rzuci „Nieznany szablon”**.

---

## 11. Częste nieporozumienia

| Obserwacja | Wyjaśnienie |
|---|---|
| „AI źle ułożyło CV” | Layout robi Python; AI mogło źle *wyekstrahować* treść albo użytkownik edytował canvas. |
| „W podglądzie biblioteki skills są w sidebarze, a po fill nie” | JS i `_gen_*` były niespójne — fill bierze tylko Pythona. |
| „Endpoint `/ai/fill_template` używa GPT” | Nie — tylko deleguje do `cv_generator`. |
| „Za dużo treści = ucięcie” | Zasadniczo nie: `Builder` dokłada strony. Wyjątek: sidebar może *odmówić* za dużej sekcji i przenieść ją do main (complete-section policy). |
| „Zmieniłem tylko `slate.js`” | Zmienia podgląd; fill wymaga zmian w `_gen_slate`. |

---

## 12. Mapa plików

| Plik | Rola |
|---|---|
| `backend/app/services/ai_service.py` | PDF → tekst / obrazy skanów → Workers AI; cienka fasada `generate_resume` |
| `backend/app/services/cv_source_layout.py` | Dokładne aliasy nagłówków + geometria linii i grubość fontu PDF → osobne kolumny / sekcje bez fałszywych granic w zdaniach → pełne podsumowanie, zagnieżdżone skills, ochrona stanowiska i referencje |
| `backend/app/services/cloudflare_pricing.py` | Telemetria stawek Llama/Gemma/Qwen i sumowanie prób fallbacku; bez bramki kredytów asystenta |
| `backend/app/services/cv_data.py` | Normalizacja / walidacja profilu CV |
| `backend/app/services/cv_generator.py` | **Deterministyczny silnik layoutu** (ten dokument) |
| `backend/app/api/routes/ai.py` | HTTP: extract_cv, fill_template, draft bio |
| `backend/app/services/pdf_generator.py` | Pomiar wysokości textarea + eksport PDF |
| `backend/app/services/ai_assistant_service.py` | Asystent po wygenerowaniu (osobny tor AI) |
| `frontend/src/templates/*.js` | Statyczne próbki designu |
| `frontend/src/templates/index.js` | Katalog 14 szablonów (id muszą = `_GENERATORS`) |
| `backend/tests/test_cv_template_layouts.py` | Strażnik zachowania layoutu |

---

## 13. Podsumowanie jednym akapitem

CV STUDIO rozdziela odpowiedzialności celowo: **model językowy rozumie dokument i zwraca dane**, a **Python składa z tych danych gotowy, testowalny dokument canvas** według ręcznie zakodowanego designu szablonu. Dzięki temu ten sam profil można włożyć w Ledger, Tessera albo Nova bez ponownego „projektowania” przez AI, a każda zmiana layoutu jest code review + testem — nie loterią promptu.
