"""Generate PROMPTS.md from live source line ranges.

Usage (from repo root):
    python scripts/generate_prompts_md.py
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "PROMPTS.md"


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
    c = "backend/app/services/cv_generator.py"

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
"""
    )

    # 1 extract
    parts.append("## 1. Import PDF — ekstrakcja CV\n\n")
    parts.append(
        "**Po co (prosto):** Model patrzy na strony PDF jak na zdjęcia i wypisuje "
        "uporządkowane dane CV (imię, praca, szkoła, umiejętności…), żeby aplikacja "
        "mogła wstawić je do szablonu.\n\n"
        f"**Plik:** `{e}`  \n"
        "**Linie:** 48–93 (instrukcja), 97–100 (obrazy), 102–108 (wywołanie API)  \n"
        "**Symbol:** `extract_cv_data` (inline content)  \n"
        "**Rodzaj:** jedna wiadomość `user` (tekst + obrazy), bez osobnego system\n\n"
        "### Zmienne\n\n"
        "- W tekście instrukcji **nie ma** placeholderów — schemat JSON jest stały.\n"
        "- Obrazy: `_pdf_to_b64_images` w tym samym pliku, linie **24–34**; "
        "doklejane w pętli **97–100**.\n"
        "- Model: `_EXTRACT_MODEL` = `gpt-4o`, linia **19**.\n\n"
        "### Pełna treść (fragment tekstowy wiadomości)\n\n"
    )
    parts.append(code(sl(e, 48, 93), "python"))

    # 2 rating
    parts.append("\n---\n\n## 2. Ocena CV (treść)\n\n")
    parts.append(
        "**Po co (prosto):** Sztuczny „rekruter” ocenia treść CV w skali 1–10 "
        "(czy są sekcje, czy doświadczenie ma liczby i mocne czasowniki, czy język "
        "jest profesjonalny). Zwraca strukturalne `categories` / `strengths` / "
        "`priorities` (UI pokazuje %). Zwykle **nie** edytuje tekstu na kanwie.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **502–506**, user **507–571**, handler `_rate_cv` **497–574**  \n"
        "**Akcja API:** `rating` (cel UI: Sprawdź CV)\n\n"
        "### Zmienne\n\n"
        "| Zmienna w prompcie | Skąd | Linie |\n"
        "|--------------------|------|-------|\n"
        "| `{text}` | `_extract_text(elements)` przez `analyze_action` | 1490, 140–145 |\n"
        "| `{element_count}` | `len(_extract_structured(elements))` | 499–500, 148–166 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 502, 506)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 507, 571)))

    # 3 design
    parts.append("\n---\n\n## 3. Ocena projektu (typografia)\n\n")
    parts.append(
        "**Po co (prosto):** Sprawdza wygląd tekstu (hierarchia, bold, kolory, "
        "wyrównanie), a **nie** pozycje klocków na stronie. Małe czcionki szablonu "
        "i duże imię to celowy design — model nie ma ich „naprawiać”.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **587–601**, user **602–671**, handler `_rate_design` **575–689**  \n"
        "**Akcja API:** `design_rating` (cel UI: Sprawdź wygląd → typografia)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{typo}` | `json.dumps(_extract_typography(elements))` | 577, 255–280 |\n\n"
        "**Uwaga:** `summarize_geometry_issues` / `hard_faults` **nie trafiają do promptu** — "
        "Python po odpowiedzi obniża ocenę, gdy coś nachodzi lub wychodzi poza stronę.\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 587, 601)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 602, 671)))

    # 4 position
    parts.append("\n---\n\n## 4. Dopasowanie do stanowiska\n\n")
    parts.append(
        "**Po co (prosto):** Porównuje Twoje CV z opisem oferty pracy i mówi, "
        "na ile pasujesz (umiejętności, seniority, branża, słowa kluczowe).\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **700–704**, user **705–765**, handler `_rate_position` **690–771**  \n"
        "**Akcja API:** `position_rating` (cel UI: Dopasuj do oferty)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{job_description[:2000]}` | pole `job_description` z requestu / UI | 1492, 707 |\n"
        "| `{text}` | `_extract_text` | 1490, 710 |\n"
        "| `{web_ctx}` | wyniki `_ddg_search` | 692–697, 712–713 |\n"
        "| `{json.dumps(web_urls[:3])}` | linki z tego samego wyszukiwania | 698, 764 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 700, 704)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 705, 765)))

    # 5 grammar
    parts.append("\n---\n\n## 5. Gramatyka\n\n")
    parts.append(
        "**Po co (prosto):** Poprawia tylko literówki, gramatykę i przecinki. "
        "Nie zmienia sensu ani „ładniejszego” stylu.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **776–780**, user **781–801**, handler `_fix_grammar` **772–804**  \n"
        "**Akcja API:** `grammar` (submenu Popraw treść → Sprawdź błędy)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{json.dumps(structured)}` | `_extract_structured(elements)` | 774, 784 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 776, 780)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 781, 801)))

    # 6 language
    parts.append("\n---\n\n## 6. Styl językowy\n\n")
    parts.append(
        "**Po co (prosto):** Szuka strony biernej, frazesów („gracz zespołowy”) "
        "i ogólników, potem proponuje mocniejsze brzmienie.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **809–813**, user **814–857**, handler `_check_style` **805–860**  \n"
        "**Akcja API:** `language` (submenu Popraw treść → Popraw język)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{text}` | `_extract_text` | 1490, 817 |\n"
        "| `{json.dumps(structured[:30])}` | pierwsze 30 elementów ze `_extract_structured` | 807, 820 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 809, 813)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 814, 857)))

    # 7 improve
    parts.append("\n---\n\n## 7. Ulepsz treść\n\n")
    parts.append(
        "**Po co (prosto):** Przerabia punkty doświadczenia na mocniejsze zdania "
        "z czasownikiem na początku i miejscem na liczby (metryki).\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **865–869**, user **870–906**, handler `_improve_content` **861–921**  \n"
        "**Akcja API:** `improve` (submenu Popraw treść → Wzmocnij treść)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{json.dumps(structured[:30])}` | `_extract_structured` (max 30) | 863, 873 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 865, 869)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 870, 906)))

    # 8 ats
    parts.append("\n---\n\n## 8. ATS\n\n")
    parts.append(
        "**Po co (prosto):** Sprawdza, czy automatyczne systemy rekrutacyjne "
        "(Workday, Greenhouse…) łatwo „zrozumieją” Twoje CV: nagłówki, słowa kluczowe, "
        "kontakt, daty, długość. W UI uruchamiane leniwie z CTA po **Sprawdź CV**.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **995–999**, user **1000–1060**, handler `_ats_score` **993–1061**  \n"
        "**Akcja API:** `ats_score`\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{text}` | `_extract_text` | 1490, 1003 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 995, 999)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 1000, 1060)))

    # 8b translate
    parts.append("\n---\n\n## 8b. Tłumaczenie CV\n\n")
    parts.append(
        "**Po co (prosto):** Tłumaczy treść edytowalnych elementów na wybrany język "
        "i zwraca `corrections[]` (jak gramatyka) do akceptacji na kanwie.\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **955–962**, user **963–988**, handler `_translate_cv` **922–992**  \n"
        "**Akcja API:** `translate` (wymaga `target_language`: pl/en/de/fr/es/uk/it/nl)\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{lang_name}` / `{lang}` | `target_language` z requestu | 1499, 963 |\n"
        "| `{json.dumps(structured)}` | `_extract_structured` bez chrome | 940–952, 966 |\n\n"
        "### System\n\n"
    )
    parts.append(code(sl(a, 955, 962)))
    parts.append("\n### User\n\n")
    parts.append(code(sl(a, 963, 988)))

    # 9 chat
    parts.append("\n---\n\n## 9. Czat (wolny asystent)\n\n")
    parts.append(
        "**Po co (prosto):** Rozmowa o CV: pytania, poprawki treści/stylu, "
        "przesuwanie elementów, przebudowa sekcji, usuwanie, klonowanie. "
        "Najpierw model decyduje, czy temat w ogóle dotyczy CV (`in_scope`).\n\n"
        f"**Plik:** `{a}`  \n"
        "**Linie:** system **1095–…**, user **1252–…**, handler `_chat` **1086–1371**  \n"
        "**Akcja API:** `chat`\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd | Linie |\n"
        "|---------|------|-------|\n"
        "| `{json.dumps(structured)}` | `_extract_positional(elements)` | 1092, 1252 |\n"
        "| `{history_block}` | `_normalize_chat_history(history)` | 1093, 1068–1084 |\n"
        "| `{message}` | aktualna wiadomość z czatu | argument `_chat` |\n\n"
        "### System (fragment początkowy)\n\n"
    )
    parts.append(code(sl(a, 1095, 1120)))
    parts.append("\n### User (fragment)\n\n")
    parts.append(code(sl(a, 1252, 1275)))

    # 10 layout system
    parts.append("\n---\n\n## 10. Układ — system i pytanie domyślne\n\n")
    parts.append(
        "**Po co (prosto):** Tryb **Układ** nie poprawia tekstu CV — tylko "
        "geometrię: odstępy, wyrównania, nachodzenia. System mówi modelowi, kim jest "
        "i czego nie wolno ruszać.\n\n"
        f"**Plik:** `{g}`  \n"
        "**Składanie sesji:** `_layout_session` w `{a}`, linie **1169–1203** "
        "(snapshot + pytanie + historia → `build_layout_user_prompt`).\n\n"
        "### `DEFAULT_LAYOUT_QUESTION` — linie **168–173**\n\n"
        "Używane, gdy użytkownik włączy Układ i wyśle pustą wiadomość "
        "(`_layout_session`, linia **1194**).\n\n"
    )
    parts.append(code(sl(g, 168, 173)))
    parts.append(
        "\n### `LAYOUT_CORRECTOR_SYSTEM` — linie **175–211**\n\n"
        "**Zmienne:** brak (nawiasy `SPACE_*` to nazwy pojęć w tekście, nie f-string).\n\n"
    )
    parts.append(code(sl(g, 175, 211)))

    # 11 template hints
    parts.append("\n---\n\n## 11. Układ — wskazówki szablonu\n\n")
    parts.append(
        "**Po co (prosto):** Krótka podpowiedź „jaki to szablon”, żeby model "
        "nie rozrywał nagłówków (np. numer + ramka w Monument). Trafia do "
        "`layout_contract.hint` i do zmiennej `{contract_hint}` w prompcie użytkownika.\n\n"
        f"**Plik:** `{g}`, funkcja `_layout_hint_for_template`, linie **227–254**  \n"
        f"**Budowa kontraktu:** `_build_layout_contract`, linie **257–285**  \n"
        f"**Wartości odstępów z:** `{c}`, linie **40–43**\n\n"
        "### Zmienne\n\n"
        "| Zmienna | Skąd |\n"
        "|---------|------|\n"
        "| `template_id` | opcjonalne pole requestu; frontend `activeTemplateId` |\n"
        "| `{template_id}` w hintcie generycznym | ten sam slug, gdy nie Words/Monument/Onyx |\n\n"
        "### Treść wskazówek\n\n"
    )
    parts.append(code(sl(g, 227, 254), "python"))

    # 12 layout user prompt
    parts.append("\n---\n\n## 12. Układ — prompt użytkownika\n\n")
    parts.append(
        "**Po co (prosto):** To główne „zlecenie roboty” dla Luny: pełny JSON strony A4, "
        "pytanie użytkownika (albo chip), reguły jak liczyć odstępy (`real_gap`) "
        "oraz format odpowiedzi JSON z `section_inventory` i `changes`.\n\n"
        f"**Plik:** `{g}`, funkcja `build_layout_user_prompt`, linie **452–658** "
        "(ciało f-stringa **485–658**)\n\n"
        "### Zmienne (wszystkie z linii **458–483**)\n\n"
        "| Placeholder w f-stringu | Skąd | Referencja |\n"
        "|-------------------------|------|------------|\n"
        "| `{history}` | `history_block` z `_layout_session` | `ai_assistant_service.py` **1196–1200** |\n"
        "| `{json.dumps(snapshot)}` | snapshot z `build_layout_snapshot` | `layout_gpt.py` + sesja **1177** |\n"
        "| `{q}` | `question` albo `DEFAULT_LAYOUT_QUESTION` | **1194**, **168–173**, **482** |\n"
        "| `{space_stack:g}` itd. | `layout_contract.spacing_px` ← `SPACE_*` | **477–480**, `cv_generator.py` **40–43** |\n"
        "| `{gap_target/min/max/tolerance:g}` | `section_header_gap_px` | **470–476**, stałe **38–42** |\n"
        "| `{contract_hint}` | `layout_contract.hint` | **481**, hinty **227–254** |\n"
        "| `{max_delta:g}`, `{max_moves}`, `{max_findings}` | constraints snapshotu / stałe | **461–463**, **31–33** |\n\n"
        "### Pełna treść szablonu (f-string)\n\n"
    )
    parts.append(code(sl(g, 485, 658)))

    # 13 frontend
    parts.append("\n---\n\n## 13. Frontend — powitanie i chipy Układu\n\n")
    parts.append(
        "**Po co (prosto):** Po włączeniu Układu (cel **Sprawdź wygląd**) użytkownik "
        "widzi powitanie i przyciski. Kliknięcie chipa **nie** jest osobnym typem "
        "promptu systemowego — wysyła `action=layout` z pełnym tekstem `prompt` jako `message`. "
        "Cztery chipy `primary` są widoczne od razu; reszta pod „Więcej opcji”.\n\n"
        f"**Plik:** `{f}`\n\n"
        "### `LAYOUT_MODE_GREETING` — linie **138–141**\n\n"
        "Tylko UI (bąbelek asystenta). **Nie** jest osobną wiadomością systemową do GPT.\n\n"
    )
    parts.append(code(sl(f, 138, 141), "javascript"))
    parts.append(
        "\n### `LAYOUT_SUGGESTIONS` — linie **154–263**\n\n"
        "- `label` — krótki napis na chipie / w bąbelku (`displayText`).\n"
        "- `prompt` — pełne zlecenie geometrii wysyłane do backendu.\n"
        "- `primary: true` — chip w pierwszym rzędzie (max 4).\n"
        "- **Zmienne w chipach:** brak (stałe stringi). Kontekst A4 dokłada backend.\n\n"
    )
    parts.append(code(sl(f, 154, 263), "javascript"))

    # map
    parts.append(
        """
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
"""
    )

    OUT.write_text("".join(parts), encoding="utf-8")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
