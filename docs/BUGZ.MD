# Rejestr zweryfikowanych błędów CV Studio

Stan na 2026-09-01. Każdy historyczny wpis ma jeden z trzech statusów:

- **NAPRAWIONY** — zachowanie jest poprawione i ma wskazany test regresyjny;
- **ODTWORZONY** — problem jest potwierdzony i chroniony testem oczekującym na naprawę;
- **NIEAKTUALNY** — wymaganie zostało świadomie zastąpione aktualnym kontraktem produktu.

## 1. Linie orientacyjne zakłócają przeciąganie — NAPRAWIONY

Prowadnice są nieinteraktywne (`pointer-events: none`), więc nie przejmują
wskaźnika podczas ruchu elementu. Dowody: `frontend/src/components/canvas/Guides/Guides.module.css`
oraz `frontend/src/utils/spacingGuides.test.js`.

## 2. Textarea nie dopasowuje wysokości — NAPRAWIONY

Pomiar i reflow reagują także na zmianę treści/stylu przez AI; usuwane są też
końcowe puste wiersze list. Dowody: `frontend/src/utils/textareaHeight.test.js`
i `frontend/src/utils/textareaReflow.test.js`.

## 3. Przenoszenie elementów między stronami — NAPRAWIONY

Przeciąganie korzysta z globalnych `pointermove`, `pointerup` i `pointercancel`
oraz zachowuje capture niezależnie od panelu edycji. Dowody:
`frontend/src/hooks/useElementSelectionDrag.js` i `frontend/src/hooks/useA4Elements.test.js`.

## 4. Brak prowadnic X/Y i niespójny long-press — NAPRAWIONY

Prowadnice osi oraz zachowanie przy przytrzymaniu tekstu są wspólne dla typów
elementów. Dowody: `frontend/src/utils/textSpacingHold.test.js` oraz
`frontend/src/utils/spacingGuides.test.js`.

## 5. Pobieranie CV — NIEAKTUALNY / NAPRAWIONY

Historyczny wymóg „bez toastu” został zastąpiony przez kontrakt informacji o
powodzeniu/błędzie eksportu z `DESIGN.md`. Sam download rozpoczyna się
bezpośrednio po kliknięciu przez `triggerBlobDownload`. Dowód end-to-end:
`frontend/e2e/editor-smoke.spec.js`.

## 6. „Moje dokumenty” resetuje stan albo pobiera inny plik — NAPRAWIONY

Sesja dokumentu ma niezależne `sessionKey`, `epoch` i rewizję; opóźniony wynik
A → B → A nie może zatwierdzić się w innym dokumencie. Otwieranie, zapis i
pobieranie zachowują właściwy `pdf_id`. Dowody:
`frontend/src/utils/documentLifecycleGuards.test.js` oraz
`frontend/e2e/editor-smoke.spec.js`.

## 7. Opóźnione logowanie po uśpieniu Render — NAPRAWIONY

Login budzi tani `/health`, stosuje ograniczony retry i długi timeout, a ruch DB
jest dopuszczany dopiero po gotowości `/ready`. Dowody:
`frontend/src/services/api.test.js` i `backend/tests/test_readiness.py`.

## 8. Zaznaczanie tła, ramek i raila — NAPRAWIONY

Elementy dekoracyjne `fixedToPage` są zablokowane przed selekcją i edycją.
Dowód: `frontend/src/utils/elementInteraction.test.js`.

## 9. Wiele uploadów obrazów układa się diagonalnie — NAPRAWIONY

Nowe obrazy startują w stałym położeniu zamiast otrzymywać offset zależny od
indeksu, a galeria pozostaje przytwierdzona do viewportu. Dowód:
`frontend/src/utils/a4ElementFactories.test.js`.

## 10. Chat AI odpowiada poza zakresem CV — NAPRAWIONY

Backend wymaga klasyfikacji `in_scope` i odmawia realizacji poleceń niezwiązanych
z CV. Dowód: `backend/tests/test_ai_chat_command.py`.

## 11. Modal pobierania przy widoku dwóch stron — NAPRAWIONY

Wspólny `DialogShell` renderuje portal do `body` i pełnoekranowy backdrop,
niezależnie od liczby stron canvasa. Dowód:
`frontend/src/components/common/DialogShell/DialogShell.jsx`.

## 12. Pasek postępu wielu obrazów — NAPRAWIONY

Upload batcha ma jeden wspólny licznik/progres i poprawną polską odmianę liczby
plików. Dowód: `frontend/src/utils/polishUploadMessage.test.js`.

## 13. Fonty w selekcie panelu edycji — NAPRAWIONY

Select i każda opcja korzystają z odpowiadającego im stosu fontów. Dowód:
`frontend/src/utils/canvasFont.test.js`.

## 14. Szablony sidebarowe i kolor edukacji — NIEAKTUALNY / NAPRAWIONY

Wymóg „sidebar zawsze na jednej stronie” jest nieaktualny: aktualny produkt
obsługuje czytelne CV wielostronicowe i poprawną kontynuację raila. Klasyfikację
sekcji sidebar/main chroni `frontend/src/templates/sidebarSections.test.js`.
Niespójny kolor treści wykształcenia został naprawiony; regresję pokrywa
`backend/tests/test_cv_template_layouts.py`.

## 15. Usunięcie i ponowne dodanie kategorii umiejętności — NAPRAWIONY

Regresja pętli aktualizacji zamknięta w commitach `5d562ea` i `a8a70d3` pozostaje
naprawiona. Testy jednostkowe pokrywają zachowanie tombstone i zbieżność
synchronizacji w `frontend/src/utils/syncCvDataFromCanvas.test.js`. Chromium E2E
usuwa kategorię rzeczywistymi kontrolkami edytora, cofa operację i po kolejnym
cyklu efektu ponownie sprawdza responsywność w
`frontend/e2e/editor-smoke.spec.js`; izolowany harness Error Boundary pozostaje
w `frontend/e2e/regression-harness.spec.js`.

Obecnie nie ma wpisów ze statusem **ODTWORZONY** bez wdrożonej naprawy.
