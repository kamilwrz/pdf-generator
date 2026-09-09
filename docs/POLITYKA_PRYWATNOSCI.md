# Polityka prywatności CV Studio

> **PROJEKT DO WERYFIKACJI PRZED PUBLIKACJĄ — wersja 0.9 z 5 września 2026 r.**
> Przed publikacją należy uzupełnić wszystkie pola oznaczone `[DO UZUPEŁNIENIA]`, wdrożyć działania z checklisty na końcu dokumentu i uzyskać końcową weryfikację prawną. Dokument opisuje stan kodu CV Studio przeanalizowany 5 września 2026 r.; nie obejmuje niewdrożonych jeszcze płatności ani logowania Google.

## 1. Administrator danych

Administratorem danych osobowych przetwarzanych w związku z korzystaniem z CV Studio, dostępnego pod adresem **[DO UZUPEŁNIENIA: adres serwisu]**, jest:

**[DO UZUPEŁNIENIA: pełna nazwa firmy albo imię i nazwisko przedsiębiorcy]**
adres: **[DO UZUPEŁNIENIA: adres siedziby lub adres korespondencyjny]**
NIP: **[DO UZUPEŁNIENIA]**
REGON: **[DO UZUPEŁNIENIA, jeżeli dotyczy]**

W sprawach dotyczących prywatności możesz skontaktować się z Administratorem:

- e-mail: **[DO UZUPEŁNIENIA: dedykowany adres, np. prywatnosc@domena.pl]**;
- pocztą: **[DO UZUPEŁNIENIA: adres korespondencyjny]**.

**[DO UZUPEŁNIENIA: Administrator nie wyznaczył inspektora ochrony danych / dane kontaktowe inspektora ochrony danych].**

## 2. Zakres polityki

Polityka opisuje przetwarzanie danych podczas:

- odwiedzania strony CV Studio;
- tworzenia CV bez konta;
- rejestracji i logowania;
- zapisywania, edytowania, importowania oraz eksportowania CV;
- przesyłania zdjęć;
- korzystania z funkcji sztucznej inteligencji;
- korzystania z planów Darmowy i Pro;
- kontaktowania się z Administratorem.

Polityka nie dotyczy stron i usług podmiotów trzecich, do których prowadzą zewnętrzne linki.

## 3. Jakie dane przetwarzamy

### 3.1. Dane konta

Możemy przetwarzać:

- nazwę użytkownika;
- adres e-mail;
- kryptograficzny skrót hasła — hasło nie jest przechowywane w postaci jawnej;
- identyfikator, datę utworzenia i status konta;
- informacje o wybranym planie;
- liczbę importów, eksportów i wykorzystanych kredytów AI;
- dane potrzebne do utrzymania sesji i uwierzytelnienia.

### 3.2. Dane zawarte w CV

Przetwarzamy dane wpisane albo przesłane przez użytkownika, w szczególności:

- imię, nazwisko i stanowisko;
- adres e-mail, numer telefonu, miejscowość, adres, stronę internetową i profile zawodowe;
- zdjęcie;
- historię zatrudnienia i wykształcenia;
- projekty, umiejętności, języki, kursy, certyfikaty, osiągnięcia i zainteresowania;
- podsumowanie zawodowe;
- informacje o osobach udzielających referencji;
- treść importowanego CV;
- układ, style, szablon i elementy dokumentu.

CV może zawierać szeroki zakres informacji. Prosimy, aby nie umieszczać w nim danych, które nie są potrzebne do rekrutacji.

### 3.3. Importowane pliki i obrazy

W przypadku przesłania pliku możemy przetwarzać:

- nazwę i rozmiar pliku;
- typ MIME;
- datę przesłania;
- zawartość pliku lub obrazu;
- prywatny identyfikator pliku w magazynie danych;
- dane wyodrębnione z dokumentu.

Obecna implementacja przyjmuje pliki PDF do 10 MB i 12 stron. Sprawdza podpis pliku, możliwość jego odczytania, liczbę stron oraz to, czy dokument nie jest zaszyfrowany.

Oryginalne bajty PDF użytego do importu nie są zapisywane w historii importów. CV Studio zachowuje natomiast wynik importu: znormalizowane dane CV, bezpieczną nazwę pliku, jego rozmiar, status oraz znaczniki czasu. Użytkownik może ponownie wykorzystać albo usunąć taki wpis.

### 3.4. Dane przekazywane do AI

W zależności od wybranej funkcji możemy przetwarzać:

- całą lub wybraną treść CV;
- strukturę i układ dokumentu;
- polecenia wpisywane w asystencie;
- treść, adres URL i uwagi dotyczące oferty pracy;
- obrazy stron skanowanego PDF;
- odpowiedzi, oceny i propozycje wygenerowane przez model.

### 3.5. Dane techniczne i bezpieczeństwa

Możemy przetwarzać:

- adres IP i znaczniki czasu;
- adres żądanego zasobu i kod odpowiedzi;
- informacje o przeglądarce i urządzeniu przekazywane standardowo podczas komunikacji internetowej;
- informacje o błędach;
- token sesji JWT;
- klucze zapobiegające wielokrotnemu wykonaniu tego samego żądania;
- liczniki i rezerwacje operacji AI;
- pseudonimizowane skróty wykorzystywane do ograniczania prób logowania.

Tabela ograniczania prób logowania przechowuje skróty kryptograficzne zamiast surowych adresów IP, adresów e-mail i nazw użytkownika.

### 3.6. Dane o korzystaniu z produktu

Aplikacja rejestruje ograniczony katalog zdarzeń, takich jak:

- wybór szablonu;
- rozpoczęcie tworzenia lub importowania CV;
- pierwsza edycja;
- pokazanie ekranu wymagającego konta;
- ukończenie rejestracji;
- przejęcie dokumentu utworzonego jako gość.

Po zalogowaniu zdarzenia są zapisywane w ustrukturyzowanych logach, a nie w osobnej tabeli analitycznej. Mogą obejmować rodzaj zdarzenia, identyfikator szablonu, czas i identyfikator konta.

Zdarzenia wykonane przed zalogowaniem mogą oczekiwać lokalnie w przeglądarce i zostać wysłane po zalogowaniu wyłącznie po uprzednim uzyskaniu wymaganej zgody na analityczne przechowywanie informacji w urządzeniu. Szczegóły opisano w sekcji 10.

### 3.7. Dane przekazywane w kontakcie

Jeżeli skontaktujesz się z Administratorem, przetwarzane mogą być dane kontaktowe, treść wiadomości, załączniki i informacje potrzebne do udzielenia odpowiedzi lub rozwiązania zgłoszenia.

## 4. Źródła danych

Dane pozyskujemy:

- bezpośrednio od użytkownika;
- z przesłanego CV;
- z podanej oferty pracy lub strony oferty, jeżeli funkcja dopasowania pobiera jej treść;
- automatycznie z przeglądarki, urządzenia i infrastruktury sieciowej;
- od dostawców technicznych wykonujących nasze żądania.

Jeżeli umieszczasz w CV dane innej osoby, np. osoby udzielającej referencji, upewnij się, że możesz zgodnie z prawem z nich korzystać. Nie podawaj danych osób trzecich, jeżeli nie są potrzebne.

## 5. Cele i podstawy prawne

| Cel | Zakres danych | Podstawa prawna |
| --- | --- | --- |
| Rejestracja, logowanie i prowadzenie konta | dane konta i dane techniczne | art. 6 ust. 1 lit. b RODO — wykonanie umowy lub działania na żądanie użytkownika przed jej zawarciem |
| Tworzenie, zapisywanie, edytowanie, importowanie i eksportowanie CV | treść CV, pliki, obrazy, metadane dokumentów i dane konta | art. 6 ust. 1 lit. b RODO |
| Wykonanie wybranej funkcji AI | dane potrzebne do wykonania polecenia, np. CV, polecenie, oferta pracy, układ i odpowiedź modelu | art. 6 ust. 1 lit. b RODO; w przypadku szczególnych kategorii danych dodatkowo właściwa przesłanka z art. 9 ust. 2 RODO — zob. sekcja 7 |
| Zarządzanie planem, limitami, kredytami i rozliczeniem operacji | plan, okres dostępu, liczniki, rezerwacje i historia operacji | art. 6 ust. 1 lit. b RODO; w zakresie zapobiegania nadużyciom także art. 6 ust. 1 lit. f RODO |
| Ochrona kont, ograniczanie prób logowania, zapobieganie nadużyciom, diagnostyka i zapewnienie niezawodności | dane techniczne, pseudonimizowane skróty, logi i informacje o błędach | art. 6 ust. 1 lit. f RODO — prawnie uzasadniony interes polegający na ochronie usługi, użytkowników i możliwości ustalenia przyczyn awarii |
| Ograniczona analityka produktu | zdarzenia użycia i identyfikator konta; lokalna kolejka zdarzeń | art. 6 ust. 1 lit. a RODO — zgoda, jeżeli dane są pozyskiwane z opcjonalnego zapisu w urządzeniu; w zakresie zdarzeń ściśle związanych z obsługą konta Administrator może stosować art. 6 ust. 1 lit. f RODO po udokumentowaniu testu równowagi `[DO UZUPEŁNIENIA: ostateczna decyzja]` |
| Obsługa wiadomości i zgłoszeń | dane kontaktowe i treść korespondencji | art. 6 ust. 1 lit. b RODO, gdy zgłoszenie dotyczy usługi, albo art. 6 ust. 1 lit. f RODO — sprawna komunikacja i obsługa zgłoszeń |
| Ustalenie, dochodzenie lub obrona roszczeń | dane konta, dokumentacja zdarzeń i korespondencja | art. 6 ust. 1 lit. f RODO |
| Wykonanie obowiązków prawnych | dane wymagane przepisami | art. 6 ust. 1 lit. c RODO |

Podanie danych wymaganych podczas rejestracji jest konieczne do utworzenia konta. Pozostałe dane, zdjęcie, oferta pracy i korzystanie z AI są dobrowolne, ale ich brak może uniemożliwić wykonanie wybranej funkcji. Z edytora można korzystać ręcznie bez funkcji AI w zakresie udostępnionym przez plan.

Jeżeli przetwarzanie opiera się na zgodzie, można ją wycofać w dowolnym momencie. Wycofanie zgody nie wpływa na zgodność z prawem przetwarzania dokonanego wcześniej.

## 6. Funkcje sztucznej inteligencji

CV Studio korzysta z dwóch zewnętrznych usług AI:

- **Cloudflare Workers AI** — podczas wyodrębniania danych z tekstowych i skanowanych CV;
- **OpenAI API** — podczas oceniania CV, korekty, poprawiania i skracania treści, analizy ATS, tłumaczenia, dopasowania do oferty oraz rozmowy z asystentem.

OpenAI może także obsługiwać awaryjną ścieżkę importu, jeżeli zostanie ona włączona w konfiguracji aplikacji.

Treść CV nie jest wysyłana do dostawcy AI tylko dlatego, że użytkownik otwiera edytor. Przekazanie następuje po uruchomieniu funkcji wymagającej modelu. Przy operacji dotyczącej całego dokumentu dostawca może otrzymać całą treść CV. Przy imporcie skanu Cloudflare może otrzymać obrazy stron dokumentu. Przy dopasowaniu do oferty mogą zostać przetworzone także treść oferty, jej adres i dodatkowe uwagi użytkownika.

Odpowiedzi AI mogą być niedokładne lub niepełne. Mają charakter pomocniczy i powinny zostać sprawdzone przez użytkownika. CV Studio nie podejmuje na ich podstawie decyzji wywołujących skutki prawne lub w podobny sposób istotnie wpływających na użytkownika. Ostatecznie to użytkownik decyduje, czy zaakceptować propozycję i wysłać CV.

Według aktualnych warunków dostawców treści przekazane przez biznesowe API nie są domyślnie używane do trenowania ich modeli. OpenAI może standardowo przechowywać logi monitorowania nadużyć zawierające wejścia, wyjścia i metadane do 30 dni, chyba że dla danego konta i punktu końcowego aktywowano krótszą retencję lub Zero Data Retention. Cloudflare deklaruje, że nie używa treści klienta Workers AI do trenowania modeli ani ulepszania usług bez wyraźnej zgody i nie zapisuje jej w usłudze trwałej, o ile klient osobno nie korzysta z usługi przechowywania.

Aktualne informacje znajdują się w dokumentacji dostawców:

- [OpenAI API — zasady wykorzystywania i retencji danych](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint);
- [OpenAI — dodatek dotyczący przetwarzania danych](https://openai.com/policies/data-processing-addendum/);
- [Cloudflare Workers AI — wykorzystywanie danych](https://developers.cloudflare.com/workers-ai/platform/data-usage/);
- [Cloudflare — dodatek dotyczący przetwarzania danych](https://www.cloudflare.com/cloudflare-customer-dpa/).

## 7. Dane szczególnych kategorii i inne dane wrażliwe

CV Studio nie jest przeznaczone do przetwarzania danych o:

- zdrowiu lub niepełnosprawności;
- pochodzeniu rasowym albo etnicznym;
- poglądach politycznych;
- przekonaniach religijnych lub światopoglądowych;
- przynależności związkowej;
- życiu lub orientacji seksualnej;
- danych genetycznych;
- danych biometrycznych używanych do jednoznacznej identyfikacji.

Nie umieszczaj takich informacji w CV ani poleceniach AI, jeżeli nie jest to konieczne.

Zwykłe zdjęcie w CV nie staje się automatycznie daną biometryczną szczególnej kategorii, jeżeli nie jest przetwarzane technicznie w celu jednoznacznego rozpoznania osoby. CV Studio nie wykorzystuje zdjęć do rozpoznawania twarzy.

Jeżeli Administrator zdecyduje się dopuszczać przekazywanie danych szczególnych kategorii do AI, przed uruchomieniem tej funkcji musi wdrożyć odpowiednią przesłankę z art. 9 ust. 2 RODO, np. mechanizm wyraźnej zgody.

**[DO UZUPEŁNIENIA PRZED PUBLIKACJĄ: opisać i wdrożyć mechanizm wyraźnej zgody albo całkowity zakaz przekazywania takich danych do AI.]**

Nie przesyłaj danych dotyczących wyroków skazujących i naruszeń prawa, chyba że ich przetwarzanie zostało wcześniej ocenione i istnieje odpowiednia podstawa prawna.

## 8. Odbiorcy danych

Dane mogą być powierzane następującym odbiorcom:

| Odbiorca lub kategoria | Rola i zakres |
| --- | --- |
| **Render Services, Inc.** | hosting aplikacji, bazy PostgreSQL, sieć dostarczania treści i logi infrastruktury |
| **Amazon Web Services** | prywatne przechowywanie zapisanych dokumentów i obrazów w S3 |
| **Cloudflare, Inc.** | wyodrębnianie danych z importowanego CV przez Workers AI; Cloudflare może także występować w łańcuchu infrastruktury innych dostawców |
| **OpenAI Ireland Ltd., podmioty z grupy OpenAI i ich podwykonawcy** | wykonanie funkcji asystenta AI i opcjonalnej ścieżki awaryjnej importu |
| dostawcy bezpieczeństwa, obsługi technicznej i profesjonalni doradcy | gdy jest to potrzebne do utrzymania usługi, rozwiązania problemu, audytu lub ochrony roszczeń |
| organy publiczne i sądy | gdy ujawnienie wynika z prawa lub prawnie wiążącego żądania |

Nie sprzedajemy danych osobowych ani nie udostępniamy treści CV innym użytkownikom.

Płatności i logowanie przez Google nie są obecnie wdrożone. Przed uruchomieniem tych funkcji polityka zostanie zaktualizowana o odpowiednich odbiorców, zakres danych, podstawy prawne, retencję i transfery. Administrator nie powinien przechowywać pełnych danych karty, jeżeli płatność będzie obsługiwana przez zewnętrznego operatora.

## 9. Transfery poza Europejski Obszar Gospodarczy

Niektórzy dostawcy lub ich podwykonawcy mogą przetwarzać dane poza Europejskim Obszarem Gospodarczym, w szczególności w Stanach Zjednoczonych. Sam wybór europejskiego regionu hostingu nie wyklucza wszystkich transferów, np. przez globalną sieć, wsparcie lub dalszych podwykonawców.

Jeżeli dochodzi do transferu poza EOG, stosujemy mechanizm wymagany przez rozdział V RODO, taki jak:

- decyzja Komisji Europejskiej stwierdzająca odpowiedni stopień ochrony, w tym — w odpowiednim zakresie — EU–US Data Privacy Framework;
- standardowe klauzule umowne Komisji Europejskiej;
- dodatkowe zabezpieczenia wdrożone na podstawie oceny transferu.

**[DO UZUPEŁNIENIA PRZED PUBLIKACJĄ: dla Render, AWS, Cloudflare i OpenAI wpisać faktycznie wybrany region, właściwą stronę umowy, zaakceptowany DPA, zastosowany mechanizm transferu i sposób uzyskania kopii zabezpieczeń. Nie publikować ogólnego zapewnienia bez weryfikacji ustawień i umów.]**

Aby uzyskać informację o zabezpieczeniach dotyczących konkretnego transferu lub ich kopię, napisz na adres wskazany w sekcji 1.

## 10. Pamięć przeglądarki, pliki cookie i podobne technologie

CV Studio wykorzystuje pamięć przeglądarki, w szczególności `localStorage`, do przechowywania:

| Informacja | Cel | Charakter |
| --- | --- | --- |
| dokument gościa i wersja robocza kreatora | zachowanie pracy po odświeżeniu strony i umożliwienie jej przejęcia po zalogowaniu | niezbędne do funkcji wyraźnie żądanej przez użytkownika |
| token sesji JWT i stan uwierzytelnienia | utrzymanie zalogowania i autoryzacja żądań | niezbędne do zalogowanej usługi |
| ustawienia interfejsu lub bieżącej sesji, jeżeli są zapisywane | odtworzenie działania edytora | niezbędne albo funkcjonalne, zależnie od ustawienia |
| `cvstudio.guest.events` | tymczasowa kolejka zdarzeń analitycznych wykonanych przed logowaniem | opcjonalne; wymaga uprzedniej zgody, jeżeli nie jest ściśle niezbędne do żądanej usługi |

Informacje niezbędne do wykonania transmisji lub dostarczenia żądanej usługi mogą być używane bez zgody w granicach art. 399 ust. 3 ustawy – Prawo komunikacji elektronicznej. O opcjonalne wykorzystanie pamięci urządzenia prosimy wcześniej i umożliwiamy równie łatwe wycofanie zgody.

Użytkownik może usunąć lokalne dane w ustawieniach aplikacji lub przeglądarki. Usunięcie dokumentu gościa przed zapisaniem go na koncie jest nieodwracalne. Zablokowanie niezbędnej pamięci może uniemożliwić logowanie albo zachowanie wersji roboczej.

W kodzie przeanalizowanym 5 września 2026 r. nie znaleziono zewnętrznych bibliotek reklamowych, Google Analytics ani Meta Pixel. Jeżeli zostaną dodane, polityka i mechanizm zgód zostaną zaktualizowane przed ich uruchomieniem.

## 11. Retencja danych

Dane przechowujemy nie dłużej, niż jest to potrzebne. Aktualny kod nie definiuje kompletnego automatycznego harmonogramu dla wszystkich kategorii, dlatego poniższe okresy muszą zostać operacyjnie zatwierdzone przed publikacją.

| Kategoria | Okres lub kryterium |
| --- | --- |
| dane konta | przez czas istnienia konta, a po jego zamknięciu przez okres niezbędny do rozliczenia usługi, wykonania obowiązków prawnych i ochrony roszczeń: `[DO UZUPEŁNIENIA]` |
| zapisane CV, elementy dokumentu i obrazy | do usunięcia dokumentu lub obrazu przez użytkownika, zamknięcia konta albo skutecznego żądania usunięcia; kopie zapasowe: `[DO UZUPEŁNIENIA]` |
| historia importów i znormalizowane dane CV | do usunięcia wpisu historii przez użytkownika, zamknięcia konta albo skutecznego żądania usunięcia; oryginalne bajty importowanego PDF nie są zapisywane w historii |
| dokument gościa i wersja robocza kreatora | lokalnie do przejęcia, usunięcia, wyczyszczenia danych strony lub upływu okresu `[DO UZUPEŁNIENIA, jeżeli aplikacja wdroży automatyczne wygaszanie]` |
| rozmowa i wyniki AI po stronie CV Studio | wynik jest zwracany do bieżącej sesji i może zostać zapisany, gdy użytkownik zaakceptuje go w dokumencie; serwerowa retencja treści żądań i odpowiedzi w logach: `[DO UZUPEŁNIENIA po audycie logowania błędów]` |
| dane u dostawców AI | zgodnie z ustawieniami kont i umowami; OpenAI standardowo może utrzymywać logi monitorowania nadużyć do 30 dni, o ile nie zastosowano innego zatwierdzonego trybu; Cloudflare zgodnie z aktualnymi zasadami Workers AI |
| logi techniczne i zdarzenia produktu | `[DO UZUPEŁNIENIA: konkretny okres Render i własnej konfiguracji]` |
| pseudonimizowane limity prób logowania | do zakończenia okna bezpieczeństwa i technicznego usunięcia rekordu: `[DO UZUPEŁNIENIA]` |
| dane planu, użycia, kredytów i rezerwacji AI | przez czas potrzebny do świadczenia i rozliczenia usługi oraz obsługi sporów: `[DO UZUPEŁNIENIA]` |
| korespondencja | do zakończenia sprawy, a następnie przez okres właściwy dla roszczeń: `[DO UZUPEŁNIENIA]` |

Jeżeli prawo wymaga dłuższego przechowywania, dane zachowamy tylko w wymaganym zakresie. Po upływie okresu retencji dane powinny zostać usunięte albo zanonimizowane.

## 12. Bezpieczeństwo

CV Studio stosuje środki adekwatne do ryzyka, obejmujące w szczególności:

- haszowanie haseł z użyciem Argon2id oraz kontrolowaną zgodność migracyjną ze starszymi skrótami bcrypt;
- uwierzytelnienie i autoryzację operacji na dokumentach, importach oraz obrazach;
- prywatny magazyn S3 w środowisku produkcyjnym z blokadą publicznego dostępu;
- kontrolę typu, rozmiaru, liczby stron, poprawności i szyfrowania importowanych plików;
- ograniczanie prób uwierzytelnienia bez zapisywania surowych identyfikatorów w tabeli limitów;
- walidację żądań, ograniczenia rozmiaru, klucze idempotencji i kontrolę współbieżności;
- ograniczenie dozwolonych źródeł przeglądarki w konfiguracji produkcyjnej;
- mechanizm usuwania zastępowanych prywatnych obiektów i rejestrowania nieudanych zadań porządkowych do dalszej obsługi.

Żaden system nie gwarantuje całkowitego bezpieczeństwa. Jeżeli podejrzewasz nieuprawniony dostęp do konta, skontaktuj się z Administratorem niezwłocznie.

## 13. Prawa użytkownika

W zależności od podstawy i okoliczności przysługuje Ci prawo do:

- dostępu do danych i uzyskania ich kopii;
- sprostowania nieprawidłowych danych;
- usunięcia danych;
- ograniczenia przetwarzania;
- przenoszenia danych, gdy przetwarzanie opiera się na zgodzie lub umowie i odbywa się automatycznie;
- wniesienia sprzeciwu wobec przetwarzania opartego na prawnie uzasadnionym interesie Administratora;
- wycofania zgody w dowolnym momencie;
- niepodlegania decyzji opartej wyłącznie na zautomatyzowanym przetwarzaniu, która wywołuje skutki prawne lub w podobny sposób istotnie wpływa na daną osobę — CV Studio nie podejmuje takich decyzji;
- wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych, ul. Stanisława Moniuszki 1A, 00-014 Warszawa, [uodo.gov.pl](https://uodo.gov.pl/).

Aby skorzystać z praw, napisz na adres wskazany w sekcji 1. Administrator może poprosić o informacje konieczne do potwierdzenia tożsamości, ale nie powinien żądać danych nadmiarowych. Co do zasady odpowiedź jest udzielana w ciągu miesiąca. Niektóre prawa podlegają ograniczeniom wynikającym z RODO.

Usunięcie lokalnego dokumentu gościa wykonuje użytkownik w swojej przeglądarce. W przypadku danych zapisanych na koncie można użyć dostępnych funkcji usuwania dokumentu, importu lub obrazu albo skontaktować się z Administratorem.

**[DO UZUPEŁNIENIA: opisać działającą ścieżkę usunięcia konta i eksportu danych.]**

## 14. Dzieci

CV Studio jest narzędziem do przygotowywania dokumentów rekrutacyjnych i nie jest kierowane do małych dzieci.

**[DO UZUPEŁNIENIA: ustalić minimalny wiek w regulaminie z uwzględnieniem podstawy przetwarzania i polskich przepisów dotyczących zdolności do zawierania umów; zapewnić spójność z mechanizmem rejestracji.]**

Jeżeli dowiesz się, że dziecko przekazało Administratorowi dane niezgodnie z prawem, skontaktuj się z nim.

## 15. Zmiany polityki

Polityka może być aktualizowana, gdy zmieni się sposób działania CV Studio, dostawcy, prawo lub wymagania bezpieczeństwa. Aktualna wersja będzie dostępna pod adresem **[DO UZUPEŁNIENIA: stały URL polityki]** wraz z datą wejścia w życie.

O istotnych zmianach dotyczących zarejestrowanych użytkowników Administrator poinformuje w aplikacji lub e-mailem, jeżeli będzie to wymagane albo uzasadnione znaczeniem zmiany.

## 16. Podstawowe źródła prawne i informacje dostawców

- [Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2016/679 — RODO](https://eur-lex.europa.eu/legal-content/PL/TXT/?uri=CELEX:32016R0679);
- [Prawo komunikacji elektronicznej](https://eli.gov.pl/eli/DU/2024/1221/ogl);
- [UODO — prawa osób, których dane dotyczą](https://uodo.gov.pl/pl/493);
- [Komisja Europejska — standardowe klauzule umowne](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en);
- [Render — dodatek dotyczący przetwarzania danych](https://render.com/dpa);
- [AWS — centrum zgodności z RODO](https://aws.amazon.com/compliance/gdpr-center/);
- [OpenAI — prywatność danych biznesowych](https://openai.com/business-data/);
- [Cloudflare Workers AI — wykorzystywanie danych](https://developers.cloudflare.com/workers-ai/platform/data-usage/).

---

# Checklista właściciela przed publikacją — usuń tę część z wersji publicznej

1. Uzupełnij tożsamość i dane kontaktowe Administratora, domenę, IOD oraz datę wejścia w życie.
2. Wdróż panel zgód przed zapisem `cvstudio.guest.events` albo usuń tę kolejkę. Zgoda powinna być uprzednia, dobrowolna, szczegółowa, udokumentowana i równie łatwa do wycofania.
3. Ustal, wdroż i przetestuj harmonogram retencji dla logów Render, danych konta, historii importów, dokumentów, obrazów, rezerwacji AI, liczników, kopii zapasowych i martwych zadań usuwania.
4. Dodaj samodzielne usunięcie konta i eksport danych albo opisz sprawną procedurę ręczną. Sprawdź kaskady w bazie i usuwanie prywatnych obiektów S3.
5. Zdecyduj, czy dane szczególnych kategorii są zakazane, czy obsługiwane na podstawie wyraźnej zgody. Dodaj odpowiedni interfejs przed wysłaniem treści do AI i zapis dowodu zgody.
6. Zawrzyj lub zaakceptuj umowy powierzenia przetwarzania z Render, AWS, Cloudflare i OpenAI. Sprawdź podwykonawców, regiony, transfery, Data Privacy Framework, standardowe klauzule umowne i wykonaj ocenę ryzyka transferu, gdy jest potrzebna.
7. Sprawdź rzeczywiste ustawienia retencji OpenAI, możliwość Zero Data Retention oraz czy konto nie ma włączonego dobrowolnego udostępniania danych do ulepszania modeli.
8. Zweryfikuj region usług Render/PostgreSQL i AWS S3. Wybierz region EOG, gdy jest dostępny, ale nie przedstawiaj tego jako całkowitego braku transferów.
9. Przeprowadź audyt logów wyjątków, aby upewnić się, że pełna treść CV, tokeny, adresy ofert i odpowiedzi AI nie trafiają do logów. Zastosuj redakcję danych.
10. Rozważ zastąpienie ścieżki `/cvstudio/{username}` neutralną ścieżką. Nazwa użytkownika w URL może trafić do historii przeglądarki, logów i infrastruktury CDN.
11. Dodaj krótką informację warstwową bezpośrednio przy rejestracji, imporcie PDF, pierwszym użyciu AI, przesyłaniu zdjęcia i ewentualnej zgodzie analitycznej. Sam link w stopce może być niewystarczający.
12. Przed uruchomieniem płatności uzupełnij operatora, dane transakcyjne, podstawy z art. 6 ust. 1 lit. b i c RODO, retencję podatkowo-księgową, odbiorców i transfery.
13. Przed uruchomieniem Google Login dodaj Google jako odbiorcę i opisz źródło danych, zakres OAuth, podstawę prawną, retencję i transfery.
14. Polska wersja jest odpowiednia dla polskojęzycznych użytkowników. Przy wejściu na inne rynki UE udostępnij politykę w języku zrozumiałym dla właściwej grupy i sprawdź lokalne wdrożenie przepisów ePrivacy.
15. Uzyskaj końcową weryfikację prawnika specjalizującego się w RODO, usługach cyfrowych i prawie konsumenckim.
