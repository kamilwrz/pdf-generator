# Wielojęzyczne korekty AI — projekt

**Data:** 2026-08-18
**Status:** Zatwierdzony do planu implementacji
**Obszar:** `backend/app/services/ai_assistant_service.py`, `backend/app/api/routes/ai_assistant.py`, `frontend/src/components/ai/AiAssistant/`

---

## 1. Problem

Aplikacja jest skierowana na rynek polski, ale użytkownik może posiadać CV
w języku angielskim lub niemieckim (a docelowo także francuskim, hiszpańskim,
ukraińskim, włoskim, niderlandzkim). Obecnie **wszystkie** akcje AI edytujące
treść zwracają korekty po polsku, niezależnie od języka wejściowego CV. Efekt:
angielskie lub niemieckie CV po kliknięciu „Popraw", „Skróć" czy „Popraw
gramatykę" otrzymuje treść przetłumaczoną/przeredagowaną na polski, co niszczy
dokument użytkownika.

### Przyczyna w kodzie (stan obecny)

W `backend/app/services/ai_assistant_service.py` cztery handlery edytujące treść
mają zaszyte na sztywno polecenie zwracania treści po polsku:

- `_fix_grammar` (akcja `grammar`) — „content poprawek (…) zwracaj po polsku".
- `_check_style` (akcja `language`) — „content poprawek (…) po polsku".
- `_improve_content` (akcja `improve`) — „content poprawek (…) po polsku".
- `_shorten_content` (akcja `shorten`) — „wartości tekstowe (…) po polsku".

Dodatkowo:

- Detektor `_detect_language_mix` jest **binarny PL/EN** i traktuje mieszankę
  języków wyłącznie jako błąd do zgłoszenia, sugerując ujednolicenie do języka
  nagłówków szablonu (zwykle polskiego). Nie obsługuje niemieckiego ani innych.
- `_TENSE_RULES_PL` zawiera przykłady polskich czasowników
  (Tworzę/Tworzyłem), więc nawet gdyby model dostał polecenie pisania po
  angielsku, przykłady sugerowałyby polszczyznę.
- Jedyna akcja szanująca język docelowy to `_translate_cv` (akcja `translate`),
  ponieważ język wybiera ręcznie użytkownik. Parametr `target_language` jest już
  przenoszony przez `analyze_action`, ale używa go tylko `translate`.

---

## 2. Decyzje produktowe (zatwierdzone)

1. **Zakres języków:** te same 8 kodów co akcja tłumaczenia —
   `pl, en, de, fr, es, uk, it, nl`. Spójność z istniejącym
   `TRANSLATE_LANGUAGES` w `routes/ai_assistant.py`.
2. **Język porad:** treść korekt (`corrections[].content`) w języku CV; pola
   `message`, `tips`, `priorities`, `strengths` pozostają **po polsku**
   (aplikacja na rynek PL — użytkownik czyta rady po polsku).
3. **CV mieszane:** przy niespójności nagłówki/treść wygrywa **język dominującej
   treści (body)**. Niespójność nagłówków nadal jest zgłaszana jako uwaga
   w ratingu, ale korekta treści nie tłumaczy treści użytkownika wbrew niemu.
4. **Nadpisanie:** domyślnie automatyczna detekcja, z możliwością ręcznego
   nadpisania przez selektor w UI (na wypadek błędnej detekcji).

---

## 3. Podejście

Hybryda: **deterministyczny detektor (źródło prawdy) + instrukcja w promcie**.

- Deterministyczny `_detect_cv_language` liczy sygnatury językowe treści body
  i zwraca dominujący kod języka. Jest w pełni testowalny, nie kosztuje
  dodatkowego wywołania API i dostarcza konkretny **default dla selektora UI**.
- Wykryty (lub ręcznie nadpisany) kod jest wstrzykiwany jako jawna instrukcja
  do promptów akcji treściowych; prompt dodatkowo poleca modelowi respektować
  ten język (biegłość natywna dla fr/es/it).

Odrzucone: biblioteka `lingua-py` (nowa, ciężka zależność — nadmiarowa przy
8 znanych językach; pozostaje jako opcjonalny upgrade odporności, jeśli
heurystyka okaże się niewystarczająca). Odrzucona też czysta detekcja modelem
(niedeterministyczna, brak twardego sygnału do defaultu selektora, trudna
w testach).

---

## 4. Architektura i jednostki

### 4.1 Detektor języka — `_detect_cv_language(elements) -> dict`

Nowa funkcja w `ai_assistant_service.py`.

- **Wejście:** lista elementów kanwy (jak pozostałe akcje).
- **Wyjście:** słownik
  `{"code": str, "confidence": float, "body_lang": str, "header_lang": str | None, "is_mixed": bool}`.
- **Logika:**
  1. Zbiera fragmenty treści body i etykiety nagłówków, korzystając z tego
     samego wydzielania co `_detect_language_mix` (wspólny helper do wyodrębnienia
     „headers" i „body_chunks", żeby uniknąć duplikacji).
  2. Punktuje `body_text` sygnaturami dla 8 języków: zestawy stopwordów +
     charakterystyczne diakrytyki. Cyrylica ⇒ `uk`.
  3. **Body wygrywa:** `code` = język o najwyższym wyniku dla treści body.
  4. `is_mixed = header_lang is not None and header_lang != body_lang`.
  5. **Fallback:** przy zbyt małej ilości tekstu lub niskiej pewności `code`
     przyjmuje `"pl"` (domyślny rynek). `confidence` odzwierciedla margines nad
     drugim najlepszym językiem.
- **Utrzymanie:** sygnatury (stopwordy/diakrytyki) trzymane w module jako stałe,
  analogicznie do istniejących `_PL_LEXICAL_RE`, `_EN_LEXICAL_RE`.

### 4.2 Helper dyrektywy językowej — `_content_language_directive(lang_code) -> str`

Zwraca blok promptu: „Pole `content` w `corrections` zwracaj w języku
{nazwa języka}. Pola `message`, `tips`, `priorities` zwracaj **po polsku**."
Zastępuje zaszyte na sztywno „content (…) po polsku" **tylko dla pola content**
w czterech handlerach. Mapa kodów → nazw rozszerza istniejące
`_TRANSLATE_LANGUAGE_NAMES` (już zawiera 8 języków).

### 4.3 Reguły czasu gramatycznego — `_tense_rules_for(lang_code) -> str`

- Dla `pl`: obecne `_TENSE_RULES_PL` (polskie przykłady czasowników).
- Dla pozostałych: wariant językowo-neutralny opisujący regułę bez przykładów
  w konkretnym języku („zakończone role = czas przeszły, aktualne = teraźniejszy;
  zachowaj oryginalną osobę gramatyczną"). Zapobiega narzucaniu polszczyzny.

### 4.4 Reconcile `_detect_language_mix`

- Pozostaje dla akcji ratingowych (zgłaszanie niespójności jest wartościowe).
- Zmiana: cel ujednolicenia w polach `fix` / `priority_description` /
  `message_sentence` wskazuje **dominujący język body**, a nie zawsze polski.
- Rozszerzenie z binarnego PL/EN do korzystania z wyniku `_detect_cv_language`,
  aby komunikaty były spójne z wykrytym językiem (np. „przetłumacz nagłówki na
  angielski", gdy body jest EN).

### 4.5 Warstwa akcji — `analyze_action`

- Nowy parametr `cv_language: str = ""` (ręczne nadpisanie).
- Jeśli puste ⇒ `_detect_cv_language(elements)` ustala język.
- Wykryty/użyty kod przekazywany do `_fix_grammar`, `_check_style`,
  `_improve_content`, `_shorten_content` (nowy parametr `language_code`).
- Zwracany kod dołączany do wyniku jako `cv_language`, by UI odzwierciedliło
  selektor.
- Akcje ratingowe i `translate` **nie** zmieniają zachowania (rating: porady po
  polsku; translate: język wybiera użytkownik).

### 4.6 API — `routes/ai_assistant.py`

- `AssistantRequest`: nowe pole `cv_language: str = ""` (opcjonalne nadpisanie).
- Walidacja: jeśli podane, musi należeć do tej samej listy 8 kodów co
  `TRANSLATE_LANGUAGES` (wydzielić wspólną stałą, np. `SUPPORTED_LANGUAGES`,
  aby nie duplikować).
- `AssistantResponse`: nowe pole `cv_language: str = ""` (język użyty do korekt).
- Przekazanie `cv_language` do `analyze_action`.

### 4.7 Frontend — `AiAssistant.jsx`

- Selektor języka CV (8 opcji), domyślnie ustawiony na `cv_language` z ostatniej
  odpowiedzi (wykryty). Do czasu pierwszej odpowiedzi — bez wymuszania wartości
  (backend wykryje sam).
- Wysyłanie `cv_language` w POST tylko gdy użytkownik nadpisał ręcznie.
- Wyświetlenie wykrytego języka, aby użytkownik wiedział, w jakim języku
  powstaną korekty.
- Zgodność z `DESIGN.md` (selektor jak pozostałe inputy: label nad polem, ostre
  krawędzie, focus ring).

---

## 5. Przepływ danych

```
Użytkownik klika „Popraw" (improve)
  → POST /ai/assistant { action, elements, cv_language? }
     → route: walidacja cv_language (jeśli podane)
        → analyze_action:
             cv_language puste? → _detect_cv_language(elements) → code
             _improve_content(elements, language_code=code)
                → prompt: content w języku {code}, message/tips po polsku
                → _tense_rules_for(code)
             wynik.cv_language = code
     → response { corrections (treść w języku CV), message (PL), cv_language }
  → UI: selektor pokazuje wykryty język; karty Przed/Po w języku CV
```

---

## 6. Obsługa błędów i przypadki brzegowe

- **Krótkie CV / brak treści:** detektor zwraca `pl` (fallback rynkowy) z niską
  pewnością; korekty po polsku. Bezpieczne dla dominującej grupy użytkowników.
- **Mieszanka nagłówki/treść:** korekta w języku body; rating nadal zgłasza
  niespójność (Faza 2).
- **Nieobsługiwany `cv_language` w request:** 400 z komunikatem po polsku (jak
  istniejąca walidacja `translate`).
- **Nierozpoznany język body (poza 8):** fallback do `pl`; nie blokujemy akcji.
- Awarie providera nadal przez `AIServiceError` → istniejący handler w `main.py`.

---

## 7. Testy

- `_detect_cv_language`: EN→en, DE→de, PL→pl, cyrylica→uk, mieszane
  (PL nagłówki + EN body)→en, krótki tekst→pl (fallback).
- Akcje treściowe: dla wstrzykniętego `language_code` prompt zawiera dyrektywę
  „content w języku X"; `message` pozostaje po polsku (asercja na budowie
  promptu, bez realnego wywołania OpenAI — wzorem istniejących testów w
  `backend/tests/test_ai_*`).
- `_tense_rules_for`: pl → wariant PL; en/de → wariant neutralny bez polskich
  czasowników.
- Route: `cv_language` spoza listy → 400; poprawny → przekazany do
  `analyze_action`; response zawiera `cv_language`.
- Reconcile: `_detect_language_mix` przy body EN sugeruje ujednolicenie do EN.

Istniejące testy `test_ai_chat_command.py`, `test_ai_assistant_exception_handling.py`
nie mogą regresować.

---

## 8. Roadmapa (fazy)

| Faza | Zakres | Warstwa | Wartość |
|------|--------|---------|---------|
| 0 | `_detect_cv_language` (8 języków, body-wins, cyrylica, fallback) + testy | backend | Rdzeń detekcji |
| 1 | `_content_language_directive` + `_tense_rules_for`; podpięcie do grammar/style/improve/shorten; auto-detekcja jako default; testy per-akcja | backend | **Główna wartość: korekty w języku CV** |
| 2 | Reconcile `_detect_language_mix` → dominujący body-lang; testy | backend | Spójny rating |
| 3 | `cv_language` override w request + echo w response; walidacja w route | API | Kontrakt nadpisania |
| 4 | Selektor języka w `AiAssistant.jsx` (default = wykryty) | frontend | UX nadpisania |
| 5 | README (PL+EN), regen `docs/PROMPTS.md`, brzegi | docs | Zgodność z regułami repo |

Fazy 0–3 to backend; wartość produktowa dostarcza już Faza 1 (auto-detekcja bez
UI). Faza 4 dokłada ręczne nadpisanie. Każda faza jest niezależnie wdrażalna.

---

## 9. Poza zakresem (YAGNI)

- Detekcja języka per-element (mieszane akapity w jednym elemencie) — działamy
  na poziomie dokumentu.
- Automatyczne tłumaczenie nagłówków przy niespójności — to nadal osobna akcja
  `translate` uruchamiana świadomie przez użytkownika.
- Wprowadzanie `lingua-py` — dopiero jeśli heurystyka okaże się niewystarczająca.
- Zmiana języka porad (`message`/`tips`) — świadomie zostają po polsku.

---

## 10. Zgodność z regułami repozytorium

- Po zmianie kodu: aktualizacja `README.md` (wersje EN i PL), sekcje Features
  i Technologies, regeneracja `docs/PROMPTS.md` przez
  `scripts/generate_prompts_md.py` (jeśli obejmuje prompty AI).
- Komentarze w kodzie po angielsku, opisujące „dlaczego" (reguła biznesowa
  detekcji języka, założenie „body wygrywa", fallback do PL).
- UI zgodne z `DESIGN.md`.
