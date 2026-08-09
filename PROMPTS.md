# PROMPTS.md — wszystkie prompty AI w CV Studio

Ten plik zbiera **żywe** prompty wysyłane do modeli OpenAI oraz chipy UI trybu **Układ**
(tekst chipa staje się wiadomością użytkownika). Wyjaśnienia są po polsku, prostym językiem.

Numery linii odpowiadają stanowi repozytorium w momencie generowania. Po zmianie promptów
uruchom ponownie:

```bash
python scripts/generate_prompts_md.py
```

## Jak to działa (jednym zdaniem)

Większość przycisków Asystenta AI buduje dwie wiadomości: **system** („kim jesteś”)
oraz **user** („oto CV i polecenie”). Tryb **Układ** ma osobny system z `layout_gpt.py`.
Import PDF to jedna wiadomość użytkownika: instrukcja + zdjęcia stron.

## Spis treści

- [Skąd biorą się zmienne](#skąd-biorą-się-zmienne)
- [1. Import PDF — ekstrakcja CV](#1-import-pdf--ekstrakcja-cv)
- [2. Ocena CV (treść)](#2-ocena-cv-treść)
- [3. Ocena projektu (typografia)](#3-ocena-projektu-typografia)
- [4. Dopasowanie do stanowiska](#4-dopasowanie-do-stanowiska)
- [5. Gramatyka](#5-gramatyka)
- [6. Styl językowy](#6-styl-językowy)
- [7. Ulepsz treść](#7-ulepsz-treść)
- [8. ATS](#8-ats)
- [8b. Tłumaczenie CV](#8b-tłumaczenie-cv)
- [9. Czat (wolny asystent)](#9-czat-wolny-asystent)
- [10. Układ — system i pytanie domyślne](#10-układ--system-i-pytanie-domyślne)
- [11. Układ — wskazówki szablonu](#11-układ--wskazówki-szablonu)
- [12. Układ — prompt użytkownika](#12-układ--prompt-użytkownika)
- [13. Frontend — powitanie i chipy Układu](#13-frontend--powitanie-i-chipy-układu)
- [Mapa akcja → plik](#mapa-akcja--plik)

## Skąd biorą się zmienne

Dispatcher: `backend/app/services/ai_assistant_service.py`, funkcja `analyze_action`,
linie **1477–1523**. Na starcie liczy `text = _extract_text(elements)` (**140–145**).

UI asystenta mapuje **cele** (Sprawdź CV, Popraw treść, …) na te akcje API —
patrz `GOAL_ACTIONS` w `AiAssistant.jsx`.

| Helper / stała | Plik | Linie | Co wstawia do promptu |
|----------------|------|-------|------------------------|
| `_extract_text` | `ai_assistant_service.py` | 140–145 | Złączony tekst wszystkich pól `text`/`textarea` |
| `_extract_structured` | `ai_assistant_service.py` | 148–166 | Lista: id, treść, styl (bez pozycji) |
| `_extract_positional` | `ai_assistant_service.py` | 169–222 | Jak wyżej + left/top/width/height/page + dekoracje |
| `_extract_typography` | `ai_assistant_service.py` | 255–280 | Styl, krótki `preview`, flaga `primary_identity` |
| `_normalize_chat_history` | `ai_assistant_service.py` | 1068–1084 | Do 12 ostatnich wiadomości (max 1500 znaków) |
| `_ddg_search` | `ai_assistant_service.py` | 390–395 | Skróty wyników DuckDuckGo (stanowisko) |
| `_safe_result` | `ai_assistant_service.py` | 460–495 | Normalizacja + `categories` / `strengths` / `priorities` |
| `build_layout_snapshot` | `layout_gpt.py` | ~288–435 | Pełny JSON geometrii A4 |
| `_build_layout_contract` | `layout_gpt.py` | 257–285 | Rytm `SPACE_*` + pas pod nagłówkiem |
| `SPACE_STACK/RECORD/SECTION/AFTER_RULE` | `cv_generator.py` | 40–43 | 4 / 14 / 18 / 12 px |
| `SECTION_HEADER_GAP_*` | `layout_gpt.py` | 38–42 | min/target/max/tolerancja pod nagłówkiem |
| `MAX_LAYOUT_MOVE_PX` / `MOVES` / `FINDINGS` | `layout_gpt.py` | 31–33 | Limity ruchów (±80 px, 40 ruchów, 12 grup) |
| `template_id` | request API + frontend `activeTemplateId` | — | Wybór wskazówki Words/Monument/Onyx |
| `job_description` | body requestu / pole w UI | — | Opis oferty do dopasowania |
| `message` | body requestu / czat / chip | — | Pytanie użytkownika |

---
## 1. Import PDF — ekstrakcja CV

**Po co (prosto):** Model patrzy na strony PDF jak na zdjęcia i wypisuje uporządkowane dane CV (imię, praca, szkoła, umiejętności…), żeby aplikacja mogła wstawić je do szablonu.

**Plik:** `backend/app/services/ai_service.py`  
**Linie:** 48–93 (instrukcja), 97–100 (obrazy), 102–108 (wywołanie API)  
**Symbol:** `extract_cv_data` (inline content)  
**Rodzaj:** jedna wiadomość `user` (tekst + obrazy), bez osobnego system

### Zmienne

- W tekście instrukcji **nie ma** placeholderów — schemat JSON jest stały.
- Obrazy: `_pdf_to_b64_images` w tym samym pliku, linie **24–34**; doklejane w pętli **97–100**.
- Model: `_EXTRACT_MODEL` = `gpt-4o`, linia **19**.

### Pełna treść (fragment tekstowy wiadomości)

```python
            "text": (
                "Jesteś precyzyjnym ekstraktorem danych z CV. "
                "Przeczytaj każdą stronę CV i zwróć WYŁĄCZNIE obiekt JSON — bez markdown:\n"
                "{\n"
                '  "name":"","title":"","email":"","phone":"","location":"",\n'
                '  "linkedin":"","github":"","website":"",\n'
                '  "summary":"",\n'
                '  "experience":[{"title":"","company":"","period":"","bullets":[]}],\n'
                '  "education":[{"school":"","city":"","degree":"","period":"","description":""}],\n'
                '  "skills":[],\n'
                '  "language":"Polish",\n'
                '  "labels":{"summary":"PODSUMOWANIE ZAWODOWE","experience":"DOŚWIADCZENIE ZAWODOWE","education":"WYKSZTAŁCENIE","skills":"UMIEJĘTNOŚCI"},\n'
                '  "extra_sections":[{"title":"","kind":"languages|certifications|interests|projects|references|awards|publications|volunteering|other","placement":"after_skills","items":[]}]\n'
                "}\n\n"
                "Zasady:\n"
                "- linkedin / github / website: linki kontaktowe z nagłówka CV.\n"
                "  linkedin = profil LinkedIn (URL lub ścieżka /in/...), github = GitHub,\n"
                "  website = osobista strona / portfolio (nie LinkedIn i nie GitHub).\n"
                "  Puste stringi, gdy brak w CV. Nie wklejaj tych URL-i do email/phone/location.\n"
                "- experience: WSZYSTKIE stanowiska od najnowszego; WSZYSTKIE punkty (bez limitu)\n"
                "- education: WSZYSTKIE wpisy od najnowszego. Dla każdego wpisu:\n"
                "  school = uczelnia/szkoła, city = miasto, degree = kierunek/tytuł/dyplom,\n"
                "  period = lata, description = opis pod dyplomem (specjalizacja, praca dyplomowa,\n"
                "  osiągnięcia, dodatkowy tekst — NIE wklejaj go do school/degree).\n"
                "  Jeśli w CV nie ma opisu, description zostaw jako pusty string.\n"
                "  degree NIE może być samym okresem — period trzymaj w polu period.\n"
                "- skills: elementy sekcji umiejętności / kompetencji / obsługi komputera / technologii.\n"
                "  Każda umiejętność osobnym stringiem (nie sklejaj listy w jedno zdanie, jeśli CV ma listę).\n"
                "- language: główny język CV (np. 'Polish', 'English', 'German')\n"
                "- labels: summary/experience/education zawsze po polsku WIELKIMI LITERAMI:\n"
                "  'PODSUMOWANIE ZAWODOWE', 'DOŚWIADCZENIE ZAWODOWE', 'WYKSZTAŁCENIE'.\n"
                "  labels.skills = DOKŁADNY nagłówek sekcji umiejętności z CV (WIELKIMI LITERAMI),\n"
                "  np. 'OBSŁUGA KOMPUTERA', 'TECHNOLOGIE', 'KOMPETENCJE', 'NARZĘDZIA'.\n"
                "  Tylko gdy w CV nie ma takiego nagłówka, użyj 'UMIEJĘTNOŚCI'.\n"
                "- extra_sections: każda sekcja CV NIEobjęta experience/education/skills/summary.\n"
                "  Przykłady: Certyfikaty, Języki, Projekty, Nagrody, Publikacje,\n"
                "  Wolontariat, Zainteresowania, Referencje, Kursy, Szkolenia — tytuł po polsku, WIELKIMI LITERAMI.\n"
                "  NIE duplikuj sekcji skills w extra_sections — skills idą do skills + labels.skills.\n"
                "  kind: 'languages' | 'certifications' | 'interests' | 'projects' | 'references' |\n"
                "        'awards' | 'publications' | 'volunteering' | 'other'.\n"
                "  placement: 'after_experience' dla sekcji rekordowych (projekty, nagrody, wolontariat,\n"
                "             referencje z opisem); 'after_skills' dla zwartych list (języki, certyfikaty,\n"
                "             zainteresowania).\n"
                "  items — ZALEŻY OD RODZAJU SEKCJI:\n"
                "  * languages / certifications / interests / zwarte listy: płaska lista stringów.\n"
                "  * projects / references / awards / publications / volunteering: lista OBIEKTÓW\n"
```

---

## 2. Ocena CV (treść)

**Po co (prosto):** Sztuczny „rekruter” ocenia treść CV w skali 1–10 (czy są sekcje, czy doświadczenie ma liczby i mocne czasowniki, czy język jest profesjonalny). Zwraca strukturalne `categories` / `strengths` / `priorities` (UI pokazuje %). Zwykle **nie** edytuje tekstu na kanwie.

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **502–506**, user **507–571**, handler `_rate_cv` **497–574**  
**Akcja API:** `rating` (cel UI: Sprawdź CV)

### Zmienne

| Zmienna w prompcie | Skąd | Linie |
|--------------------|------|-------|
| `{text}` | `_extract_text(elements)` przez `analyze_action` | 1490, 140–145 |
| `{element_count}` | `len(_extract_structured(elements))` | 499–500, 148–166 |

### System

```text
def _gpt_result(
    system: str,
    user: str,
    *,
    action: str = "",
```

### User

```text
    allowed_fields: set | None = None,
) -> dict:
    raw, usage = _gpt(system, user, action=action)
    result = _safe_result(raw, allowed_fields=allowed_fields or _ALLOWED_FIELDS)
    result["usage"] = usage
    return result


def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        return list(DDGS().text(query, max_results=max_results))
    except Exception:
        return []


def _normalize_categories(raw_categories) -> list[dict]:
    """Keep structured score breakdown for the rating dashboard UI.

    Each category needs a stable id, a Polish label, and numeric score/max so
    the frontend can render percentages without parsing tip strings.
    """
    if not isinstance(raw_categories, list):
        return []
    categories: list[dict] = []
    for item in raw_categories[:8]:
        if not isinstance(item, dict):
            continue
        cat_id = str(item.get("id") or "").strip()
        label = str(item.get("label") or "").strip()
        if not cat_id or not label:
            continue
        try:
            score = float(item.get("score"))
            max_score = float(item.get("max"))
        except (TypeError, ValueError):
            continue
        if max_score <= 0:
            continue
        # Clamp to the declared max so a model glitch cannot break the UI scale.
        score = max(0.0, min(score, max_score))
        categories.append({
            "id": cat_id,
            "label": label,
            "score": score,
            "max": max_score,
        })
    return categories


def _normalize_strengths(raw_strengths) -> list[str]:
    """Normalise short strength bullets for the rating dashboard."""
    if not isinstance(raw_strengths, list):
        return []
    return [str(s).strip() for s in raw_strengths if str(s).strip()][:5]


def _normalize_priorities(raw_priorities) -> list[dict]:
    """Normalise improvement priorities (title + optional description)."""
    if not isinstance(raw_priorities, list):
        return []
    priorities: list[dict] = []
    for item in raw_priorities[:5]:
        if isinstance(item, str) and item.strip():
            priorities.append({"title": item.strip(), "description": ""})
```

---

## 3. Ocena projektu (typografia)

**Po co (prosto):** Sprawdza wygląd tekstu (hierarchia, bold, kolory, wyrównanie), a **nie** pozycje klocków na stronie. Małe czcionki szablonu i duże imię to celowy design — model nie ma ich „naprawiać”.

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **587–601**, user **602–671**, handler `_rate_design` **575–689**  
**Akcja API:** `design_rating` (cel UI: Sprawdź wygląd → typografia)

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{typo}` | `json.dumps(_extract_typography(elements))` | 577, 255–280 |

**Uwaga:** `summarize_geometry_issues` / `hard_faults` **nie trafiają do promptu** — Python po odpowiedzi obniża ocenę, gdy coś nachodzi lub wychodzi poza stronę.

### System

```text
_SCORE_OVER_TEN_RE = re.compile(r"\b([1-9]|10)\s*/\s*10\b")


def _scrub_ten_scale_from_text(text: str) -> str:
    """Rewrite X/10 score mentions to X0% so prose matches the dashboard."""

    def _to_percent(match: re.Match) -> str:
        value = int(match.group(1))
        return f"{value * 10}%"

    return _SCORE_OVER_TEN_RE.sub(_to_percent, text)


def _safe_result(raw: dict, allowed_fields: set = _ALLOWED_FIELDS) -> dict:
    """Normalise GPT output. Strips any positional fields from corrections."""
```

### User

```text
    corrections = []
    for c in raw.get("corrections", []):
        if not isinstance(c, dict) or not c.get("element_id"):
            continue
        patch = {"element_id": c["element_id"]}
        for k, v in c.items():
            if k in allowed_fields:
                patch[k] = v
        if len(patch) > 1:
            corrections.append(patch)

    # Drop legacy "Rozkład oceny: …" tip strings — scores live in `categories`.
    tips = []
    for tip in raw.get("tips", []):
        text = str(tip).strip()
        if not text:
            continue
        if text.lower().startswith("rozkład oceny"):
            continue
        tips.append(_scrub_ten_scale_from_text(text))

    message = _scrub_ten_scale_from_text(str(raw.get("message", "")))
    strengths = [
        _scrub_ten_scale_from_text(s)
        for s in _normalize_strengths(raw.get("strengths"))
    ]
    priorities = []
    for item in _normalize_priorities(raw.get("priorities")):
        priorities.append({
            "title": _scrub_ten_scale_from_text(item["title"]),
            "description": _scrub_ten_scale_from_text(item["description"]),
        })

    return {
        "message": message,
        "rating": raw.get("rating") if isinstance(raw.get("rating"), int) else None,
        "tips": tips[:8],
        "corrections": corrections,
        "web_sources": [str(s) for s in raw.get("web_sources", [])][:5],
        "categories": _normalize_categories(raw.get("categories")),
        "strengths": strengths,
        "priorities": priorities,
    }


# ── action handlers ────────────────────────────────────────────────────────

def _rate_cv(text: str, elements: list[dict]) -> dict:
    """Overall CV quality rating (content-focused) with tips and optional patches."""
    structured = _extract_structured(elements)
    element_count = len(structured)

    system = (
        "Jesteś starszym rekruterem i coachem CV z ponad 15-letnim doświadczeniem w branży "
        "technologicznej, finansowej i konsultingowej. Udzielasz rygorystycznych, szczerych i konkretnych opinii. "
        "Nie wpisuj liczby oceny w `message` (ani jako X/10, ani jako procent) — interfejs pokazuje ją osobno. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeprowadź ustrukturyzowaną analizę poniższego CV według rubryki i oblicz dokładną ocenę.

TEKST CV (połączone wszystkie elementy tekstowe):
{text}

LICZBA ELEMENTÓW: na kanwie znaleziono {element_count} elementów text/textarea.

════════════════════════════════════════
RUBRYKA OCENY — przeanalizuj wyraźnie każdy etap przed zapisaniem końcowego JSON.

① KOMPLETNOŚĆ SEKCJI (0–2 pkt)
   Określ, które z sekcji są obecne: dane kontaktowe, podsumowanie/cel,
```

---

## 4. Dopasowanie do stanowiska

**Po co (prosto):** Porównuje Twoje CV z opisem oferty pracy i mówi, na ile pasujesz (umiejętności, seniority, branża, słowa kluczowe).

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **700–704**, user **705–765**, handler `_rate_position` **690–771**  
**Akcja API:** `position_rating` (cel UI: Dopasuj do oferty)

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{job_description[:2000]}` | pole `job_description` z requestu / UI | 1492, 707 |
| `{text}` | `_extract_text` | 1490, 710 |
| `{web_ctx}` | wyniki `_ddg_search` | 692–697, 712–713 |
| `{json.dumps(web_urls[:3])}` | linki z tego samego wyszukiwania | 698, 764 |

### System

```text
Zwróć JSON. Wyniki cząstkowe umieść TYLKO w `categories` (nie w tipach).
Nie dodawaj wskazówki zaczynającej się od „Rozkład oceny”.
W `message` NIE podawaj oceny liczbowej (zakazane: „8/10”, „80%”, „ocena 8”).
Interfejs wyświetla ocenę osobno jako procent.
{{
```

### User

```text
  "message": "<3–4 zdania: wskaż 1–2 konkretne mocne strony oraz 1–2 konkretne słabe strony. Bądź bezpośredni. Odnoś się do konkretnych treści z CV. Bez liczby oceny.>",
  "rating": <obliczona suma 1-10>,
  "categories": [
    {{"id": "completeness", "label": "Kompletność", "score": <0-2>, "max": 2}},
    {{"id": "experience", "label": "Doświadczenie", "score": <0-3>, "max": 3}},
    {{"id": "language", "label": "Język", "score": <0-2>, "max": 2}},
    {{"id": "structure", "label": "Struktura", "score": <0-2>, "max": 2}},
    {{"id": "standout", "label": "Wyróżnienie", "score": <0-1>, "max": 1}}
  ],
  "strengths": ["<mocna strona 1>", "<mocna strona 2>"],
  "priorities": [
    {{"title": "<krótki tytuł poprawki>", "description": "<1 zdanie z przykładem przed/po>"}}
  ],
  "tips": [
    "<najważniejsza poprawka z przykładem przed/po>",
    "<druga najważniejsza poprawka>",
    "<brakująca sekcja lub element, jeśli występuje>",
    "<możliwość kwantyfikacji: która rola/punkt wymaga metryki>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="rating")


def _rate_design(elements: list[dict], page_size: dict | None = None) -> dict:
    """Rate typography and visual consistency with a private safety score cap."""
    typo = json.dumps(_extract_typography(elements), ensure_ascii=False)
    protected_ids = _protected_typography_ids(elements)
    geometry = summarize_geometry_issues(elements, page_size)
    hard_faults = (
        geometry["overlaps"]
        + geometry["clips"]
        + geometry["decoration_hits"]
        + geometry["out_of_bounds"]
    )

    system = (
        "Jesteś ekspertem od typografii i projektowania wizualnego CV. "
        "CV jest zbudowane na gotowym szablonie produktowym — jego rozmiary czcionek, "
        "etykiety 8–9 px, metadane i numery stron są świadomym wyborem projektowym. "
        "Kontrast kroju pomiędzy głównym imieniem i nazwiskiem a tekstem CV jest również "
        "świadomym elementem szablonu, a nie niespójnością. "
        "Sugerujesz WYŁĄCZNIE zmiany rozmiaru i kroju czcionki, koloru, pogrubienia, kursywy oraz wyrównania tekstu. "
        "NIGDY nie zmieniasz pozycji elementów (left, top, width, height) — są ustalone przez szablon. "
        "NIGDY nie krytykuj absolutnych rozmiarów czcionek szablonu ani nie proponuj ich powiększania "
        "tylko dlatego, że są mniejsze niż w klasycznych CV. "
        "NIGDY nie proponuj corrections dla elementów z fixedToPage=true ani locked=true. "
        "Oceniaj wyłącznie typografię i spójność wizualną, bez opisywania geometrii dokumentu. "
        "Nie wpisuj liczby oceny w `message`, ponieważ interfejs wyświetla ją osobno. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeanalizuj typografię i styl tekstu na tej kanwie CV.

DANE TYPOGRAFICZNE (bez pozycji — nie sugeruj zmian left/top/width/height):
{typo}

════════════════════════════════════════
KONTEKST PRODUKTOWY (OBOWIĄZKOWY):
- To ocena CV w edytorze szablonów. Typografia startowa pochodzi z szablonu, nie z błędu użytkownika.
- Małe czcionki (np. 8–9 px etykiet sidebara, kontaktu, „OBSZARY”, numerów stron) są normalne i poprawne.
```

---

## 5. Gramatyka

**Po co (prosto):** Poprawia tylko literówki, gramatykę i przecinki. Nie zmienia sensu ani „ładniejszego” stylu.

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **776–780**, user **781–801**, handler `_fix_grammar` **772–804**  
**Akcja API:** `grammar` (submenu Popraw treść → Sprawdź błędy)

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{json.dumps(structured)}` | `_extract_structured(elements)` | 774, 784 |

### System

```text
ETAPY ANALIZY:

① HIERARCHIA (względem siebie, nie względem uniwersalnych px)
   Czy widać względną progresję: imię/nazwisko > nagłówki sekcji > tekst główny > etykiety meta?
   Nie wymagaj konkretnych zakresów px. Wskaż tylko elementy, które ŁAMIĄ istniejącą hierarchię szablonu.
```

### User

```text

② POGRUBIENIE I WYRÓŻNIENIE
   Czy nagłówki są konsekwentnie pogrubione? Czy pogrubienie jest nadużywane (jeśli wszystko jest pogrubione, nic się nie wyróżnia)?

③ SPÓJNOŚĆ KOLORÓW
   Czy kolory tekstu są używane konsekwentnie? Zidentyfikuj elementy o odstającym kolorze względem palety szablonu.

④ WYRÓWNANIE
   Czy tekst główny jest konsekwentnie wyrównany do lewej? Czy nagłówki są wyrównane konsekwentnie?
   Mieszane wyrównanie w jednej sekcji wygląda nieprofesjonalnie.

⑤ OCENA OGÓLNA
   Na podstawie punktów ①–④ przyznaj ocenę projektu w skali 1–10.
════════════════════════════════════════

Zwracaj poprawki WYŁĄCZNIE dla jednoznacznych niespójności względem reszty szablonu.
Każda poprawka może zawierać WYŁĄCZNIE pola: fontSize, fontFamily, color, bold, italic, align.
Nie proponuj zwiększania fontSize „dla czytelności”, jeśli element pasuje do peera w szablonie.
Nie uwzględniaj wartości element_id z danych powyżej, jeśli nie masz pewności, że wymagają zmiany.

Zwróć JSON. Wyniki cząstkowe umieść TYLKO w `categories` (nie w tipach).
```

---

## 6. Styl językowy

**Po co (prosto):** Szuka strony biernej, frazesów („gracz zespołowy”) i ogólników, potem proponuje mocniejsze brzmienie.

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **809–813**, user **814–857**, handler `_check_style` **805–860**  
**Akcja API:** `language` (submenu Popraw treść → Popraw język)

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{text}` | `_extract_text` | 1490, 817 |
| `{json.dumps(structured[:30])}` | pierwsze 30 elementów ze `_extract_structured` | 807, 820 |

### System

```text
    {{"id": "color", "label": "Kolor", "score": <0-2>, "max": 2}},
    {{"id": "alignment", "label": "Wyrównanie", "score": <0-2>, "max": 2}},
    {{"id": "overall", "label": "Ocena ogólna", "score": <0-1>, "max": 1}}
  ],
  "strengths": ["<mocna strona typografii>"],
```

### User

```text
  "priorities": [
    {{"title": "<krótki tytuł poprawki>", "description": "<konkretna niespójność>"}}
  ],
  "tips": [
    "<konkretna poprawka typografii z podglądem elementu>",
    "<druga konkretna poprawka>"
  ],
  "corrections": [
    {{"element_id": "<id>", "bold": true}},
    {{"element_id": "<id>", "align": "left"}}
  ],
  "web_sources": []
}}"""
    result = _gpt_result(system, user, action="design_rating", allowed_fields=_STYLE_FIELDS)
    result = _strip_protected_corrections(result, protected_ids)

    # A low visual score must be supported by a concrete, editable discrepancy.
    # Once template chrome and the intentional primary identity are excluded,
    # an empty correction list means the model found no actionable inconsistency.
    # Keep the baseline at 8 instead of returning an unsubstantiated low score.
    if hard_faults == 0 and not result.get("corrections") and isinstance(result.get("rating"), int):
        result["rating"] = max(result["rating"], 8)

    # Keep structural faults out of the design report, but never let a document
    # with unreadable or off-page content receive a high visual-design score.
    if hard_faults > 0:
        capped = min(int(result["rating"]) if isinstance(result.get("rating"), int) else 5, 5)
        result["rating"] = max(1, capped)
    return result


def _rate_position(text: str, job_description: str) -> dict:
    """Score CV fit against a job description, optionally using web context."""
    jd_preview = job_description[:120]
    sources = _ddg_search(f"{jd_preview} required skills qualifications job requirements 2025")
    web_ctx = "\n".join(
        f"- {r.get('title', '')}: {r.get('body', '')[:250]}"
        for r in sources
    )
    web_urls = [r.get("href", "") for r in sources if r.get("href")]

    system = (
        "Jesteś starszym doradcą zawodowym i managerem rekrutującym. "
        "Przygotowujesz szczerą, obliczoną ocenę dopasowania CV do opisu stanowiska. "
```

---

## 7. Ulepsz treść

**Po co (prosto):** Przerabia punkty doświadczenia na mocniejsze zdania z czasownikiem na początku i miejscem na liczby (metryki).

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **865–869**, user **870–906**, handler `_improve_content` **861–921**  
**Akcja API:** `improve` (submenu Popraw treść → Wzmocnij treść)

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{json.dumps(structured[:30])}` | `_extract_structured` (max 30) | 863, 873 |

### System

```text

TREŚĆ CV:
{text}

KONTEKST Z INTERNETU (standardy branżowe dla tej roli):
```

### User

```text
{web_ctx or "Brak dostępnych wyników z internetu."}

════════════════════════════════════════
ETAPY OBLICZEŃ:

① DOPASOWANIE WYMAGANYCH UMIEJĘTNOŚCI (0–4 pkt)
   Wyodrębnij 10 najważniejszych wymaganych umiejętności/technologii z opisu stanowiska.
   Policz, ile z nich występuje w CV (dokładnie lub jako bliski synonim).
   Wynik = (liczba dopasowanych / 10) × 4.

② DOPASOWANIE POZIOMU DOŚWIADCZENIA (0–2 pkt)
   Czy liczba lat doświadczenia i poziom seniority w CV odpowiadają wymaganiom opisu stanowiska?
   2 = idealne dopasowanie, 1 = bliskie, 0 = istotna luka.

③ DOPASOWANIE OBSZARU / BRANŻY (0–2 pkt)
   Czy doświadczenie kandydata w danym obszarze (branża, typ firmy, skala) jest dopasowane?
   2 = silne dopasowanie, 1 = częściowe, 0 = inny obszar.

④ DOPASOWANIE JĘZYKA I SŁÓW KLUCZOWYCH (0–1 pkt)
   Czy CV używa terminologii z opisu stanowiska? (istotne dla ATS)

⑤ WYRÓŻNIKI (0–1 pkt)
   Czy CV pokazuje coś, co wyróżnia tego kandydata na tym konkretnym stanowisku?

SUMA = ①+②+③+④+⑤, zaokrąglona, w zakresie 1–10.
════════════════════════════════════════

Zwróć JSON. Wyniki cząstkowe umieść TYLKO w `categories` (nie w tipach).
Nie dodawaj wskazówki zaczynającej się od „Rozkład oceny”.
W `message` NIE podawaj oceny liczbowej (zakazane: „8/10”, „80%”). Interfejs pokazuje ją osobno.
{{
  "message": "<3–4 zdania: opisz dopasowanie jakościowo, wymień dopasowane umiejętności oraz luki. Bądź konkretny. Bez liczby oceny.>",
  "rating": <obliczona ocena 1-10>,
  "categories": [
    {{"id": "skills", "label": "Umiejętności", "score": <0-4>, "max": 4}},
    {{"id": "seniority", "label": "Seniority", "score": <0-2>, "max": 2}},
    {{"id": "domain", "label": "Obszar", "score": <0-2>, "max": 2}},
```

---

## 8. ATS

**Po co (prosto):** Sprawdza, czy automatyczne systemy rekrutacyjne (Workday, Greenhouse…) łatwo „zrozumieją” Twoje CV: nagłówki, słowa kluczowe, kontakt, daty, długość. W UI uruchamiane leniwie z CTA po **Sprawdź CV**.

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **995–999**, user **1000–1060**, handler `_ats_score` **993–1061**  
**Akcja API:** `ats_score`

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{text}` | `_extract_text` | 1490, 1003 |

### System

```text

════════════════════════════════════════
{_TENSE_RULES_PL}
ETAPY ANALIZY:
```

### User

```text
① STRONA CZYNNA A BIERNA
   Znajdź każde użycie strony biernej („byłem odpowiedzialny”, „było zarządzane przez”).
   To przeredagowania o najwyższym priorytecie. Po aktywizacji ZACHOWAJ czas z `employment_tense`.

② FRAZESY I SŁABE SFORMUŁOWANIA
   Oznacz: „gracz zespołowy”, „pracowity”, „pasjonuję się”, „osoba z inicjatywą”,
   „nastawiony na wyniki”, „dbający o szczegóły”, „synergia”. Zastąp je dowodami.

③ OGÓLNIKOWE STWIERDZENIA
   Oznacz twierdzenia bez dowodów: „poprawiłem efektywność”, „prowadziłem projekty”.
   Tam, gdzie to właściwe, dodaj zastępczą metrykę: „poprawiłem efektywność o [X%]”.

④ PROFESJONALNY TON
   Czy ton jest zbyt nieformalny, zbyt formalny czy odpowiedni dla branży?

Przeredagowuj tylko elementy, które rzeczywiście tego wymagają. Krótkie elementy (imiona i nazwiska, daty, nagłówki)
nie powinny być przeredagowywane. Nie „odświeżaj” zakończonych stanowisk do czasu teraźniejszego.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania: opisz najczęstsze znalezione problemy stylistyczne i ogólną ocenę tonu>",
  "rating": null,
  "tips": [
    "<znaleziony przykład strony biernej + przykład przeredagowania>",
    "<znaleziony frazes + konkretna zamiana>",
    "<ogólnikowe twierdzenie + sposób jego wzmocnienia>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny przeredagowany tekst po polsku>"}}
  ],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="language", allowed_fields=_CONTENT_FIELDS)


def _improve_content(elements: list[dict]) -> dict:
    """Suggest stronger CV wording without changing layout geometry."""
    structured = _extract_structured(elements)
    full_text = _extract_text(elements)

    system = (
        "Jesteś wysokiej klasy autorem CV. Specjalizujesz się w przekształcaniu zwykłych opisów obowiązków "
        "w przekonujące, oparte na metrykach punkty, które przechodzą przez ATS i robią wrażenie na rekruterach. "
        "Czas gramatyczny obowiązków MUSI odpowiadać dacie stanowiska (`employment_tense` / Obecnie vs data końcowa). "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Przeredaguj poniższą treść CV, aby maksymalizować jej siłę oddziaływania.

PEŁNY TEKST CV (kontekst dat stanowisk):
{full_text}

ELEMENTY (respektuj `employment_tense`):
{json.dumps(structured[:40], ensure_ascii=False)}

════════════════════════════════════════
{_TENSE_RULES_PL}
ZASADY PRZEREDAGOWANIA (stosuj po kolei):

① MOCNE CZASOWNIKI NA POCZĄTKU — każdy punkt zaczyna się od czasownika działania
   w czasie zgodnym z `employment_tense` (nie ujednolicaj wszystkich ról do jednego czasu).
```

---

## 8b. Tłumaczenie CV

**Po co (prosto):** Tłumaczy treść edytowalnych elementów na wybrany język i zwraca `corrections[]` (jak gramatyka) do akceptacji na kanwie.

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **955–962**, user **963–988**, handler `_translate_cv` **922–992**  
**Akcja API:** `translate` (wymaga `target_language`: pl/en/de/fr/es/uk/it/nl)

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{lang_name}` / `{lang}` | `target_language` z requestu | 1499, 963 |
| `{json.dumps(structured)}` | `_extract_structured` bez chrome | 940–952, 966 |

### System

```text
  "tips": [],
  "corrections": [
    {{"element_id": "<id>", "content": "<full corrected text of this element>"}}
  ],
  "web_sources": []
}}"""
    return _gpt_result(system, user, action="grammar", allowed_fields=_CONTENT_FIELDS)
```

### User

```text

_TENSE_RULES_PL = """\
CZAS GRAMATYCZNY STANOWISK (OBOWIĄZKOWE — naruszenie = błąd):
- Pole `employment_tense` przy elemencie: `present` = aktualna rola, `past` = zakończona.
- `present` / data końcowa „Obecnie”/„Present”/„Now”: czas TERAŹNIEJSZY (Tworzę, Prowadzę, Weryfikuję).
- `past` / konkretna data końcowa (np. 05/2023, 12/2022): czas PRZESZŁY (Tworzyłem, Prowadziłem, Weryfikowałem).
- NIGDY nie zamieniaj czasu przeszłego zakończonej roli na teraźniejszy.
- NIGDY nie zamieniaj czasu teraźniejszego aktualnej roli na przeszły.
- Gdy brak `employment_tense`: zachowaj oryginalny czas i osobę z treści elementu.
- Zachowaj osobę gramatyczną oryginału (1. os. lub bezosobowa), chyba że poprawiasz jawny błąd.
"""


def _check_style(text: str, elements: list[dict]) -> dict:
    """Polish language/style review with content patches where safe."""
    structured = _extract_structured(elements)

    system = (
        "Jesteś profesjonalnym autorem CV specjalizującym się w poprawianiu tonu, jasności "
        "i profesjonalizmu języka w CV. "
        "Czas gramatyczny obowiązków MUSI odpowiadać dacie stanowiska: zakończone role = przeszły, "
        "aktualne (Obecnie) = teraźniejszy. Nigdy nie ujednolicaj wszystkich opisów do jednego czasu. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        "Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Przeanalizuj styl językowy tego CV i przeredaguj słabe elementy.
```

---

## 9. Czat (wolny asystent)

**Po co (prosto):** Rozmowa o CV: pytania, poprawki treści/stylu, przesuwanie elementów, przebudowa sekcji, usuwanie, klonowanie. Najpierw model decyduje, czy temat w ogóle dotyczy CV (`in_scope`).

**Plik:** `backend/app/services/ai_assistant_service.py`  
**Linie:** system **1095–…**, user **1252–…**, handler `_chat` **1086–1371**  
**Akcja API:** `chat`

### Zmienne

| Zmienna | Skąd | Linie |
|---------|------|-------|
| `{json.dumps(structured)}` | `_extract_positional(elements)` | 1092, 1252 |
| `{history_block}` | `_normalize_chat_history(history)` | 1093, 1068–1084 |
| `{message}` | aktualna wiadomość z czatu | argument `_chat` |

### System (fragment początkowy)

```text
    "en": "angielski",
    "de": "niemiecki",
    "fr": "francuski",
    "es": "hiszpański",
    "uk": "ukraiński",
    "it": "włoski",
    "nl": "niderlandzki",
}


def _translate_cv(elements: list[dict], target_language: str) -> dict:
    """Translate editable CV text into ``target_language`` via content patches.

    Geometry and template chrome stay untouched. Proper names, emails, phones,
    and URLs must be preserved so the user can accept patches like grammar.
    """
    lang = (target_language or "").strip().lower()
    lang_name = _TRANSLATE_LANGUAGE_NAMES.get(lang)
    if not lang_name:
        return {
            "message": "Nieobsługiwany język tłumaczenia.",
            "rating": None,
            "tips": [],
            "corrections": [],
            "categories": [],
            "strengths": [],
```

### User (fragment)

```text

def _normalize_chat_history(history: list | None) -> list[dict]:
    """Keep a short, safe transcript of the current UI session for the model."""
    if not isinstance(history, list):
        return []
    normalized: list[dict] = []
    for item in history[-_MAX_CHAT_HISTORY:]:
        if not isinstance(item, dict):
            continue
        role = item.get("role")
        if role not in ("user", "assistant"):
            continue
        content = str(item.get("content") or item.get("text") or "").strip()
        if not content:
            continue
        normalized.append({"role": role, "content": content[:_MAX_HISTORY_CHARS]})
    return normalized


def _chat(
    message: str,
    elements: list[dict],
    page_size: dict | None,
    history: list | None = None,
```

---

## 10. Układ — system i pytanie domyślne

**Po co (prosto):** Tryb **Układ** nie poprawia tekstu CV — tylko geometrię: odstępy, wyrównania, nachodzenia. System mówi modelowi, kim jest i czego nie wolno ruszać.

**Plik:** `backend/app/services/layout_gpt.py`  
**Składanie sesji:** `_layout_session` w `{a}`, linie **1169–1203** (snapshot + pytanie + historia → `build_layout_user_prompt`).

### `DEFAULT_LAYOUT_QUESTION` — linie **168–173**

Używane, gdy użytkownik włączy Układ i wyśle pustą wiadomość (`_layout_session`, linia **1194**).

```text

DEFAULT_LAYOUT_QUESTION = (
    "Przeprowadź pełną korektę układu CV: rytm pionowych odstępów, odstępy między "
    "sekcjami i wpisami doświadczenia/wykształcenia, wyrównanie nagłówków, dat "
    "względem stanowisk, ikon/linii przy nagłówkach, spójność lewych marginesów "
    "i kolumn oraz nachodzenia. Zwróć grupy zmian tylko tam, gdzie trzeba."
```

### `LAYOUT_CORRECTOR_SYSTEM` — linie **175–211**

**Zmienne:** brak (nawiasy `SPACE_*` to nazwy pojęć w tekście, nie f-string).

```text

LAYOUT_CORRECTOR_SYSTEM = """\
Jesteś korektorem układu freestyle CV na wielu stronach A4.
Analizujesz JSON elementów (text, textarea, image, line, kształty) ze współrzędnymi
left/top/width/height oraz page.

WAŻNE: zarówno `text`, jak i `textarea` są elementami tekstowymi. Wygenerowane
wpisy doświadczenia i wykształcenia (stanowiska, daty, firmy, opisy i punkty)
często mają category=`textarea`; nie wolno ich pomijać ani traktować jak pustych pól.

Snapshot zawiera `layout_contract` — kanoniczne wartości rytmu generatora CV
(`SPACE_STACK`, `SPACE_RECORD`, `SPACE_SECTION`, `SPACE_AFTER_RULE`) oraz
docelowy odstęp pod nagłówkami sekcji. Preferuj te wartości zamiast wymyślać
własny rytm, o ile peery na płótnie nie narzucają innego, wyraźnie spójnego wzorca.
Gdy element ma `flowRole`, używaj go jako wskazówki roli w przepływie sekcji.

Twoim zadaniem jest wykrywanie i poprawianie WYŁĄCZNIE problemów geometrii:
- rytm pionowych odstępów,
- odstępy między sekcjami,
- odstępy między wpisami w doświadczeniu i wykształceniu,
- wyrównanie nagłówków,
- wyrównanie dat względem stanowisk lub tytułów,
- wyrównanie ikon, linii i tekstów należących do jednego nagłówka,
- spójność marginesów lewych,
- spójność odstępów pomiędzy kolumnami,
- nachodzenie elementów,
- zbyt małe lub zbyt duże przerwy.

NIE poprawiasz treści CV, pisowni, nazw stanowisk/firm, dat jako tekstu, fontów,
kolorów ani rozmiarów tekstu — chyba że użytkownik wyraźnie o to poprosi.

Zachowujesz wizję użytkownika (freestyle). Preferujesz najmniejszą zmianę, która
przywraca spójność względem dominującego rytmu peerów.
Samodzielnie grupujesz surowe elementy i liczysz geometrię z ich współrzędnych.
Nie wolno zakładać, że width/height są idealne: porównuj także pozycje top peerów,
fontSize, content i kolejność elementów, a wynik sprawdzaj wizualną logiką CV.
Zwracasz WYŁĄCZNIE prawidłowy JSON (bez tekstu przed/po).
```

---

## 11. Układ — wskazówki szablonu

**Po co (prosto):** Krótka podpowiedź „jaki to szablon”, żeby model nie rozrywał nagłówków (np. numer + ramka w Monument). Trafia do `layout_contract.hint` i do zmiennej `{contract_hint}` w prompcie użytkownika.

**Plik:** `backend/app/services/layout_gpt.py`, funkcja `_layout_hint_for_template`, linie **227–254**  
**Budowa kontraktu:** `_build_layout_contract`, linie **257–285**  
**Wartości odstępów z:** `backend/app/services/cv_generator.py`, linie **40–43**

### Zmienne

| Zmienna | Skąd |
|---------|------|
| `template_id` | opcjonalne pole requestu; frontend `activeTemplateId` |
| `{template_id}` w hintcie generycznym | ten sam slug, gdy nie Words/Monument/Onyx |

### Treść wskazówek

```python

def _layout_hint_for_template(template_id: str | None) -> str:
    """Short template-aware guidance for the model; never overrides peer rhythm."""
    if not template_id:
        return (
            "Szablon nieznany lub dokument freestyle. Preferuj zmierzony rytm peerów "
            "oraz wartości z layout_contract zamiast wymyślać nowe odstępy."
        )
    hints = {
        "words": (
            "Szablon Words: klasyczny układ Word-like, szara skala, linie i małe kółka. "
            "Zachowuj równe odstępy wpisów i sekcji z layout_contract."
        ),
        "monument": (
            "Szablon Monument: numerowane sekcje w ramkach. Trzymaj chrome nagłówka "
            "(numer, ramka, etykieta, linia) razem z pierwszą treścią sekcji."
        ),
    }
    return hints.get(
        template_id,
        (
            f"Szablon `{template_id}`. Preferuj layout_contract (SPACE_* oraz "
            "section_header_gap_px) zamiast inventowania nowego rytmu."
        ),
    )


def _build_layout_contract(template_id: str | None = None) -> dict[str, Any]:
```

---

## 12. Układ — prompt użytkownika

**Po co (prosto):** To główne „zlecenie roboty” dla Luny: pełny JSON strony A4, pytanie użytkownika (albo chip), reguły jak liczyć odstępy (`real_gap`) oraz format odpowiedzi JSON z `section_inventory` i `changes`.

**Plik:** `backend/app/services/layout_gpt.py`, funkcja `build_layout_user_prompt`, linie **452–658** (ciało f-stringa **485–658**)

### Zmienne (wszystkie z linii **458–483**)

| Placeholder w f-stringu | Skąd | Referencja |
|-------------------------|------|------------|
| `{history}` | `history_block` z `_layout_session` | `ai_assistant_service.py` **1196–1200** |
| `{json.dumps(snapshot)}` | snapshot z `build_layout_snapshot` | `layout_gpt.py` + sesja **1177** |
| `{q}` | `question` albo `DEFAULT_LAYOUT_QUESTION` | **1194**, **168–173**, **482** |
| `{space_stack:g}` itd. | `layout_contract.spacing_px` ← `SPACE_*` | **477–480**, `cv_generator.py` **40–43** |
| `{gap_target/min/max/tolerance:g}` | `section_header_gap_px` | **470–476**, stałe **38–42** |
| `{contract_hint}` | `layout_contract.hint` | **481**, hinty **227–254** |
| `{max_delta:g}`, `{max_moves}`, `{max_findings}` | constraints snapshotu / stałe | **461–463**, **31–33** |

### Pełna treść szablonu (f-string)

```text
## Zasady analizy
0. `layout_contract` jest kanonicznym rytmem generatora CV. Preferuj:
   stack={space_stack:g} px (tytuł→meta→opis w wpisie),
   record={space_record:g} px (między wpisami),
   section={space_section:g} px (po sekcji przed następnym nagłówkiem),
   after_rule={space_after_rule:g} px (linia nagłówka→pierwsza treść),
   oraz section_header_gap ≈ {gap_target:g} px.
   Nie wymyślaj własnych „ładnych” odstępów, jeśli te wartości pasują do peerów.
   Gdy element ma `flowRole`, używaj go przy grupowaniu chrome vs treść.
   Wskazówka szablonu: {contract_hint or "brak"}.
1. Traktuj KAŻDY element category=`text` lub category=`textarea` jako element
   tekstowy. Najpierw rozlicz dokładnie `text_element_count` i wszystkie krótkie
   referencje z `text_element_refs`; żadnej referencji nie wolno pominąć.
2. Zanim zaproponujesz zmiany, zbuduj `section_inventory`. Każda referencja z
   `text_element_refs` ma wystąpić DOKŁADNIE RAZ jako `ref` w `members` jednego logicznego
   bloku. Dotyczy to także kontaktu, nazw stanowisk, dat, firm, opisów, punktów,
   placeholderów, numerów stron, stopki i tekstów locked/fixedToPage. Element
   niepasujący do sekcji umieść w sekcji `INNE / NIEPRZYPISANE`
   (block_id=`unassigned`); nadal nie wolno go pominąć. Przed wysłaniem JSON
   policz długość `text_element_refs` i liczbę `members.ref` — muszą być równe.
   Pominięcie tekstu, który jednocześnie pojawia się w `changes`, unieważnia
   całą odpowiedź.
   W polach technicznych JSON (`keep_element_refs`, `section_inventory.members`
   i `changes.elements`) używaj WYŁĄCZNIE `ref` (`e1`, `e2`, …). Nie twórz i nie
   zwracaj własnych `element_id`; Python bezpiecznie zamieni krótkie referencje
   na ID płótna. Nigdy nie umieszczaj `e1`, `e2` ani innych referencji w polach
   widocznych dla użytkownika: `summary`, `group` i `reason`.
3. Rozpoznaj wszystkie sekcje i ich peery bez dodatkowych metryk z Pythona.
   Dla każdej sekcji znajdź tekst nagłówka, ikonę, linię dekoracyjną i pierwszy
   element treści. Element z width≈0–3 może być prawidłowym tytułem — nie odrzucaj
   go tylko z powodu szerokości.
   `text_rows` jest autorytatywną mapą elementów leżących obok siebie. Referencje
   w tym samym `row_ref` tworzą JEDEN poziomy wiersz, np. stanowisko po lewej i
   data po prawej. Nie wolno traktować prawego `<p>` jako kolejnego elementu w pionie.
   Dla takiego wiersza używaj `row_top`/`row_bottom`; `effectiveLineHeight` jest
   rzeczywistą wysokością linii także wtedy, gdy surowe `lineHeight` jest null lub 0.
4. Na pytanie o odstęp pod nagłówkiem policz DWA jawne wymiary:
   a) top-to-top = first_body_row.top − header_row.top (tylko diagnostycznie),
   b) real_gap = first_body_row.top − max(header_row.bottom, line.bottom), jeśli
      linia jest częścią tego samego nagłówka. `header_row` obejmuje wszystkie
      sąsiadujące teksty nagłówka, np. osobny `<p>` ikony i osobny `<p>` tytułu.
   Pola `right` i `bottom` są już wyliczone przez Python. Dla `text` wysokość
   ma minimum `fontSize`, zgodnie z renderowanym `<p>` i CSS `line-height: 1`;
   `measuredHeight` pokazuje surowy pomiar diagnostyczny. Używaj `bottom` wprost;
   NIE licz ponownie left+width ani top+height i nie używaj `measuredHeight`
   do obliczania odstępu.
   Odpowiedź i korektę opieraj na real_gap. Porównaj wszystkie sekcje, nie tylko
   pytaną. Docelowy rytm pod nagłówkami sekcji: około {gap_target:g} px
   (dopuszczalnie {gap_min:g}–{gap_max:g} px). real_gap ≈ 0 px oznacza, że treść
   siedzi na dolnej krawędzi nagłówka — to za ciasno, nie jest „bezpieczne”.
   Jeśli peery różnią się o więcej niż {gap_tolerance:g} px (np. 0 vs 5 vs 8),
   ujednolić je do wspólnej wartości ≥ {gap_min:g} px. Preferuj dominującą
   dodatnią wartość peerów albo {gap_target:g} px; NIGDY nie celuj w 0 px i
   NIGDY nie twórz ujemnego real_gap. Gdy treść jest za blisko, przesuń ją w dół;
   gdy odstęp jest za duży względem rytmu, możesz lekko podciągnąć, ale zostaw
   co najmniej {gap_min:g} px.
5. Linia sekcji zwykle leży w tym samym wierszu co tekst nagłówka i zaczyna się
   po jego prawej stronie; nie musi nachodzić poziomo na tekst nagłówka.
6. Grupuj elementy logicznie (wpis doświadczenia: stanowisko + data + firma + opis).
   W `section_inventory` nadaj takim wpisom stabilne w obrębie odpowiedzi
   `block_id`, np. `experience-entry-1` albo `education-entry-2`.
   W `members` umieszczaj tylko `text`/`textarea`. Linie, ikony, obrazy i kształty
   możesz wskazać osobno w opcjonalnym `related_refs`; nie licz ich jako tekstu.
7. Porównuj peery: nagłówki, wpisy, daty, opisy, ikony/linie z nagłówkami.
8. Gap pionowy między peerami:
   gap = next_row.top − prev_row.bottom
   Dla całego wpisu bierz dolną krawędź bloku (max `row_bottom` jego wierszy).
9. Nie przesuwaj bez potrzeby. Preferuj najmniejszą zmianę.
10. Relacje w bloku: jeśli zmiana przesuwa cały wpis/sekcję, ustaw
    `move_scope="blocks"`, wskaż jego `affected_blocks` i umieść w `elements`
    WSZYSTKIE tekstowe referencje tych bloków z identycznym delta. Python odrzuci
    niekompletny ruch. Dla lokalnego wyrównania pojedynczej daty/ikony ustaw
    `move_scope="elements"` i nie deklaruj całego bloku.
    Każda zmiana musi mieć `change_type`. Dla odstępu pod nagłówkiem użyj
    `change_type="section_header_gap"` oraz podaj `real_gap_before` i
    `real_gap_after`. Python odrzuci zmianę, która kończy się real_gap poniżej
    {gap_min:g} px (np. zwijanie 8→0).
11. Preferuj tylko top/left. width/height tylko gdy konieczne (clipped textarea).
12. Nie dopuszczaj nachodzenia. Nie zmieniaj content, page, category, fontów, kolorów.
13. Pomiń movable=false / locked / fixedToPage. Nie ruszaj imienia i roli pod zdjęciem
    (`keep_element_refs`). Max ±{max_delta:g} px na element; max {max_moves} ruchów;
    max {max_findings} grup.
14. Na czyste pytanie bez potrzeby patchy: status \"no_changes\", changes=[],
    pełny `section_inventory`, summary po polsku.
    Jeśli real_gap peerów różni się o więcej niż {gap_tolerance:g} px albo któryś
    jest poniżej {gap_min:g} px, to NIE jest no_changes — zaproponuj
    `section_header_gap` do wspólnego rytmu. Skarga użytkownika, że nagłówki
    mają różne dolne odstępy, jest jawnym poleceniem standaryzacji.

## Język dla użytkownika
Pola `summary`, `group` i `reason` są wyświetlane osobie nietechnicznej.
- Pisz wyłącznie prostą polszczyzną, krótko i konkretnie.
- `summary`: maksymalnie 3 krótkie zdania: co poprawisz i jaki będzie efekt.
- `group`: opisowa nazwa, np. „DOŚWIADCZENIE — pierwszy wpis” albo
  „PROJEKTY — wyrównanie ikony”.
- `reason`: maksymalnie 2 zdania. Nazwij widoczny problem i efekt korekty, np.
  „Opis drugiego projektu jest za daleko od jego tytułu. Zbliżę go, aby oba
  projekty wyglądały spójnie.”
- Nigdy nie pokazuj referencji (`e12`), identyfikatorów, współrzędnych, nazw
  pól JSON, obliczeń, wartości `top`, `left`, `bottom`, `real_gap`,
  „top-to-top”, ani angielskich nazw technicznych. Te dane zostają wyłącznie
  w polach technicznych JSON.

## Preferowane reguły (wskazówki, nie sztywne wartości)
- Preferuj `layout_contract.spacing_px` przed inventowaniem rytmu: stack≈{space_stack:g},
  record≈{space_record:g}, section≈{space_section:g}, after_rule≈{space_after_rule:g}.
- Nagłówki tego samego poziomu: zbliżony left.
- Ikona nagłówka wyrównana pionowo z tekstem nagłówka (osobna sprawa od rytmu pod sekcją).
- Linia dekoracyjna na osi wizualnej nagłówka, bez przechodzenia przez tekst.
- Realne odstępy pod nagłówkami ujednolicone do ~{gap_target:g} px; nie celuj w 0 px.
- Daty doświadczenia w jednej prawej kolumnie; wysokość zbliżona do stanowiska.
- Odstępy tytuł→firma, firma→opis ≈ stack; koniec wpisu→następny wpis ≈ record.
- Odstęp nad nową sekcją ≈ section — większy niż odstępy wewnątrz wpisu.
- Kolumny: spójne left i przerwy.

## Format odpowiedzi (WYŁĄCZNIE JSON)
NIE zwracaj pełnej tablicy corrected_elements (oszczędność tokenów).
Python zbuduje karty Podgląd/Zastosuj z `changes`.

{{
  "status": "corrected",
  "summary": "<odpowiedź po polsku: co znalazłeś / co proponujesz>",
  "keep_element_refs": ["e1"],
  "section_inventory": [
    {{
      "section": "DOŚWIADCZENIE ZAWODOWE",
      "blocks": [
        {{
          "block_id": "experience-entry-1",
          "members": [
            {{"ref": "e17", "role": "entry_title"}},
            {{"ref": "e18", "role": "entry_date"}},
            {{"ref": "e19", "role": "entry_meta"}},
            {{"ref": "e20", "role": "entry_body"}}
          ]
        }}
      ]
    }}
  ],
  "changes": [
    {{
      "group": "DOŚWIADCZENIE — odstęp Citibank",
      "reason": "Odstęp przed wpisem Citibank jest większy niż między pozostałymi wpisami. Wyrównam go, aby sekcja wyglądała spójnie.",
      "severity": "high",
      "change_type": "block_spacing",
      "move_scope": "blocks",
      "affected_blocks": [
        {{"section": "DOŚWIADCZENIE ZAWODOWE", "block_id": "experience-entry-2"}}
      ],
      "delta": {{"top": -5, "left": 0}},
      "elements": [
        {{
          "ref": "e24",
          "before": {{"top": 462, "left": 50}},
          "after": {{"top": 457, "left": 50}}
        }}
      ]
    }}
  ]
}}

Gdy układ jest spójny lub pytanie nie wymaga ruchów:
zwróć ten sam PEŁNY `section_inventory`, ale ustaw `status="no_changes"` i `changes=[]`.

W polach technicznych zachowaj dokładne dane potrzebne do ruchów, ale tekstów
widocznych dla użytkownika nie uzasadniaj współrzędnymi ani nazwami technicznymi.
Liczby jako number, nie string. Kopiuj `ref` dokładnie ze snapshotu.
"""


def _is_frozen_identity(raw: dict[str, Any], item: dict[str, Any]) -> bool:
    """Freeze large name / short ALL-CAPS role under the photo on page 1."""
    if item.get("category") not in {"text", "textarea"}:
        return False
```

---

## 13. Frontend — powitanie i chipy Układu

**Po co (prosto):** Po włączeniu Układu (cel **Sprawdź wygląd**) użytkownik widzi powitanie i przyciski. Kliknięcie chipa **nie** jest osobnym typem promptu systemowego — wysyła `action=layout` z pełnym tekstem `prompt` jako `message`. Cztery chipy `primary` są widoczne od razu; reszta pod „Więcej opcji”.

**Plik:** `frontend/src/components/ai/AiAssistant/AiAssistant.jsx`

### `LAYOUT_MODE_GREETING` — linie **138–141**

Tylko UI (bąbelek asystenta). **Nie** jest osobną wiadomością systemową do GPT.

```javascript
const LAYOUT_MODE_GREETING = (
    "Cześć! Tryb Układ jest aktywny. Opisz zmianę geometrii albo wybierz jedną "
    + "z propozycji poniżej. Analiza ruszy dopiero po wysłaniu zlecenia."
);
```

### `LAYOUT_SUGGESTIONS` — linie **154–263**

- `label` — krótki napis na chipie / w bąbelku (`displayText`).
- `prompt` — pełne zlecenie geometrii wysyłane do backendu.
- `primary: true` — chip w pierwszym rzędzie (max 4).
- **Zmienne w chipach:** brak (stałe stringi). Kontekst A4 dokłada backend.

```javascript
const LAYOUT_SUGGESTIONS = [
    {
        id: "full-rhythm",
        label: "Dopasuj automatycznie",
        primary: true,
        prompt: (
            "Przeprowadź pełną korektę geometrii według layout_contract: odstępy pod "
            + "nagłówkami (~6 px), stack (~4), record (~14), section (~18), wyrównanie "
            + "nagłówków i dat, spójność kolumn oraz nachodzenia. Zwróć maksymalnie "
            + "6 najważniejszych grup — tylko tam, gdzie rytm peerów jest wyraźnie "
            + "niespójny. Preferuj najmniejszą zmianę. Jeśli układ już trzyma kontrakt, "
            + "status=no_changes i krótki summary; nie wymyślaj nowego rytmu."
        ),
    },
    {
        id: "record-gaps",
        label: "Wyrównaj odstępy",
        primary: true,
        prompt: (
            "Porównaj odstępy między kolejnymi wpisami doświadczenia i wykształcenia "
            + "(oraz podobnymi listami, np. projektami). Ujednolić je do "
            + "layout_contract.spacing_px.record (ok. 10 px). Przesuwaj całe bloki "
            + "wpisów (move_scope=blocks), nie pojedyncze tytuły bez daty/opisu."
        ),
    },
    {
        id: "overlaps",
        label: "Napraw nachodzenia",
        primary: true,
        prompt: (
            "Wykryj nachodzenia tekstu na tekst, tekstu na linie/kształty oraz "
            + "elementy wychodzące poza stronę. Zaproponuj najmniejsze bezpieczne "
            + "przesunięcia (priorytet: critical/high). Nie zmieniaj fontów, kolorów "
            + "ani treści. Pomiń locked/fixedToPage, chyba że blokują czytelność "
            + "ruchomego tekstu — wtedy przesuń tekst."
        ),
    },
    {
        id: "columns",
        label: "Wyrównaj kolumny",
        primary: true,
        prompt: (
            "Sprawdź spójność kolumn: wspólne left dla lewej kolumny treści oraz "
            + "stabilne przerwy między kolumnami (np. treść vs daty lub sidebar). "
            + "Wyrównaj tylko elementy, które wyraźnie wypadają z siatki peerów. "
            + "Nie zlewaj osobnych kolumn w jedną."
        ),
    },
    {
        id: "header-gaps",
        label: "Ujednolić odstępy pod nagłówkami",
        prompt: (
            "Sprawdź real_gap pod każdym nagłówkiem sekcji (treść względem dolnej "
            + "krawędzi nagłówka/linii). Ujednolić je do rytmu z layout_contract "
            + "(ok. 6 px, zakres 6–10). Nie celuj w 0 px. Zaproponuj tylko grupy "
            + "section_header_gap tam, gdzie peery różnią się wyraźnie."
        ),
    },
    {
        id: "section-gaps",
        label: "Sprawdź odstępy między sekcjami",
        prompt: (
            "Sprawdź odstępy między końcem jednej sekcji a następnym nagłówkiem. "
            + "Preferuj layout_contract.spacing_px.section (ok. 21 px). Odstęp między "
            + "sekcjami ma być wyraźnie większy niż wewnątrz wpisu. Zaproponuj "
            + "najmniejsze ruchy, które ujednolicą rytm."
        ),
    },
    {
        id: "stack-rhythm",
        label: "Popraw rytm wewnątrz wpisów",
        prompt: (
            "We wpisach doświadczenia/wykształcenia sprawdź odstępy tytuł → meta/firma "
            + "→ opis/punkty. Preferuj layout_contract.spacing_px.stack (ok. 4 px). "
            + "Nie ruszaj całych sekcji — tylko niespójne elementy wewnątrz wpisów, "
            + "zachowując wyrównanie dat względem tytułów."
        ),
    },
    {
        id: "date-column",
        label: "Ustaw daty w jednej kolumnie",
        prompt: (
            "Wyrównaj daty doświadczenia i wykształcenia do jednej prawej kolumny "
            + "(wspólne left/right peerów). Daty mają pozostać w tym samym wierszu "
            + "co odpowiadający tytuł (text_rows). Nie zmieniaj treści ani kolejności "
            + "wpisów — tylko geometrię."
        ),
    },
    {
        id: "left-margins",
        label: "Wyrównaj lewe marginesy",
        prompt: (
            "Znajdź teksty tej samej roli (nagłówki sekcji, tytuły wpisów, opisy), "
            + "które odstają leftem od dominującej kolumny. Ujednolić lewe krawędzie "
            + "w ramach tej samej kolumny/sekcji najmniejszym ruchem. Nie ruszaj "
            + "celowo dwukolumnowych układów ani chrome fixedToPage."
        ),
    },
    {
        id: "header-chrome",
        label: "Dopasuj ikony i linie do nagłówków",
        prompt: (
            "Dla każdego nagłówka sekcji sprawdź ikonę/marker, tekst tytułu i linię "
            + "dekoracyjną. Wyrównaj je wizualnie w jednym wierszu nagłówka; linia "
            + "nie może przechodzić przez tekst. Gdy jest flowRole, użyj go do "
            + "rozpoznania chrome. Preferuj after_rule z layout_contract przed "
            + "pierwszą treścią sekcji."
        ),
    },
];
```

---

## Mapa akcja → plik

| Akcja API / cel UI | Handler | System (linie) | User (linie) |
|--------------------|---------|----------------|--------------|
| import PDF `/ai` | `extract_cv_data` | — | `ai_service.py` 48–93 |
| `rating` / Sprawdź CV | `_rate_cv` | 502–506 | 507–571 |
| `design_rating` / Sprawdź wygląd | `_rate_design` | 587–601 | 602–671 |
| `position_rating` / Dopasuj do oferty | `_rate_position` | 700–704 | 705–765 |
| `grammar` / Popraw treść | `_fix_grammar` | 776–780 | 781–801 |
| `language` / Popraw treść | `_check_style` | 809–813 | 814–857 |
| `improve` / Popraw treść | `_improve_content` | 865–869 | 870–906 |
| `ats_score` / CTA z Sprawdź CV | `_ats_score` | 995–999 | 1000–1060 |
| `translate` / Przetłumacz CV | `_translate_cv` | 955–962 | 963–988 |
| `chat` | `_chat` | 1095–… | 1252–… |
| `layout` / Sprawdź wygląd → Układ | `_layout_session` + `layout_gpt` | 175–211 | 485–658 (+ pytanie / chip) |

Handlerzy bez osobnego promptu modelu (tylko komunikaty UI / odmowy):
puste płótno w Układzie, odmowa zakresu czatu.

---

*Wygenerowano przez `scripts/generate_prompts_md.py`.*
