# Polityka prywatności CV Studio

**Obowiązuje od: 10 września 2026 r.**

Niniejszy dokument jest kopią redakcyjną polityki publikowanej pod adresem
`https://cvstudio.com.pl/privacy`. Tekst widoczny użytkownikowi znajduje się w
`frontend/src/pages/Site/PrivacyPage.jsx` i musi być aktualizowany razem z tym
plikiem po każdej zmianie funkcji, dostawcy lub okresu przechowywania.

## 1. Administrator i kontakt

Administratorem danych osobowych jest **Kamil Wrzochalski**, osoba prywatna,
adres: Kordeckiego 56/58 m. 56, 04-355 Warszawa, Polska.

W sprawach prywatności można napisać na **kwrzochalski@gmail.com**.
Korespondencję pod tym adresem obsługuje usługa Gmail firmy Google.
Administrator nie wyznaczył inspektora ochrony danych.

## 2. Zakres danych, cele i podstawy

CV Studio przetwarza:

- nazwę użytkownika, e-mail, skrót hasła, status potwierdzenia adresu,
  identyfikator połączenia Google, datę utworzenia i status konta — aby tworzyć,
  uwierzytelniać i chronić konto; podstawą jest wykonanie umowy oraz uzasadniony
  interes w ochronie usługi (art. 6 ust. 1 lit. b i f RODO);
- treść i układ CV, dane kontaktowe wpisane do CV, zdjęcia, projekty,
  wygenerowane PDF-y, szkice i profil zawodowy, wywiady i historię importów — aby tworzyć,
  zapisywać, edytować, importować i eksportować dokumenty; podstawą jest
  wykonanie umowy (art. 6 ust. 1 lit. b RODO);
- polecenia, wybrany fragment lub pełną treść CV, odpowiedzi AI, treść ogłoszenia
  oraz publiczny adres ogłoszenia — aby wykonać wybraną funkcję AI lub import;
  podstawą jest wykonanie umowy na żądanie użytkownika, a dla beztreściowej
  diagnostyki błędów uzasadniony interes (art. 6 ust. 1 lit. b i f RODO);
- plan, limity i użycie funkcji, identyfikatory Stripe, kwotę, walutę, status i
  treść zdarzenia płatniczego — aby uruchomić płatność, aktywować plan,
  zapobiegać podwójnemu rozliczeniu i rozpatrywać reklamacje; podstawą jest
  wykonanie umowy, obowiązek prawny przy płatnościach Live i obrona roszczeń
  (art. 6 ust. 1 lit. b, c i f RODO); CV Studio nie otrzymuje pełnego numeru
  karty;
- adres IP, nagłówki żądania, czas, ścieżkę, kod odpowiedzi, błędy techniczne i
  skróty limitowania prób logowania — aby dostarczać i chronić usługę oraz
  diagnozować awarie; podstawą jest uzasadniony interes (art. 6 ust. 1 lit. f
  RODO);
- e-mail i treść korespondencji — aby obsługiwać pytania, żądania dotyczące
  danych i reklamacje; właściwą podstawą jest art. 6 ust. 1 lit. b, c albo f
  RODO, zależnie od sprawy.

Podanie danych konta jest dobrowolne, ale konieczne do zapisu i pobierania
dokumentów. Dane w CV podaje użytkownik; część danych konta może pochodzić od
Google, a informacje o płatności od Stripe.

Jeżeli użytkownik umieszcza w CV dane innej osoby, na przykład osoby
udzielającej referencji, powinien upewnić się, że może zgodnie z prawem z nich
korzystać i ograniczyć je do informacji potrzebnych w rekrutacji.

## 3. Pamięć przeglądarki

Bez logowania szkic CV i szkic kreatora mogą znajdować się wyłącznie w pamięci
lokalnej przeglądarki. Po zalogowaniu jest tam przechowywany token sesji i
pomocnicza nazwa użytkownika. Po pracy na współdzielonym urządzeniu należy się
wylogować i usunąć dane witryny.

CV Studio nie zapisuje anonimowej kolejki zdarzeń marketingowych i nie używa
Google Analytics ani piksela reklamowego. Pamięć przeglądarki służy wyłącznie
żądanej funkcji i bezpieczeństwu sesji.

## 4. Import PDF, AI i ogłoszenia

Oryginalny plik PDF jest odczytywany na potrzeby importu i nie jest zachowywany
jako plik po zakończeniu operacji. Zachowany może zostać ustrukturyzowany wynik,
nazwa i rozmiar pliku, status oraz bezpieczny kod błędu. Zależnie od funkcji
strony PDF mogą zostać zamienione na obrazy i przekazane do Cloudflare Workers
AI albo, po włączeniu alternatywnej konfiguracji, do OpenAI. Asystent i operacje
redakcyjne korzystają z API OpenAI. Pobieranie ogłoszenia odbywa się tylko po
poleceniu użytkownika i tylko dla publicznego adresu.

Nie należy umieszczać w CV, zdjęciach, ogłoszeniach ani poleceniach AI danych
szczególnych kategorii, w tym danych o zdrowiu, pochodzeniu rasowym lub
etnicznym, poglądach politycznych, religii, seksualności, danych genetycznych i
biometrycznych. AI nie podejmuje decyzji wywołujących skutki prawne lub podobnie
istotnie wpływających na użytkownika. Użytkownik zatwierdza treść i decyduje o
wysłaniu CV.

## 5. Odbiorcy i podmioty przetwarzające

- **Render Services, Inc.** — hosting frontendu i backendu, PostgreSQL oraz logi;
- **Amazon Web Services, Inc.** — prywatny magazyn S3 dla zdjęć i PDF-ów, gdy
  S3 jest włączone;
- **Cloudflare, Inc.** — Workers AI w domyślnym procesie odczytu CV;
- **OpenAI** — asystent AI, operacje na CV i opcjonalny odczyt dokumentu;
- **Google** — Google Identity Services przy logowaniu i łączeniu konta oraz
  Gmail przy korespondencji z administratorem;
- **Resend, Inc.** — dostarczenie wiadomości potwierdzającej rejestrację z
  adresu `accounts@cvstudio.com.pl`;
- **Stripe** — Checkout i płatności; Stripe może też działać jako niezależny
  administrator danych wymaganych przez przepisy dotyczące płatności;
- **home.pl S.A.** — rejestracja domeny i obsługa DNS;
- operator wskazanej publicznej strony z ofertą pracy — tylko gdy użytkownik
  poleci pobranie jej treści.

Dane mogą zostać ujawnione organom publicznym tylko wtedy, gdy wymaga tego
prawo. Administrator nie sprzedaje danych osobowych.

## 6. Transfery poza EOG

Część dostawców ma siedzibę lub infrastrukturę poza Europejskim Obszarem
Gospodarczym, w szczególności w Stanach Zjednoczonych. Właściwym mechanizmem
transferu może być decyzja stwierdzająca odpowiedni stopień ochrony, standardowe
klauzule umowne albo Ramy Ochrony Danych UE–USA, jeśli odbiorca i transfer
spełniają ich warunki. Informacje o właściwym zabezpieczeniu można uzyskać pod
adresem administratora.

Dokładny region chmury zależy od konfiguracji produkcyjnej. Administrator nie
zapewnia przechowywania wyłącznie w Polsce; regiony europejskie powinny być
wybierane, gdy są dostępne.

## 7. Okresy przechowywania

- konto, dokumenty, elementy CV, zdjęcia, szkice, wyniki importów, liczniki i
  odpowiedzi AI — do ich usunięcia przez użytkownika lub usunięcia konta;
  odpowiedzi AI nie mają obecnie dodatkowego automatycznego terminu usuwania;
- token sesji — standardowo 7 dni; link potwierdzający e-mail — 24 godziny, przy
  czym baza przechowuje jego nieodwracalny skrót;
- rekordy Stripe, w tym surowe zdarzenie webhook — do usunięcia konta; po
  uruchomieniu płatności Live wymagane dane rozliczeniowe mogą być zachowane
  dłużej na podstawie prawa lub w celu obrony roszczeń;
- logi techniczne — zgodnie z planem i ustawieniami Render; nie powinny zawierać
  treści dokumentów ani sekretów;
- korespondencja — przez czas obsługi sprawy, a następnie do upływu terminów
  dochodzenia lub obrony roszczeń;
- usunięte wpisy mogą przez ograniczony czas pozostawać w rotujących kopiach
  zapasowych dostawców, bez dalszego użycia operacyjnego.

Usunięcie konta od razu usuwa rekordy z aktywnej bazy. Prywatne pliki są usuwane
przez trwałą kolejkę z ponawianiem, dzięki czemu chwilowa awaria magazynu nie
przywraca dostępu do konta. Usunięcie nie obejmuje danych, które niezależni
administratorzy, tacy jak Stripe lub Google, muszą zachować na własnej
podstawie prawnej.

## 8. Bezpieczeństwo

Hasła są przechowywane jako skróty Argon2id, a starsze rekordy są migrowane z
bcrypt. API weryfikuje token i właściciela dokumentu, obiekty S3 są prywatne,
nazwy plików nie wyznaczają ścieżki magazynu, próby logowania i rozmiary żądań
są ograniczane, a produkcja korzysta z HTTPS. Żaden system nie daje absolutnej
gwarancji bezpieczeństwa.

## 9. Prawa użytkownika

W granicach RODO użytkownik może żądać dostępu do danych, ich sprostowania,
usunięcia, ograniczenia przetwarzania, przeniesienia oraz sprzeciwić się
przetwarzaniu opartemu na uzasadnionym interesie. Zgodę, gdy stanowi podstawę,
można wycofać bez wpływu na wcześniejsze przetwarzanie.

Zalogowany użytkownik może pobrać dane i usunąć konto w sekcji **Konto i plan**.
Eksport nie zawiera haseł, tokenów, identyfikatora Google ani kluczy magazynu.
Pozostałe żądania należy wysyłać na `kwrzochalski@gmail.com`; administrator może
poprosić o potwierdzenie tożsamości.

Użytkownik może złożyć skargę do Prezesa Urzędu Ochrony Danych Osobowych, ul.
Stanisława Moniuszki 1A, 00-014 Warszawa, przez informacje dostępne na
`https://uodo.gov.pl/`.

## 10. Wiek i zasięg usługi

CV Studio jest przeznaczone dla konsumentów, którzy ukończyli 18 lat. Usługa
może być używana na całym świecie z zastrzeżeniem dostępności technicznej i
lokalnego prawa.

## 11. Zmiany polityki

Data obowiązywania jest podana na początku. O istotnej zmianie dotyczącej
aktywnego konta administrator poinformuje w aplikacji lub e-mailem, jeśli będzie
to wymagane.

## Kontrola przed uruchomieniem lub zmianą produkcji

Ta część nie jest publikowanym obowiązkiem informacyjnym. Jest checklistą dla
operatora:

1. potwierdzić region usługi i PostgreSQL w Render oraz retencję logów;
2. potwierdzić region koszyka AWS S3;
3. zweryfikować obowiązujące umowy DPA, listy podwykonawców i mechanizmy
   transferu dla Render, AWS, Cloudflare, OpenAI, Google, Resend, Stripe i
   home.pl;
4. potwierdzić ustawienia retencji i użycia danych w API OpenAI;
5. przed przejściem Stripe z testu na Live zweryfikować dane sprzedawcy,
   dopuszczalną formę prowadzenia odpłatnej usługi, obowiązki podatkowe,
   regulamin, informacje konsumenckie i wymagane okresy retencji;
6. przed aktywnym kierowaniem usługi poza Polskę udostępnić politykę i warunki
   w języku zrozumiałym dla odbiorców oraz sprawdzić wymagania lokalne;
7. poddać tekst przeglądowi prawnemu przed szerokim udostępnieniem usługi.

## Profil zawodowy i wywiady

Wywiad zapisuje pytania, odpowiedzi, wybrane źródło CV, ofertę i podgląd wyniku
na koncie. Dopiero zatwierdzone informacje trafiają do wspólnego profilu zawodowego.
Pytania i generowanie przekazują potrzebne informacje OpenAI. Profil można poprawiać
i usuwać również po wygaśnięciu Pro. Usunięcie wywiadu nie usuwa zatwierdzonych
faktów z profilu ani utworzonych CV; usunięcie profilu nie usuwa wcześniejszych
dokumentów i historii rozmów. Eksport oraz usunięcie konta obejmują profil i wywiady.
Logi operacji wywiadu obejmują rodzaj zdarzenia i koszt, bez treści odpowiedzi.
Profil i rozmowy pozostają do usunięcia przez użytkownika lub usunięcia konta;
nie mają osobnego automatycznego terminu czyszczenia.
