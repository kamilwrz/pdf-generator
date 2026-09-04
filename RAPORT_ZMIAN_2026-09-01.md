# Raport zmian: bezpieczeństwo, niezawodność i przygotowanie produkcyjne

Data raportu: 2026-09-01

Zakres commitów:

- `c070cd5` — `Implement security and reliability remediation`
- `7d92db4` — `Fix Render deployment URL wiring`
- punkt odniesienia: `a8a70d3` — stan `main` przed tym pakietem zmian

## 1. Podsumowanie

Zmiany nie były pojedynczym refaktorem kosmetycznym. Ich celem było przekształcenie działającej aplikacji CV Studio w system, który można wdrażać i utrzymywać bez polegania na niejawnych ustawieniach, przypadkowej kolejności operacji lub ręcznym sprawdzaniu najważniejszych ścieżek.

Najważniejsze rezultaty:

1. Uszczelniono uwierzytelnianie, autoryzację, limity, ścieżki plików i obsługę sekretów.
2. Zmieniono zapis PDF-ów i zdjęć tak, aby błąd bazy, S3 albo renderera nie pozostawiał uszkodzonego dokumentu jako aktualnej wersji.
3. Dodano kontrolowane migracje bazy i zgodność z poprzednią wersją aplikacji podczas wdrożenia kroczącego.
4. Rozdzielono liveness (`/health`) od rzeczywistej gotowości (`/ready`).
5. Dodano deklaratywną konfigurację Render, pre-deploy migrations i worker sprzątający storage.
6. Uporządkowano stan dokumentu po stronie Reacta, ochronę przed utratą zmian, obsługę konfliktów oraz odzyskiwanie UI po błędzie.
7. Dodano brakujące warstwy testów: PostgreSQL, runtime React, Playwright, testy awarii storage, testy konkurencji i automatyczne wykrywanie wszystkich testów.
8. Rozbudowano CI o lint, build, budżety bundla, audyty zależności, secret scan i CodeQL.

To jest zmiana przygotowująca aplikację do bezpieczniejszego wdrażania produkcyjnego, a nie dodanie jednej funkcji widocznej w interfejsie.

## 2. Rzeczywisty rozmiar zmian

Między `a8a70d3` a `7d92db4` zmieniono:

- 196 plików;
- 20 434 dodane linie;
- 2 183 usunięte linie.

Wskazane „około 6000 linii” odpowiada w przybliżeniu całemu przyrostowi frontendu (`+5535`), ale pełny zakres jest większy. Duża część nowych linii to regresyjne testy, migracje, CI i dokumentacja, a nie kod wykonywany w produkcji.

| Kategoria | Pliki | Dodano | Usunięto | Znaczenie |
|---|---:|---:|---:|---|
| Testy | 66 | 7 856 | 125 | Pokrycie awarii, konkurencji, bezpieczeństwa, runtime React i E2E |
| Backend produkcyjny | 33 | 5 420 | 843 | Storage V2, auth, limity, readiness, AI i spójność dokumentów |
| Frontend produkcyjny | 63 | 2 516 | 879 | Lifecycle dokumentu, recovery, lazy loading i obsługa konfliktów |
| Konfiguracja i zależności | 11 | 1 554 | 64 | Lockfile, manifest Render, narzędzia testowe i build |
| Dokumentacja | 7 | 1 539 | 248 | README EN/PL, plan remediacji, roadmapa i zasady wdrożenia |
| Migracje bazy | 7 | 1 028 | 0 | Addytywne zmiany schematu 0009–0015 |
| CI/CD | 4 | 372 | 6 | Pipeline jakości, PostgreSQL, Playwright, sekrety i CodeQL |
| Pozostałe | 5 | 149 | 18 | Schemat współdzielony i pliki pomocnicze |

## 3. Dlaczego ten pakiet zmian był potrzebny

Audyt przed refaktorem wykazał kilka klas ryzyka:

- frontendowy runner nie odnajdywał wszystkich istniejących testów, więc CI mógł być zielony mimo pominięcia regresji;
- `/health` mógł zwrócić sukces, gdy baza lub inicjalizacja aplikacji nie były gotowe;
- nazwa użytkownika i tytuł dokumentu uczestniczyły w budowaniu ścieżek storage, co zwiększało ryzyko path traversal i konfliktów nazw;
- zapis bazy i zapis pliku/S3 nie miały wspólnego protokołu kompensacji;
- produkcyjny frontend mógł bez jawnej konfiguracji połączyć się z niewłaściwym API;
- reset administracyjny mógł korzystać ze zbyt szerokiego fallbacku sekretu;
- synchroniczne operacje SQLAlchemy, S3, filesystem i ReportLab mogły blokować event loop;
- frontend nie miał produkcyjnego Error Boundary ani pełnych testów runtime/E2E;
- jeden szeroki React Context powodował duży promień zmian i niepotrzebne renderowanie;
- konfiguracja Render nie była wcześniej kompletnym, wersjonowanym kontraktem repozytorium.

Zmiany odpowiadają bezpośrednio na te problemy.

## 4. CI i automatyczna kontrola jakości

### Co zrobiono

- Runner `frontend/scripts/run-tests.mjs` wykrywa rekurencyjnie wszystkie `frontend/src/**/*.test.js`.
- Lista testów jest sortowana deterministycznie, sprawdzana pod kątem duplikatów i pustego wyniku.
- Dodano tryb `npm test -- --list`, dzięki któremu CI może porównać wykryte testy z niezależnym inventory repozytorium.
- Dodano Vitest i React Testing Library dla testów wymagających DOM i prawdziwego lifecycle Reacta.
- Dodano Playwright smoke tests dla desktopu i reprezentatywnego viewportu mobilnego.
- CI wykonuje backend tests, osobne kontrakty PostgreSQL 16, frontend unit/runtime, lint, build, bundle budget i E2E.
- Dodano `pip check`, `pip-audit`, produkcyjny `npm audit`, gitleaks oraz CodeQL.
- Dodano walidację linków dokumentacji i struktury pełnych wersji EN/PL.
- Uprawnienia workflow ograniczono do minimalnego odczytu repozytorium.

### Dlaczego

Wcześniejszy runner miał ręcznie wpisane katalogi. Nowy test umieszczony poza tą listą nie uruchamiał się, mimo że plik był śledzony przez Git. Rekurencyjne inventory usuwa tę klasę fałszywie zielonych wyników.

Oddzielne testy PostgreSQL są konieczne, ponieważ SQLite nie odtwarza blokad, UPSERT-ów, triggerów i zachowania transakcji produkcyjnej bazy. Playwright uzupełnia testy jednostkowe o rzeczywiste przejścia użytkownika i współpracę wielu komponentów.

### Główne pliki

- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/scripts/check_documentation.py`
- `.github/scripts/enforce_sarif_severity.py`
- `frontend/scripts/run-tests.mjs`
- `frontend/scripts/check-bundle-budget.mjs`
- `frontend/playwright.config.js`
- `frontend/e2e/`

## 5. Bezpieczne ścieżki i Storage V2

### Co zrobiono

- Nowe PDF-y i zdjęcia otrzymują nieprzewidywalne albo serwerowo wyznaczane klucze storage.
- Tytuł CV i username pozostały danymi wyświetlanymi, ale nie są już traktowane jako zaufana ścieżka pliku.
- Każda lokalna ścieżka jest rozwiązywana do postaci absolutnej i sprawdzana, czy nadal znajduje się pod dozwolonym katalogiem głównym.
- Walidowane są klucze S3, właściciel obiektu, rozszerzenia i typ storage.
- Stare rekordy mają kontrolowany tryb dual-read. Migracja schematu nie przenosi bajtów plików, ponieważ operacja na zewnętrznym storage wewnątrz migracji byłaby trudna do wycofania.
- Nowy dokument jest najpierw renderowany do pamięci lub pliku tymczasowego, a dopiero później publikowany jako wersja finalna.
- Lokalna publikacja używa atomowego `os.replace`.
- S3 używa wersjonowanych kluczy, więc nieudana aktualizacja nie nadpisuje obiektu wskazywanego przez ostatni poprawny rekord bazy.
- Stare obiekty są usuwane po udanym przełączeniu wskaźnika, a nie przed nim.

### Dlaczego

Najważniejsza reguła brzmi: widoczny rekord dokumentu nie może wskazywać na brakujący lub częściowo zapisany plik. Jeżeli render, upload albo commit bazy kończy się błędem, użytkownik nadal powinien móc pobrać poprzednią poprawną wersję.

Oddzielenie etykiety użytkownika od klucza storage zamyka również ryzyka typu `../`, ścieżek absolutnych, separatorów Windows/POSIX i konfliktów po zmianie tytułu.

### Główne pliki

- `backend/app/services/pdf_storage.py`
- `backend/app/services/image_storage.py`
- `backend/app/services/document_service.py`
- `backend/app/utils/image_src_to_path.py`
- `backend/app/utils/pdf_file_ops.py`
- `backend/tests/test_pdf_storage_v2.py`
- `backend/tests/test_generated_pdf_privacy.py`
- `backend/tests/test_s3_storage_privacy.py`

## 6. Spójność bazy i storage oraz cleanup outbox

### Co zrobiono

- Operacje create/update/delete mają jawny protokół publikacji, commitowania i kompensacji.
- Nieudany zapis nowego obiektu uruchamia próbę natychmiastowego cleanupu.
- Jeżeli cleanup również się nie uda, zapisywany jest trwały `storage_cleanup_job`.
- Job ma typ zasobu, liczbę prób, termin kolejnej próby, bezpieczne metadane błędu i stan `dead_letter` po wyczerpaniu limitu.
- Worker `storage_cleanup_worker.py` pobiera ograniczoną partię zadań i kończy proces. Render uruchamia go cyklicznie.
- Delete jest idempotentny: ponowienie nie powinno tworzyć kolejnego błędu biznesowego, jeżeli obiekt został już usunięty.

### Dlaczego

Baza i S3/filesystem nie uczestniczą w jednej transakcji ACID. Bez kompensacji możliwe były dwa niebezpieczne stany:

1. baza wskazuje plik, którego nie ma;
2. plik istnieje, ale żaden rekord bazy już go nie wskazuje.

Pierwszy stan psuje dokument użytkownika. Drugi powoduje wyciek storage i potencjalnie danych osobowych. Outbox pozwala ponawiać cleanup bez ukrywania problemu.

## 7. Migracje bazy danych 0009–0015

Wszystkie migracje są addytywne i zaprojektowane z myślą o oknie zgodności N-1, czyli sytuacji, w której przez krótki czas stary i nowy worker mogą działać równolegle.

### `20260901_0009_storage_v2.py`

Dodaje wskaźniki Storage V2 i trwałą kolejkę cleanup. Nie przenosi automatycznie istniejących bajtów. Stary locator jest odczytywany do czasu kolejnego poprawnego renderu dokumentu.

### `20260901_0010_ai_credit_reservations.py`

Dodaje atomowe rezerwacje kredytów AI oraz trwały ledger żądań/idempotency. Zapobiega podwójnemu naliczaniu i przekroczeniu limitu przez równoległe requesty.

### `20260901_0011_auth_hardening.py`

Dodaje kanoniczne identity keys dla username/e-mail, pola migracji Argon2id i tabele limitowania logowania. Normalizacja NFKC + trim + casefold zapewnia spójne wyszukiwanie i unikalność bez zmiany formy wyświetlanej użytkownikowi.

### `20260901_0012_document_integrity.py`

Dodaje revision dokumentu, idempotency create, kanoniczny `title_key` i pochodzenie szablonu. Te dane umożliwiają wykrycie konfliktu równoczesnego zapisu oraz bezpieczne ponowienie requestu create.

### `20260901_0013_cleanup_dead_letters.py`

Rozszerza cleanup o rodzaj zasobu, retry/backoff i końcowy stan `dead_letter`, który wymaga interwencji operatora zamiast nieskończonego ponawiania.

### `20260901_0014_atomic_image_slots.py`

Dodaje atomowy licznik slotów zdjęć per użytkownik. Licznik jest backfillowany i uzgadniany z istniejącymi rekordami, aby równoległe uploady nie przekraczały limitu.

### `20260901_0015_n1_document_writes.py`

Dodaje ochronę metadanych zapisanych przez poprzednią wersję workera. Triggery podnoszą revision i uzupełniają `title_key` również wtedy, gdy starsza aplikacja nie zna nowych kolumn.

## 8. Integralność dokumentu, idempotency i konflikty zapisu

### Co zrobiono

- Każdy dokument ma monotoniczną `revision`.
- Aktualizacja wymaga oczekiwanej revision; niezgodność daje kontrolowany konflikt zamiast cichego nadpisania.
- Create używa idempotency key i skrótu requestu. Ponowienie tego samego żądania zwraca ten sam rezultat, a użycie klucza z inną treścią jest odrzucane.
- Tytuły mają ograniczony, kanoniczny `title_key`, używany do sprawdzania konfliktów bez utraty oryginalnej pisowni.
- Frontend przechowuje ostatni zatwierdzony snapshot i aktualizuje go dopiero po potwierdzeniu backendu.
- Spóźniona odpowiedź z poprzedniego dokumentu nie może zmienić bieżącego dokumentu dzięki lifecycle epoch/scope.

### Dlaczego

Użytkownik może kliknąć zapis kilka razy, sieć może ponowić żądanie, a odpowiedzi mogą wrócić w innej kolejności. Bez revision i idempotency powstają duplikaty lub utrata nowszych zmian.

### Główne pliki

- `backend/app/utils/document_integrity.py`
- `backend/app/services/document_service.py`
- `frontend/src/utils/pdfPersistenceContract.js`
- `frontend/src/utils/persistedDocumentSnapshot.js`
- `frontend/src/utils/documentSnapshotCommit.js`
- `frontend/src/utils/documentLifecycleScope.js`
- `frontend/src/store/document-lifecycle-context.jsx`

## 9. Zdjęcia i ochrona własności

### Co zrobiono

- Upload zdjęcia rezerwuje slot atomowo.
- Rozmiar requestu jest ograniczany podczas odczytu, a nie dopiero po wczytaniu całej zawartości do pamięci.
- Dozwolone formaty i dane obrazu są walidowane.
- Pobieranie zawartości zdjęcia wymaga uwierzytelnienia i sprawdzenia właściciela.
- PDF i ścieżki AI nie mogą odwołać się do prywatnego zdjęcia innego użytkownika przez podmianę `img_id` lub `src`.
- Usunięcie zdjęcia uwzględnia referencje dokumentów oraz cleanup storage.
- Publiczny response DTO nie ujawnia wewnętrznego locatora S3/filesystem.

### Dlaczego

Samo ukrycie linku w UI nie jest autoryzacją. Każdy identyfikator przekazany z klienta jest niezaufany, dlatego ownership musi być sprawdzony na backendzie we wszystkich ścieżkach wykorzystujących obraz.

## 10. Uwierzytelnianie i autoryzacja

### Co zrobiono

- Nowe hasła są hashowane przez Argon2id.
- W oknie migracyjnym zachowano kontrolowany bridge bcrypt dla zgodności N-1, ale bieżący worker preferuje Argon2id.
- Username i e-mail mają osobne kanoniczne klucze NFKC + trim + casefold.
- JWT wymaga numerycznego `sub` wskazującego user ID oraz bieżącej wersji klucza `ver`.
- Weryfikacja tokenu odbywa się przez nagłówek `Authorization`, a nie przez token w URL.
- Rejestracja i logowanie mają bazodanowe limity per konto/per IP, zajmowane atomowo przed kosztownym hashowaniem.
- `X-Forwarded-For` jest uznawany tylko wtedy, gdy bezpośredni peer należy do jawnej `TRUSTED_PROXY_CIDRS`.
- Reset kredytów administracyjnych wymaga osobnego `ADMIN_RESET_SECRET`; usunięto fallback do `SECRET_KEY`.
- Admin reset działa tylko dla dokładnego numerycznego ID użytkownika i zapisuje bezpieczny audyt wyniku.

### Dlaczego

Argon2id zwiększa koszt ataku offline na hasła. Kanonizacja blokuje konta różniące się wyłącznie wielkością liter lub formą Unicode. Numeryczny subject JWT nie zmienia znaczenia po zmianie username. Atomowe limity zapobiegają obejściu throttlingu przez requesty równoległe.

### Główne pliki

- `backend/app/core/security.py`
- `backend/app/services/auth_rate_limit.py`
- `backend/app/api/routes/auth.py`
- `backend/app/api/routes/billing.py`
- `backend/tests/test_auth_hardening.py`
- `backend/tests/test_admin_credit_reset_security.py`

## 11. Limity planów, eksportów i kredytów AI

### Co zrobiono

- Limity tworzenia projektów, eksportów, importów i akcji AI są rezerwowane/inkrementowane atomowo.
- Eksport, który nie zakończy się sukcesem, może zwrócić wcześniej naliczony limit.
- AI używa dwuetapowego modelu reserve → settle/release.
- Rezerwacje mają idempotency i lease/wygaśnięcie, aby przerwany request nie blokował kredytów bez końca.
- Osobno obsłużono sukces i błąd importu CV.
- Requesty AI mają ograniczenia rozmiaru i kontrolowane timeouty, a wewnętrzne retry SDK zostały wyłączone tam, gdzie mogły podwójnie zużyć koszt dostawcy.

### Dlaczego

Schemat „sprawdź limit, potem zwiększ” jest podatny na race condition. Dwa requesty mogą jednocześnie zobaczyć dostępny ostatni kredyt. Rezerwacja wykonywana w bazie powoduje, że tylko jeden request otrzymuje prawo do wykonania kosztownej operacji.

## 12. Import CV i API AI

### Co zrobiono

- Historia importów ma paginację kursorową zamiast kosztownego offsetu.
- Lista importów nie zwraca pełnego payloadu CV; szczegóły pobiera się osobno.
- Cursor jest walidowany i kodowany po stronie serwera.
- Błędy dostawcy są mapowane na bezpieczne kody aplikacji bez logowania treści CV, raw response albo sekretu.
- Snapshot nieudanego importu jest aktualizowany razem z rozliczeniem rezerwacji.
- Asset URLs szablonów są przebudowywane względem publicznego originu requestu.
- Import, assistant i fill-template mają jawne granice requestu oraz autoryzacji.

### Dlaczego

Pełne CV zawiera dane osobowe i nie powinno być przesyłane w każdym elemencie listy. Kursor poprawia stabilność paginacji podczas dopisywania nowych rekordów. Sanityzacja błędów ogranicza ryzyko wycieku danych do klienta i logów.

## 13. Liveness, readiness i start aplikacji

### Co zrobiono

- `GET /health` jest prostym liveness: potwierdza, że proces odpowiada, bez dostępu do bazy.
- `GET /ready` sprawdza połączenie z bazą, zgodność z aktualnym Alembic head, seed katalogu planów i wybrane kontrakty integralności.
- Readiness gate zwraca 503 dla tras bazodanowych, gdy instancja nie jest gotowa.
- Błąd readiness jest sanitizowany; klient nie dostaje szczegółów infrastruktury.
- `deployment_bootstrap.py` uruchamia migracje i seed przed startem workera.
- Operacje synchroniczne SQLAlchemy, ReportLab, S3 i filesystem zostały przeniesione do synchronicznych handlerów FastAPI wykonywanych w thread poolu.

### Dlaczego

Proces może działać, ale nie być gotowy do obsługi użytkowników. Render powinien kierować ruch dopiero po zakończeniu migracji i seedowania. Oddzielenie `/health` pozwala nadal zdiagnozować żywy proces, gdy baza jest niedostępna.

## 14. Render i konfiguracja wdrożenia

### Co zrobiono w repozytorium

- Dodano root `render.yaml` opisujący PostgreSQL, backend, frontend statyczny i cron cleanup.
- Backend ma build, start command, pre-deploy command i health check `/ready`.
- Sekrety są referencjami `sync: false` albo wartościami generowanymi, a nie jawnymi wartościami w Git.
- `PYTHON_VERSION` przypięto do `3.12.10`.
- Publiczny URL frontendu jest przekazywany do backendowego `CORS_ORIGINS` przez `RENDER_EXTERNAL_URL`.
- Publiczny URL backendu jest przekazywany do `BACKEND_URL` i frontendowego `VITE_API_URL`.
- Ostatni commit `7d92db4` naprawił właśnie to połączenie URL-i po pierwszym nieudanym wdrożeniu.

### Dlaczego wdrożenie nadal może nie działać

Zmiana pliku `render.yaml` nie aktualizuje automatycznie ręcznie utworzonej usługi Render. Ostatni dostępny log pokazał trzy oznaki dryfu konfiguracji:

- Render checkoutował starszy commit `c070cd5`, a nie `7d92db4`;
- użył Python 3.14 zamiast przypiętego 3.12.10;
- uruchomił `python -m uvicorn ...`, podczas gdy Blueprint deklaruje `uvicorn ...`.

To oznacza, że obecna usługa jest ręczna albo Blueprint nie został zsynchronizowany. Repozytorium zawiera poprawny kontrakt, ale Render Dashboard nadal może mieć stare wartości.

### Wymagane działania poza kodem

Na backendzie Render trzeba ustawić lub potwierdzić:

- `CORS_ORIGINS=https://<publiczny-frontend>`;
- `BACKEND_URL=https://<publiczny-backend>`;
- `PYTHON_VERSION=3.12.10`;
- `DATABASE_URL`;
- mocny `SECRET_KEY` i właściwy `JWT_KEY_VERSION`;
- `S3_BUCKET_NAME`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`;
- `ADMIN_RESET_SECRET`;
- dane Cloudflare/OpenAI, jeżeli funkcje AI mają działać;
- `TRUST_PROXY_HEADERS=false`, dopóki nie zostanie skonfigurowana prawidłowa, ograniczona `TRUSTED_PROXY_CIDRS`.

Na frontendzie Render:

- `VITE_API_URL=https://<publiczny-backend>`.

Po zmianie `VITE_API_URL` frontend musi zostać przebudowany, ponieważ Vite wbudowuje tę wartość do statycznego JavaScriptu.

## 15. Frontend: lifecycle dokumentu i ochrona przed utratą zmian

### Co zrobiono

- Dodano `DocumentLifecycleContext` skupiony wyłącznie na tożsamości i cyklu życia bieżącego dokumentu.
- Usunięto legacy `pdfgenerator-context.jsx`, który agregował zbyt wiele niezależnych odpowiedzialności.
- Dodano snapshot ostatniego poprawnie zapisanego dokumentu i deterministyczną sygnaturę dirty state.
- `useDirtyGuard` ostrzega przed opuszczeniem strony z niezapisanymi zmianami.
- Dodano dostępny `UnsavedChangesDialog` dla nawigacji sterowanej przez aplikację.
- Zapis, create i download współdzielą kontrakt revision/idempotency.
- Spóźnione requesty są odrzucane, jeżeli należą do poprzedniej sesji dokumentu.

### Dlaczego

Wcześniej szeroki wspólny context utrudniał ustalenie, która zmiana stanu powinna przerysować jaki fragment aplikacji. Mógł też pozwolić, aby późna odpowiedź nadpisała nowo otwarty dokument. Wydzielony lifecycle redukuje promień zmian i formalizuje moment, w którym dokument jest uznany za zapisany.

## 16. Frontend: recovery i obsługa błędów

### Co zrobiono

- Każda główna trasa ma `errorElement`.
- Edytor ma osobny Error Boundary z kontrolowanym komunikatem i akcją odzyskiwania.
- Fallback nie pokazuje stack trace ani danych stanu dokumentu.
- Zmiana dokumentu resetuje boundary przez `resetKey`.
- Dialogi mają mechanizm zawieszania i przywracania focusu.
- Elementy galerii mają jawne stany błędu obrazu i akcje dostępne z klawiatury.

### Dlaczego

Błąd jednego komponentu nie powinien kończyć się pustym ekranem albo ekranem developerskim React Routera. Użytkownik potrzebuje bezpiecznej ścieżki odświeżenia/ponowienia bez ujawniania prywatnego stanu.

## 17. Frontend: lazy loading i budżety bundla

### Co zrobiono

- Trasy Hero, Login, Register i PdfCanvas są ładowane przez `lazy`/`Suspense`.
- Ciężkie AI Assistant, AI CV Panel i Bio CV Modal są osobnymi chunkami ładowanymi dopiero przy użyciu.
- Dodano generowanie grafu bundla i budżety gzip.
- CI odrzuca build przekraczający ustalone progi bez świadomej zmiany kontraktu.
- Produkcyjny build wymaga jawnego HTTPS `VITE_API_URL`; development używa lokalnego proxy `/api`.

### Dlaczego

Użytkownik landing page nie powinien pobierać całego edytora i modułów AI. Lazy loading skraca pierwszy transfer, a budżet w CI zapobiega powolnemu, niezauważonemu powrotowi dużego entry chunku.

## 18. Testy dodane lub rozszerzone

Po zmianach lokalny zapis w planie remediacji raportował:

- backend: 700 testów, 81 subtestów, PostgreSQL-only contracts osobno w CI;
- frontend Node: 881 testów;
- frontend runtime Vitest: 5 testów;
- Playwright: 8 smoke tests na desktopie i Pixel 5;
- lint: zero ostrzeżeń;
- build Vite: 723 moduły, sukces;
- `pip check`: brak uszkodzonych zależności;
- audyty produkcyjnych zależności: brak zaakceptowanych High/Critical w zapisanym wyniku planu.

Najważniejsze nowe klasy testów:

- path traversal i containment storage;
- awarie renderer/upload/rename/delete/DB commit;
- idempotency create i optimistic concurrency;
- ownership PDF-ów oraz zdjęć;
- limity requestów i race conditions;
- atomowe rezerwacje AI/import/export;
- migracje Alembic na starym i świeżym schemacie;
- readiness oraz bootstrap;
- PostgreSQL locking/UPSERT/trigger contracts;
- Error Boundary i runtime React;
- utrata zmian, save/download i regresja kategorii skills w Playwright.

## 19. Zależności i konfiguracja developerska

### Co zrobiono

- Rozdzielono `requirements.txt` i `requirements-dev.txt`.
- Typing/test-only dependencies nie muszą być instalowane w produkcji.
- Przypięto wspierane wersje runtime.
- Dodano brakujące biblioteki testów runtime i E2E frontendu.
- Dodano `.env.example` z klasyfikacją zmiennych i bez prawdziwych sekretów.
- Rozbudowano `.gitignore`; lokalny `.claude/settings.local.json` jest ignorowany, ponieważ może zawierać prywatne komendy i sekrety.

### Ważne zdarzenie bezpieczeństwa

W lokalnym `.claude/settings.local.json` wykryto rzeczywisty klucz OpenAI. Plik nie został dodany do commita i jest teraz ignorowany przez Git. Samo zignorowanie pliku nie unieważnia klucza — klucz należy odwołać i wygenerować nowy po stronie OpenAI.

## 20. Dokumentacja

### Co zrobiono

- Rozszerzono pełne wersje English i Polski w `README.md`.
- Dodano plan remediacji bezpieczeństwa i niezawodności.
- Dodano politykę wyjątków zależności.
- Zaktualizowano `docs/BUGZ.MD` oraz `THE ENDGAME.md`.
- Dodano roadmapę produktu/UX/komercjalizacji.
- Dodano automatyczne sprawdzanie linków wewnętrznych i struktury EN/PL.

### Dlaczego

Po tak dużej zmianie kodu dokumentacja jest częścią funkcji. Bez opisania nowych env vars, migracji, storage i readiness następny deploy mógłby zostać skonfigurowany według poprzednich założeń — dokładnie tak, jak pokazał obecny dryf konfiguracji Render.

## 21. Kompatybilność i strategia rollback

- Migracje są expand-only w tym wydaniu; nowe kolumny pozostają zgodne ze starszym workerem tam, gdzie wymagane.
- Legacy storage jest odczytywany, ale nowe zapisy używają Storage V2.
- Migracja nie przenosi plików w zewnętrznym storage.
- Poprzednia poprawna wersja PDF pozostaje wskazywana do czasu udanej publikacji nowej.
- Nie należy cofać się do wersji przywracającej podatne budowanie ścieżek lub niebezpieczny fallback sekretu.
- Przed wdrożeniem migracji na produkcji należy wykonać i zweryfikować backup PostgreSQL.
- Rollback aplikacji jest bezpieczny tylko wtedy, gdy poprzednia wersja potrafi czytać rozszerzony schemat.

## 22. Co celowo nie zostało uznane za zakończone

Repozytorium nie może samodzielnie dostarczyć dowodów ze środowiska produkcyjnego. Nadal wymagane są:

1. synchronizacja Blueprintu lub ręczne usunięcie dryfu Render;
2. ustawienie i rotacja prawdziwych sekretów;
3. test migracji na backupie bazy podobnej do produkcyjnej;
4. staging deploy dokładnie tego commita, który przeszedł CI;
5. smoke test logowania, importu, zapisu, pobrania i awarii storage na staging;
6. 30-minutowy production canary z obserwacją readiness, 5xx i latency;
7. monitoring cleanup jobs/dead letters;
8. dłuższa obserwacja stabilności CI i flake rate Playwright.

Nie zaimplementowano Stripe ani kompletnego komercyjnego billing flow. Istniejące plany, limity i entitlements zostały utwardzone, ale zewnętrzna płatność pozostaje osobnym zakresem.

## 23. Mapa najważniejszych plików

| Obszar | Najważniejsze pliki |
|---|---|
| Konfiguracja runtime | `backend/app/core/config.py`, `backend/.env.example`, `frontend/src/config/appConfig.js` |
| Auth | `backend/app/core/security.py`, `backend/app/services/auth_rate_limit.py`, `backend/app/api/routes/auth.py` |
| Storage PDF | `backend/app/services/pdf_storage.py`, `backend/app/services/document_service.py` |
| Storage zdjęć | `backend/app/services/image_storage.py`, `backend/app/api/routes/images.py` |
| Spójność dokumentu | `backend/app/utils/document_integrity.py`, `frontend/src/utils/pdfPersistenceContract.js` |
| Entitlements/AI | `backend/app/services/entitlements.py`, `backend/app/api/routes/ai.py`, `backend/app/api/routes/ai_assistant.py` |
| Readiness | `backend/app/services/readiness.py`, `backend/app/services/deployment_bootstrap.py`, `backend/app/main.py` |
| Cleanup | `backend/app/services/storage_cleanup_worker.py`, `render.yaml` |
| Migracje | `backend/alembic/versions/20260901_0009_*.py` do `20260901_0015_*.py` |
| Lifecycle frontendu | `frontend/src/store/document-lifecycle-context.jsx`, `frontend/src/hooks/useDirtyGuard.js`, `frontend/src/pages/PdfCanvas.jsx` |
| Recovery frontendu | `frontend/src/components/common/ErrorBoundary/`, `frontend/src/components/common/UnsavedChangesDialog/` |
| Testy E2E | `frontend/e2e/`, `frontend/playwright.config.js` |
| CI/security scans | `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/scripts/` |
| Deploy | `render.yaml` |

## 24. Najkrótsze podsumowanie biznesowe

Przed zmianą aplikacja miała wiele funkcji, ale część gwarancji produkcyjnych istniała tylko jako założenie. Po zmianie te gwarancje są w większym stopniu zapisane jako kod, constraint, migracja, test albo pipeline:

- użytkownik nie powinien stracić ostatniej poprawnej wersji PDF przez częściową awarię zapisu;
- użytkownik nie powinien odczytać cudzego zdjęcia lub PDF-u przez zmianę identyfikatora;
- równoległe requesty nie powinny ominąć limitów i naliczeń;
- proces nie powinien zostać uznany za gotowy przed bazą i migracjami;
- frontend powinien odzyskać kontrolę po błędzie komponentu i ostrzec przed utratą zmian;
- CI powinno uruchomić wszystkie testy, a nie tylko wcześniej znaną listę;
- konfiguracja wdrożenia powinna być wersjonowana, jawna i możliwa do odtworzenia.

Największym pozostałym problemem nie jest obecnie brak kodu, lecz rozjazd między wersjonowanym `render.yaml` a ustawieniami istniejących usług w Render Dashboard.
