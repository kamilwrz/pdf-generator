"""Generate PROMPTS.md from live source line ranges.

Usage (from repo root):
    python scripts/generate_prompts_md.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# NOTE: the tracked reference file lives at `docs/PROMPTS.md` (it was moved
# there from the repo root in an earlier commit; see `git log --follow`).
# Keep this constant in sync with `git ls-files | grep -i prompts` — writing
# to the old root path would silently create an untracked duplicate.
OUT = ROOT / "docs" / "PROMPTS.md"


def sl(rel: str, start: int, end: int) -> str:
    lines = (ROOT / rel).read_text(encoding="utf-8").splitlines()
    return "\n".join(lines[start - 1 : end])


def code(body: str, lang: str = "text") -> str:
    return f"```{lang}\n{body.rstrip()}\n```\n"


def main() -> None:
    a = "backend/app/services/ai_assistant_service.py"
    g = "backend/app/services/layout_gpt.py"
    e = "backend/app/services/ai_service.py"
    f = "frontend/src/components/ai/AiAssistant/AiAssistant.jsx"
    # Spacing constants used to live in `cv_generator.py` directly; that module
    # is now a re-export facade and the real definitions live in
    # `cv_generator_primitives.py`. Point the doc at the actual definition site.
    cg = "backend/app/services/cv_generator_primitives.py"

    parts: list[str] = []

    parts.append(
        """# PROMPTS.md — wszystkie prompty AI w CV Studio

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
Import PDF to jedna wiadomość użytkownika: instrukcja + zdjęcia stron. Cztery akcje treści
(gramatyka, styl, ulepszenie, skracanie) dodatkowo wykrywają język CV i wymuszają go w
`content` poprawek — patrz sekcja o wielojęzycznych korektach poniżej.

## Wielojęzyczne korekty treści (gramatyka / styl / ulepsz / skróć)

Cztery akcje edytujące treść (`grammar`, `language`, `improve`, `shorten`) nie zwracają już
poprawek zawsze po polsku. Dyspozytor `analyze_action` (**2311–2401**) najpierw ustala
`resolved_language`:

1. Jeśli request niesie `cv_language` z listy `_SUPPORTED_LANGS` (**279**:
   `pl/en/de/fr/es/uk/it/nl`), używa go wprost (jawny override z selektora UI).
2. W przeciwnym razie wykrywa język automatycznie funkcją `_detect_cv_language`
   (**383–413**), która dzieli elementy na nagłówki i treść (`_split_headers_and_body`,
   **313–341**) i liczy sygnały językowe osobno dla obu grup. Gdy nagłówki i treść są w
   różnych językach (dokument dwujęzyczny), **wygrywa język treści** — to on trafia do
   `code`, bo to właśnie treść przepisują te akcje; `is_mixed` tylko informuje ocenę CV
   o niespójności nagłówków.
3. Wybrany kod trafia do każdego handlera jako `language_code` i jest echowany w
   odpowiedzi jako `cv_language`, żeby selektor w UI pokazywał to, co faktycznie użyto.

Sam prompt system dostaje dyrektywę z `_content_language_directive` (**1705–1723**): pole
`content` w poprawkach ma być w języku CV, natomiast `message`/`tips`/`priorities` **zawsze**
zostają po polsku (aplikacja obsługuje polski rynek, więc rady muszą być zrozumiałe niezależnie
od języka samego CV). Reguły czasu gramatycznego dla obowiązków (`employment_tense`) wybiera
`_tense_rules_for` (**1696–1702**): dla polskiego zwraca wariant z przykładowymi czasownikami
(`_TENSE_RULES_PL`), dla pozostałych języków — neutralny wariant bez polskich czasowników
(`_TENSE_RULES_NEUTRAL`), żeby model nie „ześlizgiwał się” w polski przy przepisywaniu CV
w innym języku.

Na poziomie API opcjonalny override żyje jako `cv_language` w `AssistantRequest` i jest
echowany w `AssistantResponse` (`backend/app/api/routes/ai_assistant.py`, pola **59–61** i
**110–111**); nieobsługiwana wartość kończy się błędem 400 (**151–159**). Frontend ma osobny
selektor „Język CV” (domyślnie „Auto”) w podpanelu Popraw treść
(`AiAssistant.jsx`, **1767–1779**), który wysyła `cv_language` tylko dla akcji treści
(**1397–1422**) i synchronizuje się z tym, co faktycznie odpowie backend (**1438–1440**).

## Spis treści

- [Skąd biorą się zmienne](#skąd-biorą-się-zmienne)
- [1. Import PDF — ekstrakcja CV](#1-import-pdf--ekstrakcja-cv)
- [2. Ocena CV (treść)](#2-ocena-cv-treść)
- [3. Ocena projektu (typografia)](#3-ocena-projektu-typografia)
- [4. Dopasowanie do stanowiska](#4-dopasowanie-do-stanowiska)
- [5. Gramatyka](#5-gramatyka)
- [6. Styl językowy](#6-styl-językowy)
- [7. Ulepsz treść](#7-ulepsz-treść)
- [7b. Skróć treść](#7b-skróć-treść)
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
linie **2311–2401**. Na starcie liczy `text = _extract_text(elements)` (funkcja: **663–668**),
potem ustala `resolved_language` (patrz sekcja o wielojęzycznych korektach powyżej).

UI asystenta mapuje **cele** (Sprawdź CV, Popraw treść, …) na te akcje API —
patrz `GOAL_ACTIONS` w `AiAssistant.jsx`.

| Helper / stała | Plik | Linie | Co wstawia do promptu |
|----------------|------|-------|------------------------|
| `_extract_text` | `ai_assistant_service.py` | 663–668 | Złączony tekst wszystkich pól `text`/`textarea` |
| `_extract_structured` | `ai_assistant_service.py` | 716–746 | Lista: id, treść, styl, inline `runs`, `employment_tense` (bez pozycji) |
| `_extract_positional` | `ai_assistant_service.py` | 749–804 | Jak wyżej + left/top/width/height/page + dekoracje |
| `_extract_typography` | `ai_assistant_service.py` | 837–868 | Styl, krótki `preview`, flaga `primary_identity` |
| `_normalize_chat_history` | `ai_assistant_service.py` | 1902–1917 | Do 12 ostatnich wiadomości (max 1500 znaków) |
| `_ddg_search` | `ai_assistant_service.py` | 978–982 | Skróty wyników DuckDuckGo (stanowisko) |
| `_safe_result` | `ai_assistant_service.py` | 1063–1107 | Normalizacja + `categories` / `strengths` / `priorities` |
| `_detect_cv_language` | `ai_assistant_service.py` | 383–413 | Wykryty język CV: `code`/`confidence`/`body_lang`/`header_lang`/`is_mixed` |
| `_content_language_directive` | `ai_assistant_service.py` | 1705–1723 | Dyrektywa systemowa: `content` w języku CV, rady zawsze po polsku |
| `_tense_rules_for` | `ai_assistant_service.py` | 1696–1702 | Reguły czasu obowiązków (polski z czasownikami vs neutralny) |
| `build_layout_snapshot` | `layout_gpt.py` | ~429–440 | Pełny JSON geometrii A4 |
| `_build_layout_contract` | `layout_gpt.py` | 251–276 | Rytm `SPACE_*` + pas pod nagłówkiem |
| `SPACE_STACK/RECORD/SECTION/AFTER_RULE` | `cv_generator_primitives.py` | 43–46 | 4 / 10 / 21 / 8 px |
| `SECTION_HEADER_GAP_*` | `layout_gpt.py` | 39–43 | min/target/max/tolerancja pod nagłówkiem |
| `MAX_LAYOUT_MOVE_PX` / `MOVES` / `FINDINGS` | `layout_gpt.py` | 32–34 | Limity ruchów (±80 px, 40 ruchów, 12 grup) |
| `template_id` | request API + frontend `activeTemplateId` | — | Wybór wskazówki Monument / generycznej |
| `job_description` | body requestu / pole w UI | — | Opis oferty do dopasowania |
| `message` | body requestu / czat / chip | — | Pytanie użytkownika |
| `cv_language` | opcjonalne pole requestu / selektor „Język CV” w UI | — | Override auto-detekcji dla akcji treści; echo w odpowiedzi |

---
"""
    )

    # 1 extract
    parts.append("## 1. Import PDF — ekstrakcja CV\n\n")
    parts.append(
        "**Po co (prosto):** Model patrzy na strony PDF jak na zdjęcia i wypisuje "
        "uporządkowane dane CV (imię, praca, szkoła, umiejętności…), żeby aplikacja "
        "mogła wstawić je do szablonu.\n\n"
        f"**Plik:** `{e}`  \n"
        "**Linie:** 48–118 (instrukcja), 121–124 (obrazy), 126–135 (wywołanie API)  \n"
        "**Symbol:** `extract_cv_data` (inline content)  \n"
        "**Rodzaj:** jedna wiadomość `user` (tekst + obrazy), bez osobnego system\n\n"
        "### Zmienne\n\n"
        "- W tekście instrukcji **nie ma** placeholderów — schemat JSON jest stały.\n"
        "- Obrazy: `_pdf_to_b64_images` w tym samym pliku, linie **24–34**; "
        "doklejane w pętli **121–124**.\n"
        "- Model: `_EXTRACT_MODEL` = `gpt-4o`, linia **19**.\n\n"
        "### Pełna treść (fragment tekstowy wiadomości)\n\n"
    )
    parts.append(code(sl(e, 48, 118), "python"))

    # 2 rating
    parts.append("\n---\n\n## 2. Ocena CV (treść)\n\n")
    parts.append(
        "**Po co (prosto):** Sztuczny „rekruter” ocenia treść CV w skali 1–10 "
        "(czy są sekcje, czy doświadczenie ma liczby i mocne czasowniki, czy język "
        "jest profesjonalny). Zwraca strukturalne `categories` / `strengths` / "
        "`priorities` (UI pokazuje %). Zwykle **nie** edytuje tekstu na kanwie i "
        "zawsze odpowiada po polsku (ocena nie zależy od `cv_language`).\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1119–1126**, user **1127–1200**, handler `_rate_cv` **1112–1202**  \n"
        "**Akcja API:** `rating` (cel UI: Sprawdź CV)\n\n"
        "### Zmienne\n\n"
        "| Zmienna w prompcie | Skąd | Linie |\n"
        "|--------------------|------|-------|\n"
        "| `{text}` | `_extract_text(elements)` przez `analyze_action` | 2336, 663–668 |\n"
        "| `{element_count}` | `len(_extract_structured(elements))` | 1114–1115, 716–746 |\n"
        "| `{mix_block}` | `_language_mix_prompt_block(_detect_language_mix(elements))` | 1116–1117 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1119, 1126)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1127, 1200)))

    # 3 design
    parts.append("\n---\n\n## 3. Ocena projektu (typografia)\n\n")
    parts.append(
        "**Po co (prosto):** Sprawdza wygląd tekstu (hierarchia, bold, kolory, "
        "wyrównanie), a **nie** pozycje klocków na stronie. Małe czcionki szablonu "
        "i duże imię to celowy design — model nie ma ich „naprawiać”.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1216–1230**, user **1231–1301**, handler `_rate_design` **1205–1318**  \n"
        "**Akcja API:** `design_rating` (cel UI: Sprawdź wygląd → typografia)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{typo}` | `json.dumps(_extract_typography(elements))` | 1213, 837–868 |\n\n"
        "**Uwaga:** ocena Projekt dotyczy tylko typografii — nachodzenia / geometria nie "
        "obniżają już wyniku (to domena Układu).\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1216, 1230)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1231, 1301)))

    # 4 position
    parts.append("\n---\n\n## 4. Dopasowanie do stanowiska\n\n")
    parts.append(
        "**Po co (prosto):** Porównuje Twoje CV z opisem oferty pracy i mówi, "
        "na ile pasujesz (umiejętności, seniority, branża, słowa kluczowe).\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1331–1336**, user **1337–1398**, handler `_rate_position` **1321–1402**  \n"
        "**Akcja API:** `position_rating` (cel UI: Dopasuj do oferty)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{job_description[:2000]}` | pole `job_description` z requestu / UI | 2315, 1340 |\n"
        "| `{text}` | `_extract_text` | 2336, 1343 |\n"
        "| `{web_ctx}` | wyniki `_ddg_search` | 1324–1328, 1345–1346 |\n"
        "| `{json.dumps(web_urls[:3])}` | linki z tego samego wyszukiwania | 1329, 1397 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1331, 1336)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1337, 1398)))

    # 5 grammar
    parts.append("\n---\n\n## 5. Gramatyka\n\n")
    parts.append(
        "**Po co (prosto):** Poprawia tylko literówki, gramatykę i przecinki w języku "
        "CV. Nie zmienia sensu ani „ładniejszego” stylu, i nie tłumaczy treść na inny "
        "język.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1414–1420**, user **1421–1442**, handler `_fix_grammar` **1405–1443**  \n"
        "**Akcja API:** `grammar` (submenu Popraw treść → Sprawdź błędy)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{json.dumps(structured)}` | `_extract_structured(elements)` | 1412, 1424 |\n"
        "| dyrektywa językowa w system | `_content_language_directive(language_code)` | 1419, funkcja **1705–1723** |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1414, 1420)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1421, 1442)))

    # 6 language
    parts.append("\n---\n\n## 6. Styl językowy\n\n")
    parts.append(
        "**Po co (prosto):** Szuka strony biernej, frazesów („gracz zespołowy”) "
        "i ogólników, potem proponuje mocniejsze brzmienie — w języku CV, z zachowaniem "
        "czasu gramatycznego obowiązków.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1467–1476**, user **1477–1528**, handler `_check_style` **1458–1536**  \n"
        "**Akcja API:** `language` (submenu Popraw treść → Popraw język)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{text}` | `_extract_text` | 2336, 1480 |\n"
        "| `{json.dumps(structured[:40])}` | pierwsze 40 elementów ze `_extract_structured` | 1463, 1483 |\n"
        "| `{mix_block}` | `_language_mix_prompt_block(_detect_language_mix(elements))` | 1464–1465, 1484 |\n"
        "| dyrektywa językowa w system | `_content_language_directive(language_code)` | 1475, funkcja **1705–1723** |\n"
        "| `{_tense_rules_for(language_code)}` | reguły czasu wg języka CV | 1486, funkcja **1696–1702** |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1467, 1476)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1477, 1528)))

    # 7 improve
    parts.append("\n---\n\n## 7. Ulepsz treść\n\n")
    parts.append(
        "**Po co (prosto):** Przerabia punkty doświadczenia na mocniejsze zdania "
        "z czasownikiem na początku i miejscem na liczby (metryki), zachowując język "
        "i czas gramatyczny oryginału.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1549–1556**, user **1557–1603**, handler `_improve_content` **1539–1604**  \n"
        "**Akcja API:** `improve` (submenu Popraw treść → Wzmocnij treść)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{json.dumps(structured[:40])}` | `_extract_structured` (max 40) | 1544, 1563 |\n"
        "| `{full_text}` | `_extract_text` | 1545, 1560 |\n"
        "| `{mix_block}` | `_language_mix_prompt_block` | 1546–1547, 1564 |\n"
        "| dyrektywa językowa w system | `_content_language_directive(language_code)` | 1555, funkcja **1705–1723** |\n"
        "| `{_tense_rules_for(language_code)}` | reguły czasu wg języka CV | 1566, funkcja **1696–1702** |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1549, 1556)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1557, 1603)))

    # 7b shorten
    parts.append("\n---\n\n## 7b. Skróć treść\n\n")
    parts.append(
        "**Po co (prosto):** Gdy CV jest zbyt długie, skraca, łączy lub usuwa najmniej "
        "istotne fragmenty — bez wymyślania nowych faktów i bez zmiany geometrii. "
        "W przeciwieństwie do „Ulepsz treść” nie dodaje zastępczych metryk, tylko "
        "kondensuje istniejącą treść. Zwraca ten sam kształt `corrections`, więc "
        "frontend renderuje te same karty Przed/Po co przy gramatyce.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1622–1628**, user **1629–1667**, handler `_shorten_content` **1607–1668**  \n"
        "**Akcja API:** `shorten` (submenu Popraw treść → Skróć CV)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{json.dumps(structured[:40])}` | `_extract_structured` (max 40) | 1619, 1636 |\n"
        "| `{full_text}` | `_extract_text` | 1620, 1633 |\n"
        "| dyrektywa językowa w system | `_content_language_directive(language_code)` | 1627, funkcja **1705–1723** |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1622, 1628)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1629, 1667)))

    # 8 ats
    parts.append("\n---\n\n## 8. Czytelność dla ATS\n\n")
    parts.append(
        "**Po co (prosto):** Backend najpierw generuje finalny PDF i PyMuPDF sprawdza "
        "odczyt tekstu, kontakt, kolejność oraz długość (`ats_readability.py`). "
        "LLM ocenia tylko nagłówki i słowa kluczowe — bez kary za dekoracje (linie, 01/02). "
        "Overall liczy kod z wag. W UI: CTA po **Sprawdź CV**.\n\n"
        f"**Plik:** `{a}` (+ `backend/app/services/ats_readability.py`)  \n"
        "**Linie:** system **1835–1844**, user **1845–1888**, handler `_ats_score` **1797–1895**  \n"
        "**Akcja API:** `ats_score`\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{review_text}` | tekst z PDF lub oczyszczony canvas | 1824–1826, 1848 |\n"
        "| `{parsing_note}` | score'y deterministyczne | 1827–1832, 1851 |\n"
        "| `{template_note}` | opcjonalny `template_id` | 1833, 1852 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1835, 1844)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1845, 1888)))

    # 8b translate
    parts.append("\n---\n\n## 8b. Tłumaczenie CV\n\n")
    parts.append(
        "**Po co (prosto):** Tłumaczy treść edytowalnych elementów na wybrany język "
        "i zwraca `corrections[]` (jak gramatyka) do akceptacji na kanwie. To osobna "
        "akcja od auto-detekcji języka CV: tu użytkownik zawsze wybiera język docelowy "
        "jawnie (nie ma trybu auto).\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1759–1766**, user **1767–1792**, handler `_translate_cv` **1726–1794**  \n"
        "**Akcja API:** `translate` (wymaga `target_language`: pl/en/de/fr/es/uk/it/nl)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{lang_name}` / `{lang}` | `target_language` z requestu | 2319, 1767 |\n"
        "| `{json.dumps(structured)}` | `_extract_structured` bez chrome/locked | 1749–1757, 1770 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 1759, 1766)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1767, 1792)))

    # 9 chat
    parts.append("\n---\n\n## 9. Czat (wolny asystent)\n\n")
    parts.append(
        "**Po co (prosto):** Rozmowa o CV: pytania, poprawki treści/stylu, "
        "przesuwanie elementów, przebudowa sekcji, usuwanie, klonowanie. "
        "Najpierw model decyduje, czy temat w ogóle dotyczy CV (`in_scope`). "
        "Czat nie uczestniczy w auto-detekcji języka CV — zawsze odpowiada po polsku.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1929–2080**, user **2086–2107**, handler `_chat` **1920–2203**  \n"
        "**Akcja API:** `chat`\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{json.dumps(structured)}` | `_extract_positional(elements)` | 1926, 2087 |\n"
        "| `{history_block}` | `_normalize_chat_history(history)` | 1927, 2081–2085 |\n"
        "| `{message}` | aktualna wiadomość z czatu | argument `_chat`, 2093 |\n\n"
        "### System (fragment początkowy)\n\n"
    )
    parts.append(code(sl(a, 1929, 1954)))
    parts.append("\n### User (pełna treść)\n\n")
    parts.append(code(sl(a, 2086, 2107)))

    # 10 layout system
    parts.append("\n---\n\n## 10. Układ — system i pytanie domyślne\n\n")
    parts.append(
        "**Po co (prosto):** Tryb **Układ** nie poprawia tekstu CV — tylko "
        "geometrię: odstępy, wyrównania, nachodzenia. System mówi modelowi, kim jest "
        "i czego nie wolno ruszać.\n\n"
        f"**Plik:** `{g}`  \n"
        f"**Składanie sesji:** `_layout_session` w `{a}`, linie **2206–2306** "
        "(snapshot **2214** + pytanie **2231** + historia **2233–2237** → `build_layout_user_prompt` **2239**).\n\n"
        "### `DEFAULT_LAYOUT_QUESTION` — linie **170–175**\n\n"
        "Używane, gdy użytkownik włączy Układ i wyśle pustą wiadomość "
        "(`_layout_session`, linia **2231**).\n\n"
    )
    parts.append(code(sl(g, 170, 175)))
    parts.append(
        "\n### `LAYOUT_CORRECTOR_SYSTEM` — linie **177–213**\n\n"
        "**Zmienne:** brak (nawiasy `SPACE_*` to nazwy pojęć w tekście, nie f-string).\n\n"
    )
    parts.append(code(sl(g, 177, 213)))

    # 11 template hints
    parts.append("\n---\n\n## 11. Układ — wskazówki szablonu\n\n")
    parts.append(
        "**Po co (prosto):** Krótka podpowiedź „jaki to szablon”, żeby model "
        "nie rozrywał nagłówków (np. numer + ramka w Monument). Trafia do "
        "`layout_contract.hint` i do zmiennej `{contract_hint}` w prompcie użytkownika.\n\n"
        f"**Plik:** `{g}`, funkcja `_layout_hint_for_template`, linie **229–248**  \n"
        f"**Budowa kontraktu:** `_build_layout_contract`, linie **251–276**  \n"
        f"**Wartości odstępów z:** `{cg}`, linie **43–46**\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd |\n"
        "|---------|------|\n"
        "| `template_id` | opcjonalne pole requestu; frontend `activeTemplateId` |\n"
        "| `{template_id}` w hintcie generycznym | ten sam slug, gdy nie Monument |\n\n"
        "### Treść wskazówek\n\n"
    )
    parts.append(code(sl(g, 229, 248), "python"))

    # 12 layout user prompt
    parts.append("\n---\n\n## 12. Układ — prompt użytkownika\n\n")
    parts.append(
        "**Po co (prosto):** To główne „zlecenie roboty” dla Luny: pełny JSON strony A4, "
        "pytanie użytkownika (albo chip), reguły jak liczyć odstępy (`real_gap`) "
        "oraz format odpowiedzi JSON z `section_inventory` i `changes`.\n\n"
        f"**Plik:** `{g}`, funkcja `build_layout_user_prompt`, linie **443–649** "
        "(ciało f-stringa **476–649**)\n\n"
        "### Zmienne (wszystkie z linii **449–474**)\n\n"
        "| Placeholder w f-stringu | Skąd | Referencja |\n"
        "|-------------------------|------|------------|\n"
        "| `{history}` | `history_block` z `_layout_session` | `ai_assistant_service.py` **2233–2237** |\n"
        "| `{json.dumps(snapshot)}` | snapshot z `build_layout_snapshot` | `layout_gpt.py` + sesja **2214** |\n"
        "| `{q}` | `question` albo `DEFAULT_LAYOUT_QUESTION` | **2231**, **170–175**, **473/480** |\n"
        "| `{space_stack:g}` itd. | `layout_contract.spacing_px` ← `SPACE_*` | **468–471**, `cv_generator_primitives.py` **43–46** |\n"
        "| `{gap_target/min/max/tolerance:g}` | `section_header_gap_px` | **461–467**, stałe **39–43** |\n"
        "| `{contract_hint}` | `layout_contract.hint` | **472**, hinty **229–248** |\n"
        "| `{max_delta:g}`, `{max_moves}`, `{max_findings}` | constraints snapshotu / stałe | **452–454**, **32–34** |\n\n"
        "### Pełna treść szablonu (f-string)\n\n"
    )
    parts.append(code(sl(g, 476, 649)))

    # 13 frontend
    parts.append("\n---\n\n## 13. Frontend — powitanie i chipy Układu\n\n")
    parts.append(
        "**Po co (prosto):** Po włączeniu Układu (cel **Sprawdź wygląd**) użytkownik "
        "widzi powitanie i przyciski. Kliknięcie chipa **nie** jest osobnym typem "
        "promptu systemowego — wysyła `action=layout` z pełnym tekstem `prompt` jako `message`. "
        "Cztery chipy `primary` są widoczne od razu; reszta pod „Więcej opcji”.\n\n"
        f"**Plik:** `{f}`\n\n"
        "### `LAYOUT_MODE_GREETING` — linie **152–155**\n\n"
        "Tylko UI (bąbelek asystenta). **Nie** jest osobną wiadomością systemową do GPT.\n\n"
    )
    parts.append(code(sl(f, 152, 155), "javascript"))
    parts.append(
        "\n### `LAYOUT_SUGGESTIONS` — linie **168–277**\n\n"
        "- `label` — krótki napis na chipie / w bąbelku (`displayText`).\n"
        "- `prompt` — pełne zlecenie geometrii wysyłane do backendu.\n"
        "- `primary: true` — chip w pierwszym rzędzie (max 4).\n"
        "- **Zmienne w chipach:** brak (stałe stringi). Kontekst A4 dokłada backend.\n\n"
    )
    parts.append(code(sl(f, 168, 277), "javascript"))

    # map
    parts.append(
        """
---

## Mapa akcja → plik

| Akcja API / cel UI | Handler | System (linie) | User (linie) |
|--------------------|---------|----------------|--------------|
| import PDF `/ai` | `extract_cv_data` | — | `ai_service.py` 48–118 |
| `rating` / Sprawdź CV | `_rate_cv` | 1119–1126 | 1127–1200 |
| `design_rating` / Sprawdź wygląd | `_rate_design` | 1216–1230 | 1231–1301 |
| `position_rating` / Dopasuj do oferty | `_rate_position` | 1331–1336 | 1337–1398 |
| `grammar` / Popraw treść | `_fix_grammar` | 1414–1420 | 1421–1442 |
| `language` / Popraw treść | `_check_style` | 1467–1476 | 1477–1528 |
| `improve` / Popraw treść | `_improve_content` | 1549–1556 | 1557–1603 |
| `shorten` / Popraw treść | `_shorten_content` | 1622–1628 | 1629–1667 |
| `ats_score` / CTA z Sprawdź CV | `_ats_score` + `ats_readability` | 1835–1844 | 1845–1888 |
| `translate` / Przetłumacz CV | `_translate_cv` | 1759–1766 | 1767–1792 |
| `chat` | `_chat` | 1929–2080 | 2086–2107 |
| `layout` / Sprawdź wygląd → Układ | `_layout_session` + `layout_gpt` | 177–213 | 476–649 (+ pytanie / chip) |

Handlerzy bez osobnego promptu modelu (tylko komunikaty UI / odmowy):
puste płótno w Układzie, odmowa zakresu czatu, nieobsługiwany `target_language` w tłumaczeniu.

Cztery akcje treści (`grammar`, `language`, `improve`, `shorten`) dodatkowo przyjmują
`language_code` (auto-detekcja albo `cv_language` override) — patrz sekcja
[Wielojęzyczne korekty treści](#wielojęzyczne-korekty-treści-gramatyka--styl--ulepsz--skróć)
na górze pliku.

---

*Wygenerowano przez `scripts/generate_prompts_md.py`.*
"""
    )

    OUT.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
