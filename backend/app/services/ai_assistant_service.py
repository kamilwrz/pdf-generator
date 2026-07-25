"""
AI Assistant service — powers the floating AI chat panel.

Each action receives the current canvas elements, builds a focused prompt,
calls GPT, and returns a structured response the frontend can render
(message text, rating, tips, element-level correction patches).
"""
import json
import os
from openai import OpenAI
from app.core.config import OPENAI_API_KEY
from app.services.layout_analysis import analyze_layout, extract_bounds, resolve_directed_operation

_MODEL = os.getenv("AI_ASSISTANT_MODEL", "gpt-5.5")
_client = OpenAI(api_key=OPENAI_API_KEY)

# Fields that corrections are ALLOWED to patch.
# Positional fields (left, top, width, height, zIndex, page) are intentionally
# excluded — letting GPT touch those caused elements to overlap icons.
_CONTENT_FIELDS  = {"content"}
_STYLE_FIELDS    = {"fontSize", "fontFamily", "color", "bold", "italic", "align"}
_ALLOWED_FIELDS  = _CONTENT_FIELDS | _STYLE_FIELDS


# ── helpers ────────────────────────────────────────────────────────────────

def _extract_text(elements: list[dict]) -> str:
    lines = []
    for el in elements:
        if el.get("category") in ("text", "textarea") and el.get("content"):
            lines.append(el["content"].replace("\\n", " "))
    return "\n".join(lines)


def _extract_structured(elements: list[dict]) -> list[dict]:
    return [
        {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "content": el.get("content", ""),
            "fontSize": el.get("fontSize"),
            "bold": el.get("bold", False),
            "italic": el.get("italic", False),
            "align": el.get("align", "left"),
        }
        for el in elements
        if el.get("category") in ("text", "textarea") and el.get("content")
    ]


def _extract_positional(elements: list[dict]) -> list[dict]:
    """Content, style, and geometry plus geometry-only visual elements.

    Text is the only editable content. Images, lines, and rectangles are also
    emitted for chat commands so the AI can explicitly place every visible
    canvas element without being allowed to invent raw coordinates.
    """
    bounds_by_id = {b["element_id"]: b for b in extract_bounds(elements)}
    structured = _extract_structured(elements)
    for item in structured:
        bounds = bounds_by_id.get(item["element_id"])
        if bounds:
            item["left"] = bounds["left"]
            item["top"] = bounds["top"]
            item["width"] = bounds["width"]
            item["height"] = bounds["height"]
            item["page"] = bounds["page"]

    included_ids = {item["element_id"] for item in structured}
    visual_labels = {
        "image": "[obraz]",
        "line": "[linia]",
        "rectangle": "[prostokąt]",
    }
    for el in elements:
        element_id = el.get("element_id")
        category = el.get("category")
        if category not in visual_labels or element_id in included_ids:
            continue
        bounds = bounds_by_id.get(element_id)
        if not bounds:
            continue
        structured.append({
            "element_id": element_id,
            "category": category,
            "content": visual_labels[category],
            "color": el.get("backgroundColor"),
            "borderWidth": el.get("borderWidth"),
            "left": bounds["left"],
            "top": bounds["top"],
            "width": bounds["width"],
            "height": bounds["height"],
            "page": bounds["page"],
        })
    return structured


def _extract_typography(elements: list[dict]) -> list[dict]:
    """Typography-only view — NO positional data, so GPT cannot misplace elements."""
    return [
        {
            "element_id": el.get("element_id"),
            "category": el.get("category"),
            "fontSize": el.get("fontSize"),
            "fontFamily": el.get("fontFamily"),
            "color": el.get("color"),
            "bold": el.get("bold"),
            "italic": el.get("italic"),
            "align": el.get("align"),
            "preview": (el.get("content") or "")[:60],
        }
        for el in elements
        if el.get("category") in ("text", "textarea") and el.get("content")
    ]


def _gpt(system: str, user: str) -> dict:
    resp = _client.chat.completions.create(
        model=_MODEL,
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
        response_format={"type": "json_object"},
        reasoning_effort="medium",
        max_completion_tokens=16000,
    )
    content = resp.choices[0].message.content or ""
    if not content.strip():
        raise ValueError(
            f"Model returned empty content (finish_reason={resp.choices[0].finish_reason})"
        )
    stripped = content.strip()
    if stripped.startswith("```"):
        stripped = stripped.split("```", 2)[1]
        if stripped.startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.rsplit("```", 1)[0].strip()
    return json.loads(stripped)


def _ddg_search(query: str, max_results: int = 5) -> list[dict]:
    try:
        from duckduckgo_search import DDGS
        return list(DDGS().text(query, max_results=max_results))
    except Exception:
        return []


def _safe_result(raw: dict, allowed_fields: set = _ALLOWED_FIELDS) -> dict:
    """Normalise GPT output. Strips any positional fields from corrections."""
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

    return {
        "message": str(raw.get("message", "")),
        "rating": raw.get("rating") if isinstance(raw.get("rating"), int) else None,
        "tips": [str(t) for t in raw.get("tips", [])][:8],
        "corrections": corrections,
        "web_sources": [str(s) for s in raw.get("web_sources", [])][:5],
    }


# ── action handlers ────────────────────────────────────────────────────────

def _rate_cv(text: str, elements: list[dict]) -> dict:
    structured = _extract_structured(elements)
    element_count = len(structured)

    system = (
        "Jesteś starszym rekruterem i coachem CV z ponad 15-letnim doświadczeniem w branży "
        "technologicznej, finansowej i konsultingowej. Udzielasz rygorystycznych, szczerych i konkretnych opinii. "
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
   doświadczenie zawodowe, wykształcenie, umiejętności/technologie.
   Wynik = (liczba obecnych sekcji / 5) × 2. Zaokrąglij do 1 miejsca po przecinku.

② JAKOŚĆ DOŚWIADCZENIA (0–3 pkt)
   Dla każdego wpisu dotyczącego stanowiska/roli:
   - Czy zaczyna się od mocnego czasownika działania? (Prowadziłem, Zbudowałem, Zaprojektowałem, Zwiększyłem…)
   - Czy zawiera co najmniej jeden mierzalny rezultat (%, zł, liczba, zaoszczędzony czas)?
   Przyznaj: 1 pkt, jeśli >60% punktów używa czasowników działania, 1 pkt, jeśli >40% zawiera metryki,
   1 pkt, jeśli role pokazują rozwój lub związek z docelową branżą.

③ JĘZYK I PROFESJONALIZM (0–2 pkt)
   Sprawdź: stronę bierną („byłem odpowiedzialny”), frazesy („gracz zespołowy”,
   „osoba z inicjatywą”, „pasjonuję się”), ogólniki oraz błędy gramatyczne i ortograficzne.
   2 pkt = brak problemów. 1 pkt = drobne problemy. 0 pkt = istotne problemy.

④ FORMAT I HIERARCHIA (0–2 pkt)
   Na podstawie liczby elementów i różnorodności treści: czy istnieje wyraźna hierarchia wizualna
   (imię > nagłówki > tekst główny)? Czy długość jest odpowiednia (1–2 strony)?
   Przyznaj do 2 pkt.

⑤ WYRÓŻNIENIE (0–1 pkt)
   Czy CV zawiera coś zapadającego w pamięć — wyjątkowe osiągnięcie, rzadką umiejętność,
   przykład przywództwa lub mierzalny wpływ wyróżniający kandydata?
   1 pkt, jeśli tak; 0 pkt, jeśli treść jest ogólna.

SUMA = ①+②+③+④+⑤, zaokrąglona do najbliższej liczby całkowitej, w zakresie 1–10.
════════════════════════════════════════

Zwróć JSON (uwzględnij wyniki cząstkowe w wskazówkach):
{{
  "message": "<3–4 zdania: podaj obliczoną ocenę, wskaż 1–2 konkretne mocne strony oraz 1–2 konkretne słabe strony. Bądź bezpośredni. Odnoś się do konkretnych treści z CV.>",
  "rating": <obliczona suma 1-10>,
  "tips": [
    "Rozkład oceny: Sekcje ①/2 + Doświadczenie ②/3 + Język ③/2 + Format ④/2 + Wyróżnienie ⑤/1 = suma/10",
    "<najważniejsza poprawka z przykładem przed/po>",
    "<druga najważniejsza poprawka>",
    "<brakująca sekcja lub element, jeśli występuje>",
    "<możliwość kwantyfikacji: która rola/punkt wymaga metryki>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _rate_design(elements: list[dict]) -> dict:
    typo = json.dumps(_extract_typography(elements), ensure_ascii=False)

    system = (
        "Jesteś ekspertem od typografii i projektowania wizualnego CV. "
        "Sugerujesz WYŁĄCZNIE zmiany rozmiaru i kroju czcionki, koloru, pogrubienia, kursywy oraz wyrównania tekstu. "
        "NIGDY nie zmieniasz pozycji elementów (left, top, width, height) — są ustalone przez szablon. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeanalizuj typografię i styl tekstu na tej kanwie CV.

DANE TYPOGRAFICZNE (bez pozycji — nie wyciągaj wniosków ani nie sugeruj zmian pozycji):
{typo}

════════════════════════════════════════
ETAPY ANALIZY:

① HIERARCHIA ROZMIARÓW CZCIONKI
   Czy występuje wyraźna progresja rozmiaru: imię i nazwisko (największe) > nagłówki sekcji > tekst główny?
   Typowe dobre wartości: imię i nazwisko 22–28 px, nagłówki 14–16 px, tekst główny 10–12 px.
   Wskaż elementy, które zaburzają tę hierarchię.

② POGRUBIENIE I WYRÓŻNIENIE
   Czy nagłówki są konsekwentnie pogrubione? Czy pogrubienie jest nadużywane (jeśli wszystko jest pogrubione, nic się nie wyróżnia)?

③ SPÓJNOŚĆ KOLORÓW
   Czy kolory tekstu są używane konsekwentnie? Zidentyfikuj elementy o odstającym kolorze.

④ WYRÓWNANIE
   Czy tekst główny jest konsekwentnie wyrównany do lewej? Czy nagłówki są wyrównane konsekwentnie?
   Mieszane wyrównanie w jednej sekcji wygląda nieprofesjonalnie.

⑤ OCENA OGÓLNA
   Na podstawie punktów ①–④ przyznaj ocenę projektu w skali 1–10.
════════════════════════════════════════

Zwracaj poprawki WYŁĄCZNIE dla jednoznacznych ulepszeń typografii.
Każda poprawka może zawierać WYŁĄCZNIE pola: fontSize, fontFamily, color, bold, italic, align.
Nie uwzględniaj wartości element_id z danych powyżej, jeśli nie masz pewności, że wymagają zmiany.

Zwróć JSON:
{{
  "message": "<2–3 zdania: podaj ocenę i wskaż najważniejsze znalezione problemy typograficzne>",
  "rating": <1-10>,
  "tips": [
    "Rozkład oceny: Hierarchia ①/3 + Wyróżnienie ②/2 + Kolor ③/2 + Wyrównanie ④/2 + Ocena ogólna ⑤/1",
    "<konkretna poprawka typografii z podglądem elementu>",
    "<druga konkretna poprawka>"
  ],
  "corrections": [
    {{"element_id": "<id>", "fontSize": 12}},
    {{"element_id": "<id>", "bold": true}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user), allowed_fields=_STYLE_FIELDS)


def _rate_position(text: str, job_description: str) -> dict:
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
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Oblicz, jak dobrze to CV pasuje do opisu stanowiska. Oceń je w skali 1–10.

OPIS STANOWISKA:
{job_description[:2000]}

TREŚĆ CV:
{text}

KONTEKST Z INTERNETU (standardy branżowe dla tej roli):
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

Zwróć JSON:
{{
  "message": "<3–4 zdania: podaj ocenę i sposób jej obliczenia, wymień dopasowane umiejętności oraz luki. Bądź konkretny.>",
  "rating": <obliczona ocena 1-10>,
  "tips": [
    "Rozkład oceny: Umiejętności ①/4 + Seniority ②/2 + Obszar ③/2 + Słowa kluczowe ④/1 + Wyróżniki ⑤/1 = suma/10",
    "<wymień 3–5 najważniejszych umiejętności z opisu stanowiska, których BRAKUJE w CV>",
    "<najważniejsza zmiana CV poprawiająca dopasowanie>",
    "<konkretne słowo kluczowe do dodania do CV>",
    "<sekcja do dopasowania lub dodania>"
  ],
  "corrections": [],
  "web_sources": {json.dumps(web_urls[:3])}
}}"""
    result = _safe_result(_gpt(system, user))
    if not result["web_sources"] and web_urls:
        result["web_sources"] = web_urls[:3]
    return result


def _fix_grammar(elements: list[dict]) -> dict:
    structured = _extract_structured(elements)

    system = (
        "Jesteś profesjonalnym korektorem specjalizującym się w dokumentach biznesowych i CV. "
        "Poprawiaj WYŁĄCZNIE gramatykę, ortografię i interpunkcję. Nie zmieniaj znaczenia, tonu ani struktury. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Sprawdź korektę każdego poniższego elementu tekstowego. Popraw wszystkie błędy gramatyczne, ortograficzne i interpunkcyjne.

ELEMENTY:
{json.dumps(structured, ensure_ascii=False)}

ZASADY:
- W tablicy corrections uwzględniaj tylko elementy, które rzeczywiście zawierają błędy.
- Wartość "content" w każdej poprawce musi zawierać PEŁNY poprawiony tekst (nie fragment).
- Nie ulepszaj stylu ani nie parafrazuj — tylko poprawiaj błędy.
- Policz wszystkie znalezione błędy i podaj ich liczbę w message.

Zwróć JSON:
{{
  "message": "<podsumowanie: znaleziono X błędów w Y elementach. Wymień najczęstsze rodzaje błędów.>",
  "rating": null,
  "tips": [],
  "corrections": [
    {{"element_id": "<id>", "content": "<full corrected text of this element>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user), allowed_fields=_CONTENT_FIELDS)


def _check_style(text: str, elements: list[dict]) -> dict:
    structured = _extract_structured(elements)

    system = (
        "Jesteś profesjonalnym autorem CV specjalizującym się w poprawianiu tonu, jasności "
        "i profesjonalizmu języka w CV. Zwracaj WYŁĄCZNIE prawidłowy JSON. "
        "Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Przeanalizuj styl językowy tego CV i przeredaguj słabe elementy.

PEŁNY TEKST CV:
{text}

POJEDYNCZE ELEMENTY (do ukierunkowanych przeredagowań):
{json.dumps(structured[:30], ensure_ascii=False)}

════════════════════════════════════════
ETAPY ANALIZY:

① STRONA CZYNNA A BIERNA
   Znajdź każde użycie strony biernej („byłem odpowiedzialny”, „było zarządzane przez”).
   To przeredagowania o najwyższym priorytecie.

② FRAZESY I SŁABE SFORMUŁOWANIA
   Oznacz: „gracz zespołowy”, „pracowity”, „pasjonuję się”, „osoba z inicjatywą”,
   „nastawiony na wyniki”, „dbający o szczegóły”, „synergia”. Zastąp je dowodami.

③ OGÓLNIKOWE STWIERDZENIA
   Oznacz twierdzenia bez dowodów: „poprawiłem efektywność”, „prowadziłem projekty”.
   Tam, gdzie to właściwe, dodaj zastępczą metrykę: „poprawiłem efektywność o [X%]”.

④ PROFESJONALNY TON
   Czy ton jest zbyt nieformalny, zbyt formalny czy odpowiedni dla branży?

Przeredagowuj tylko elementy, które rzeczywiście tego wymagają. Krótkie elementy (imiona i nazwiska, daty, nagłówki)
nie powinny być przeredagowywane.
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
    return _safe_result(_gpt(system, user), allowed_fields=_CONTENT_FIELDS)


def _improve_content(elements: list[dict]) -> dict:
    structured = _extract_structured(elements)

    system = (
        "Jesteś wysokiej klasy autorem CV. Specjalizujesz się w przekształcaniu zwykłych opisów obowiązków "
        "w przekonujące, oparte na metrykach punkty, które przechodzą przez ATS i robią wrażenie na rekruterach. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi, w tym content poprawek, zwracaj po polsku."
    )
    user = f"""Przeredaguj poniższą treść CV, aby maksymalizować jej siłę oddziaływania.

ELEMENTY:
{json.dumps(structured[:30], ensure_ascii=False)}

════════════════════════════════════════
ZASADY PRZEREDAGOWANIA (stosuj po kolei):

① MOCNE CZASOWNIKI NA POCZĄTKU — każdy punkt musi zaczynać się od czasownika działania w czasie przeszłym.
   Preferuj: Zaprojektowałem, Uruchomiłem, Zredukowałem, Zwiększyłem, Wynegocjowałem, Dostarczyłem, Zautomatyzowałem,
   Skalowałem, Przeprojektowałem, Usprawniłem. Unikaj: Pomagałem, Wspierałem, Byłem zaangażowany.

② KWANTYFIKUJ WSZYSTKO — dodaj metrykę do każdego punktu opisującego osiągnięcie.
   Jeśli oryginał nie zawiera liczby, dodaj sensowny symbol zastępczy: [X%], [N użytkowników], [K zł].
   Przykład: „Zarządzałem mediami społecznościowymi” → „Zwiększyłem liczbę obserwujących w mediach społecznościowych o [X%] w ciągu [N] miesięcy”

③ KONKRETNOŚĆ — zastępuj ogólne odniesienia do technologii/narzędzi ich rzeczywistymi nazwami, jeśli można je wywnioskować.
   „Używałem baz danych” → „Zoptymalizowałem zapytania PostgreSQL, zmniejszając opóźnienia o [X%]”

④ DŁUGOŚĆ — zachowaj 1–2 wiersze na punkt. Usuń wypełniacze. Każde słowo musi być uzasadnione.

⑤ POMIJAJ nagłówki, imiona i nazwiska, dane kontaktowe oraz daty — przeredagowuj tylko tekst doświadczenia, umiejętności i podsumowania.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania podsumowujące, co poprawiono i dlaczego>",
  "rating": null,
  "tips": [
    "<znaleziony ogólny wzorzec, np. „5 punktów nie miało czasowników działania — wszystkie przeredagowano”>",
    "<wskazówka dotycząca zastępczych metryk: „Przed wysłaniem zastąp symbole [X%] rzeczywistymi wartościami”>"
  ],
  "corrections": [
    {{"element_id": "<id>", "content": "<pełny przeredagowany tekst elementu po polsku>"}}
  ],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user), allowed_fields=_CONTENT_FIELDS)


def _ats_score(text: str) -> dict:
    system = (
        "Jesteś ekspertem od ATS (systemów śledzenia kandydatów). "
        "Wiesz, jak Workday, Greenhouse, Lever i Taleo analizują CV. "
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""Przeanalizuj to CV pod kątem zgodności z ATS. Oceń je w skali 1–10.

TEKST CV:
{text}

════════════════════════════════════════
ETAPY OBLICZEŃ:

① STANDARDOWE NAGŁÓWKI SEKCJI (0–2 pkt)
   ATS oczekuje dokładnych lub zbliżonych standardowych nagłówków. Sprawdź:
   „Doświadczenie zawodowe” / „Doświadczenie”, „Wykształcenie”, „Umiejętności”, „Podsumowanie” / „Profil”,
   „Certyfikaty”, „Języki”.
   Wynik = (liczba znalezionych standardowych nagłówków / 6) × 2.

② GĘSTOŚĆ SŁÓW KLUCZOWYCH (0–3 pkt)
   Zidentyfikuj 5 najważniejszych standardowych dla branży słów kluczowych obecnych w CV
   (np. konkretne technologie, metodyki, kompetencje miękkie).
   Wynik = (liczba znalezionych słów kluczowych / 5) × 3.

③ KOMPLETNOŚĆ DANYCH KONTAKTOWYCH (0–1 pkt)
   E-mail, telefon, LinkedIn/GitHub, lokalizacja. 1 pkt, jeśli obecne są ≥3; 0,5 pkt, jeśli 2; 0 pkt, jeśli ≤1.

④ SPÓJNOŚĆ FORMATU DAT (0–1 pkt)
   Daty powinny konsekwentnie mieć format miesiąc rok lub MM/RRRR. 1 pkt, jeśli są spójne; 0 pkt, jeśli są mieszane.

⑤ BEZPIECZEŃSTWO FORMATOWANIA (0–2 pkt)
   ATS ma trudności z: tabelami, obrazami w przepływie tekstu, znakami specjalnymi i nietypowymi czcionkami.
   Na podstawie struktury elementów przyznaj do 2 pkt.

⑥ DŁUGOŚĆ (0–1 pkt)
   Optymalna długość to 1–2 strony. Oszacuj ją na podstawie liczby słów w tekście.

SUMA = ①+②+③+④+⑤+⑥, w zakresie 1–10.
════════════════════════════════════════

Zwróć JSON:
{{
  "message": "<2–3 zdania: podaj ocenę, główne ryzyko związane z ATS i najważniejszą lukę w słowach kluczowych>",
  "rating": <obliczona ocena 1-10>,
  "tips": [
    "Rozkład oceny: Nagłówki ①/2 + Słowa kluczowe ②/3 + Kontakt ③/1 + Daty ④/1 + Format ⑤/2 + Długość ⑥/1 = suma/10",
    "<znaleziony niestandardowy nagłówek + proponowana nazwa>",
    "<3 najważniejsze brakujące słowa kluczowe ATS dla widocznej branży/roli>",
    "<brak w danych kontaktowych, jeśli występuje>",
    "<problem z formatem dat, jeśli występuje>"
  ],
  "corrections": [],
  "web_sources": []
}}"""
    return _safe_result(_gpt(system, user))


def _chat(message: str, elements: list[dict], page_size: dict | None) -> dict:
    structured = _extract_positional(elements)

    system = (
        "Jesteś ekspertem i coachem CV. Masz pełną treść, styl i pozycję (px, 1:1 z PDF) "
        "każdego elementu CV użytkownika jako kontekst. Wiadomość użytkownika może być:\n"
        "(1) PYTANIEM — odpowiedz konkretnie w message, zostaw corrections jako pustą listę "
        "i position_operation jako null.\n"
        "(2) POLECENIEM edycji treści lub stylu (np. \"zmień rozmiar czcionki nagłówków na 13px\", "
        "\"popraw sekcję wykształcenie\") — znajdź pasujące elementy i zwróć po jednej poprawce "
        "w corrections. Poprawka może zawierać WYŁĄCZNIE pola: content, fontSize, fontFamily, "
        "color, bold, italic, align. NIGDY nie zwracaj left/top/width/height/zIndex/page w corrections.\n"
        "(3) POLECENIEM dotyczącym POZYCJI elementów (np. \"przesuń nagłówki sekcji o 50px w lewo\", "
        "\"wyrównaj te elementy na x=50\", \"rozłóż wpisy w sekcji doświadczenia równomiernie\") — "
        "zwróć position_operation zamiast corrections:\n"
        "  - Elementy typu image, line i rectangle są prawidłowymi celami poleceń pozycji. "
        "Przesuwaj je tylko wtedy, gdy użytkownik wyraźnie o to prosi; nie traktuj dekoracji "
        "jako elementów do automatycznej korekty.\n"
        "  {\"type\": \"shift\"|\"align\"|\"distribute\"|\"space\", \"target_element_ids\": [\"...\"] LUB "
        "\"target_groups\": [[\"...\"], [\"...\"]], "
        "\"dx\": <liczba>, \"dy\": <liczba>, \"gap\": <liczba nieujemna>, \"axis\": \"x\"|\"y\", "
        "\"anchor\": \"start\"|\"center\"|\"end\", \"target\": <liczba lub pomiń>}\n"
        "  - target_element_ids: użyj, gdy polecenie dotyczy pojedynczych elementów (np. nagłówków).\n"
        "  - target_groups: użyj ZAMIAST target_element_ids, gdy polecenie dotyczy CAŁYCH BLOKÓW "
        "złożonych z kilku elementów (np. \"rozłóż wpisy o pracę równomiernie\", gdzie każdy wpis to "
        "osobny tytuł stanowiska + firma/daty + opis). Każda wewnętrzna lista to identyfikatory "
        "elementów tworzących jeden blok — znajdź bloki na podstawie bliskości pozycji i wzorca "
        "treści (powtarzający się układ: tytuł, potem firma/daty, potem opis, dla każdego wpisu). "
        "Blok porusza się jako całość — jego elementy zachowują wzajemny układ. Nie łącz "
        "target_groups z target_element_ids w tym samym poleceniu.\n"
        "  - shift: przesunięcie względne (dx, dy) w px wybranych elementów lub bloków.\n"
        "  - align: ustawia wybrane elementy lub bloki na wspólnej wartości jednej osi (axis) przy "
        "zakotwiczeniu (anchor: start = lewa/górna krawędź, center = środek, end = prawa/dolna "
        "krawędź). Jeśli użytkownik podał konkretną wartość (np. \"na x=50\"), podaj ją jako target. "
        "Jeśli chodzi tylko o wzajemne wyrównanie bez podanej wartości, pomiń target. PRZED zwróceniem "
        "align sprawdź na podstawie podanych pozycji (left/top), czy wskazane elementy już mają "
        "zgodną wartość na tej osi (identyczną lub w granicach 1px) — jeśli tak, NIE zwracaj "
        "position_operation; zamiast tego w message napisz, że są już wyrównane, więc nie ma czego zmieniać.\n"
        "  - distribute: równomiernie rozkłada odstępy między co najmniej 3 wybranymi elementami lub "
        "blokami wzdłuż osi (axis); pierwszy i ostatni pozostają na miejscu.\n"
        "  - space: ustawia DOKŁADNY odstęp między krawędziami kolejnych elementów lub bloków "
        "na wartość gap w px; pierwszy element/blok zostaje na miejscu, a Python wylicza różne "
        "przesunięcia dla pozostałych. Użyj tego dla poleceń typu „ustaw odstępy 10 px”. "
        "Dla elementów WEWNĄTRZ jednego bloku (np. stanowisko + firma/daty + opis PwC) użyj "
        "target_element_ids z trzema identyfikatorami. Dla odstępu MIĘDZY całymi blokami użyj "
        "target_groups z co najmniej dwiema grupami.\n"
        "NIGDY sam nie podawaj wartości left/top — Python obliczy rzeczywiste współrzędne na "
        "podstawie bieżącej, aktualnej pozycji elementów i sam odrzuci operację, jeśli wyszłaby "
        "poza stronę.\n"
        "(4) Jeśli polecenie wymaga zmiany rozmiaru elementów lub liczby stron (np. \"zmieść CV na "
        "jednej stronie\"), albo jest zbyt niejednoznaczne, by bezpiecznie określić elementy "
        "docelowe i operację — NIE zgaduj. W message wyjaśnij ograniczenie lub zadaj pytanie "
        "doprecyzowujące, zostaw corrections puste i position_operation jako null.\n"
        "Zwracaj WYŁĄCZNIE prawidłowy JSON. Wszystkie tekstowe wartości odpowiedzi zwracaj po polsku."
    )
    user = f"""ELEMENTY CV (id, typ, treść, styl, pozycja i rozmiar w px):
{json.dumps(structured, ensure_ascii=False)}

WIADOMOŚĆ UŻYTKOWNIKA:
{message}

Zwróć JSON:
{{
  "message": "<Twoja odpowiedź — konkretna i oparta na powyższych elementach>",
  "rating": null,
  "tips": ["<wskazówka lub osiągalna alternatywa, jeśli istotna>"],
  "corrections": [],
  "position_operation": null,
  "web_sources": []
}}"""
    raw = _gpt(system, user)
    result = _safe_result(raw)

    directive = raw.get("position_operation")
    if isinstance(directive, dict):
        resolved = resolve_directed_operation(elements, directive, page_size)
        result["layout_groups"] = resolved["layout_groups"]
        result["layout_issues"] = resolved["layout_issues"]
    else:
        result["layout_groups"] = []
        result["layout_issues"] = []

    return result


def _analyze_layout(elements: list[dict], page_size: dict | None) -> dict:
    """Return deterministic layout proposals; GPT never chooses coordinates."""
    return analyze_layout(elements, page_size)


# ── public dispatcher ──────────────────────────────────────────────────────

def analyze_action(
    action: str,
    elements: list[dict],
    message: str = "",
    job_description: str = "",
    page_size: dict | None = None,
) -> dict:
    text = _extract_text(elements)

    dispatchers = {
        "rating":          lambda: _rate_cv(text, elements),
        "design_rating":   lambda: _rate_design(elements),
        "position_rating": lambda: _rate_position(text, job_description),
        "grammar":         lambda: _fix_grammar(elements),
        "language":        lambda: _check_style(text, elements),
        "improve":         lambda: _improve_content(elements),
        "ats_score":       lambda: _ats_score(text),
        "chat":            lambda: _chat(message, elements, page_size),
        "layout":          lambda: _analyze_layout(elements, page_size),
    }

    fn = dispatchers.get(action)
    if fn is None:
        return {
            "message": f"Nieznana akcja: {action}",
            "rating": None,
            "tips": [],
            "corrections": [],
            "web_sources": [],
        }
    return fn()
