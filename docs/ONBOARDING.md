# English

## Scope and activation

This audit covers CV Studio's self-service path from landing to the first PDF containing the visitor's own CV. It uses code inspection and local browser tests, not production funnel data. Successful activation means the generated file is handed to the browser; the app cannot verify whether a person opens or submits it afterward.

## Findings and implementation

| Finding | Likely impact | Implemented response | Priority |
| --- | --- | --- | --- |
| The landing template selection was followed by another start confirmation. | An extra decision before writing anything. | A guest without a browser draft starts the selected Free template immediately. Existing drafts retain replacement consent; other entries keep optional setup. | High |
| Successful registration led to a separate login form. | Repeated credentials entry interrupted progress. | Attempt login after registration with the in-memory credentials; a token failure offers login with a truthful account-created message. | High |
| Download intent was lost during authentication. | The visitor returned to generic draft recovery and had to locate Download again. | Preserve `start=download`; the ownership action explicitly confirms the draft and requests one PDF after restoring state. | High |
| Registration put plan comparison before the form on compact screens. | More scrolling and unrelated choices before the first export. | Shared form-first authentication layout; the download path uses Free without plan tabs. Ordinary registration retains plan selection. | Medium |
| Template onboarding could reopen after recovering a populated draft. | The already-created document was interrupted by a start screen. | Do not auto-open templates for populated canvases; mark onboarding seen on an explicit claim. | High |

The minimum path is now: **choose template → edit CV → request PDF → authenticate → confirm ownership and download**. No tour, email sequence, or additional checklist blocks the editor. Existing field guidance and focus on the name provide the first concrete action. Advanced configuration remains optional in setup and available through editor controls.

## Affected surfaces and states

- Landing selection → NewCvSetupModal: valid Free, invalid/paid hints, existing draft, pending generation, image failure, generation failure/manual retry, and initial name focus. The same configuration owns default fields and sections.
- SaveGateModal: download/import/save copy, primary focus, keyboard activation, cancel/Escape, and preserved auth intent. The download action flushes current guest edits before navigation.
- Register/Login: default Free and optional ordinary plan selection, input focus and labels, disabled/pending submit, API error, successful registration, failed automatic login, and return intent. Both use shared global tokens through AuthLayout.module.css.
- ClaimGuestDocumentModal: named local draft, ownership-and-download or ordinary load, explicit delete, safe dismissal, and primary focus. Authentication alone never claims data or starts export.
- Editor output: restored document scope, one export, server quota rejection, retry, browser handoff, success feedback, and separation from saving. UI elements do not enter the PDF payload.
- Responsive coverage: compact, tablet, laptop, wide, reduced motion and a 200% zoom-equivalent viewport; keyboard order and horizontal overflow checks.

## Recovery and boundaries

Automatic starter creation runs once; failure exposes a manual retry with the selected template retained. A failed registration retains fields. A successful registration followed by failed login never repeats account creation or persists the password. Dismissing ownership retains the browser draft. Confirming ownership restores the editable canvas; if export fails, Download can be explicitly retried. No backend schema, pricing quota, account-ownership rule, PDF rendering algorithm, or email behavior was changed.

## Measurement proposal — not implemented

Compare cohorts before and after release using: landing CTA → successful starter creation → first meaningful edit → registration completion → confirmed first PDF handoff. Existing events include `hero_new_cv`, `new_cv_created`, `guest_first_edit`, `register_completed`, and `guest_doc_claimed`; they are not sufficient on their own to prove a complete anonymous-to-authenticated funnel or a downloaded file. A later analytics change should define consent, deduplication, session/account linking, and a handoff event without CV content.

Primary measures: percentage reaching first PDF and median elapsed time from creation to handoff. Guardrails: registration errors, failed exports, repeated exports, and abandoned recovery prompts. No numeric uplift is claimed without observed production data. There is no new tracking provider or automatic email in this change.

See [README](../README.md) for implementation locations, commands and current limitations.

---

# Polski

## Zakres i aktywacja

Audyt obejmuje samodzielną drogę użytkownika CV Studio od landingu do pierwszego PDF z własną treścią CV. Opiera się na kodzie i lokalnych testach przeglądarkowych, nie na produkcyjnych danych lejka. Aktywacja oznacza przekazanie wygenerowanego pliku przeglądarce; aplikacja nie może sprawdzić, czy użytkownik później go otworzy lub wyśle.

## Ustalenia i wdrożenie

| Ustalenie | Prawdopodobny skutek | Wdrożona odpowiedź | Priorytet |
| --- | --- | --- | --- |
| Po wybraniu szablonu na landingu trzeba było jeszcze potwierdzić start. | Dodatkowa decyzja przed wpisaniem treści. | Gość bez lokalnego szkicu od razu rozpoczyna wybrany darmowy szablon. Istniejący szkic nadal wymaga zgody na zastąpienie; pozostałe wejścia zachowują opcjonalną konfigurację. | Wysoki |
| Udana rejestracja prowadziła do osobnego formularza logowania. | Powtórne wpisywanie danych przerywało pracę. | Próba logowania po rejestracji z danymi w pamięci; błąd tokenu prowadzi do logowania z prawdziwym komunikatem o utworzonym koncie. | Wysoki |
| Intencja pobrania ginęła przy uwierzytelnieniu. | Powrót do ogólnego odzyskiwania szkicu i szukanie przycisku pobierania. | Zachowanie `start=download`; akcja własności jawnie potwierdza szkic i zamawia jeden PDF po odtworzeniu stanu. | Wysoki |
| Na małym ekranie porównanie planów poprzedzało formularz. | Więcej przewijania i pobocznych wyborów przed pierwszym eksportem. | Wspólny układ z formularzem na początku; ścieżka pobierania wybiera Free bez zakładek planów. Zwykła rejestracja zachowuje wybór planu. | Średni |
| Onboarding szablonów mógł otworzyć się po odzyskaniu wypełnionego szkicu. | Gotowy już dokument był przysłaniany ekranem startu. | Brak automatycznego otwierania galerii nad wypełnionym płótnem; jawne przejęcie oznacza onboarding jako wyświetlony. | Wysoki |

Minimalna ścieżka to teraz: **wybór szablonu → edycja CV → żądanie PDF → uwierzytelnienie → potwierdzenie własności i pobranie**. Żaden samouczek, sekwencja mailowa ani dodatkowa checklista nie blokuje edytora. Istniejące podpowiedzi pól i fokus na imieniu wskazują pierwszą konkretną czynność. Zaawansowana konfiguracja pozostaje opcjonalna w ustawieniach i dostępna przez kontrolki edytora.

## Dotknięte powierzchnie i stany

- Wybór na landingu → NewCvSetupModal: poprawny Free, błędny/płatny parametr, istniejący szkic, oczekiwanie, błąd obrazu, błąd tworzenia/ręczne ponowienie i początkowy fokus imienia. Ta sama konfiguracja odpowiada za domyślne pola i sekcje.
- SaveGateModal: treść pobrania/importu/zapisu, fokus głównej akcji, klawiatura, anulowanie/Escape i zachowanie intencji auth. Pobieranie utrwala aktualne zmiany gościa przed nawigacją.
- Register/Login: domyślny Free i opcjonalny zwykły wybór planu, fokus i etykiety, blokada/oczekiwanie, błąd API, sukces rejestracji, błąd automatycznego logowania i intencja powrotu. Obie trasy korzystają z globalnych tokenów przez AuthLayout.module.css.
- ClaimGuestDocumentModal: nazwany szkic, potwierdzenie z pobraniem lub zwykłe wczytanie, jawne usunięcie, bezpieczne zamknięcie i fokus głównej akcji. Samo uwierzytelnienie nigdy nie przejmuje danych ani nie eksportuje.
- Eksport: odtworzony kontekst dokumentu, jeden eksport, odrzucenie limitu, ponowienie, przekazanie przeglądarce, komunikat sukcesu i rozdzielenie od zapisu. Elementy UI nie trafiają do payloadu PDF.
- Responsywność: mały ekran, tablet, laptop, szeroki ekran, ograniczony ruch i viewport odpowiadający zoomowi 200%; kontrola klawiatury i poziomego przepełnienia.

## Odzyskiwanie i granice

Automatyczne tworzenie startuje raz; błąd udostępnia ręczne ponowienie z zachowanym szablonem. Błąd rejestracji zachowuje pola. Udana rejestracja zakończona błędem logowania nie ponawia tworzenia konta ani nie utrwala hasła. Zamknięcie potwierdzenia własności zachowuje szkic przeglądarki. Potwierdzenie odtwarza edytowalne płótno; po błędzie eksportu można jawnie ponowić Pobierz PDF. Nie zmieniono schematu bazy, limitów planów, reguł własności konta, algorytmu renderowania PDF ani zachowania maili.

## Propozycja pomiaru — niewdrożona

Porównanie kohort przed i po publikacji: CTA landingu → udane utworzenie CV → pierwsza znacząca edycja → zakończenie rejestracji → potwierdzone pierwsze przekazanie PDF. Istnieją zdarzenia `hero_new_cv`, `new_cv_created`, `guest_first_edit`, `register_completed` i `guest_doc_claimed`; same nie dowodzą kompletnego lejka anonimowy–zalogowany ani pobrania pliku. Osobna zmiana analityczna powinna określić zgodę, deduplikację, powiązanie sesji/konta oraz zdarzenie przekazania pliku bez treści CV.

Główne miary: odsetek docierający do pierwszego PDF i mediana czasu od utworzenia do przekazania pliku. Miary ochronne: błędy rejestracji, nieudane eksporty, powtórne eksporty i porzucone potwierdzenia odzyskiwania. Nie deklarujemy liczbowego wzrostu bez danych produkcyjnych. Zmiana nie dodaje dostawcy analityki ani automatycznych maili.

Pliki implementacji, polecenia i bieżące ograniczenia opisuje [README](../README.md).
