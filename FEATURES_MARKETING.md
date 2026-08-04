# CV STUDIO — Features & marketing brief

**Cel pliku:** materiał wyjściowy do sekcji **„Dlaczego CV STUDIO”** na stronie (Hero / landing) oraz do copy produktowego.  
**Źródło prawdy technicznej:** `README.md`, `docs/FEATURES.md`, kod produktu.  
**Stan oferty:** edytor A4, 14 szablonów, import PDF → fill, kreator bio, asystent AI, plany Free / Standard / Premium, eksport PDF 1:1 z płótnem.

> **Uwaga redakcyjna.** Sekcja „Dlaczego CV STUDIO” (na dole) **nie wymienia marek konkurencji**. Nazwy pojawiają się wyłącznie w wewnętrznej sekcji research — nie kopiuj ich do UI marketingowego.

---

## Jak używać tego pliku

1. **Katalog funkcji** → karty, bullet listy, flip-cards, FAQ.
2. **Research konkurencji** → kontekst strategiczny (wewnętrzny).
3. **Dlaczego CV STUDIO** → gotowe filary + bloki tekstu pod landing (bez nazw konkurentów).
4. **Szkic sekcji WWW** → struktura H2/H3 + propozycje nagłówków.

---

# 1. Katalog funkcji (co jest, co ułatwia, dlaczego warto)

Dla każdej funkcji: **co to jest** → **co ułatwia użytkownikowi** → **dlaczego jest dobre**.

---

### 1.1. Edytor wizualny A4 (płótno WYSIWYG)

**Co:** Prawdziwa strona **A4 pion** (595×842 pt), wiele stron, **7 typów elementów** (tekst, textarea, linia, prostokąt, koło, elipsa, obraz), zaznaczanie, przeciąganie, zmiana rozmiaru, warstwy, zoom 25–300%. Łączniki nie są częścią produktu.

**Ułatwia:** Projektowanie CV jak dokumentu, a nie jak formularza z „podglądem gdzieś z boku”. Widzisz ostateczny wygląd podczas edycji.

**Dlaczego dobre:** Rekruter ocenia układ w 5–10 sekund. Precyzja (prowadnice, odstępy w pikselach, wyrównanie) daje efekt „zrobiła to agencja”, bez Photoshopa i bez ryzyka, że eksport „rozjedzie” układ.

---

### 1.2. Typografia i bloki tekstu

**Co:** Tytuły jednoliniowe i akapity wieloliniowe; **10 czcionek** zsynchronizowanych z PDF (Inter, Roboto, Helvetica, Montserrat, Times, Playfair Display, Cormorant Garamond, Lora, Courier, JetBrains Mono); rozmiar, kolor, pogrubienie, kursywa, podkreślenie, wyrównanie, interlinia, tracking; auto-height / reflow.

**Ułatwia:** Dobór charakteru dokumentu (klasyczny serif vs nowoczesny sans vs mono) bez ryzyka, że PDF „podmieni” font.

**Dlaczego dobre:** Spójna typografia = czytelność. Te same pliki TTF w edytorze i w eksporcie eliminują klasyczny problem „na ekranie ładnie, w PDFie inaczej”.

---

### 1.3. Kształty, linie, akcenty wizualne

**Co:** Prostokąty, koła, elipsy, linie; wypełnienie / obrys; kolor i grubość. (Bez łączników strzałkowych — usunięte z edytora.)

**Ułatwia:** Budowanie własnego systemu wizualnego (pasek boczny, reguły sekcji, ramki) zamiast akceptowania jednego sztywnego „skina”.

**Dlaczego dobre:** Subtelne akcenty wyróżniają CV w stosie aplikacji, bez chaosu typowego dla ogólnych narzędzi graficznych.

---

### 1.4. Obrazy i galeria konta

**Co:** Upload do galerii, wielokrotne użycie w projektach, skalowanie z zachowaniem proporcji, dowolna pozycja na stronie.

**Ułatwia:** Jedno dobre zdjęcie / logo działa w wielu wersjach CV — bez ponownego uploadu.

**Dlaczego dobre:** Zdjęcie i branding są częścią pierwszego wrażenia; kontrola pozycji na A4 jest ważniejsza niż „wstaw miniaturę w formularzu”.

---

### 1.5. Prowadnice i precyzja układu

**Co:** Snap do wyrównania, pomarańczowe markery z odstępem w px, wyrównanie do strony (L/C/R), z-index, blokada elementów, multi-select.

**Ułatwia:** Domknięcie layoutu bez zgadywania „czy to jest równo”.

**Dlaczego dobre:** Profesjonalny dokument poznaje się po równych kolumnach i stałych odstępach — to właśnie widzi rekruter, nawet jeśli nie nazwie tego „kerningiem”.

---

### 1.6. Blokada dekoracji szablonu (`fixedToPage`)

**Co:** Elementy chrome szablonu są nienaruszalne w edytorze (nie da się ich przypadkiem przesunąć / usunąć).

**Ułatwia:** Edycję treści bez ryzyka zepsucia tła, ramek i ikon systemowych szablonu.

**Dlaczego dobre:** Łączy wolność płótna z bezpieczeństwem „nie zepsuję designu jednym kliknięciem” — typowy ból w narzędziach typu „pełna swoboda bez reguł”.

---

### 1.7. Autozapis, cofnij/ponów, wiele stron

**Co:** Debounced autosave elementów, undo/redo w sesji, dodawanie / klonowanie / kolejność / usuwanie stron, tytuł projektu.

**Ułatwia:** Pracę w przerwach — CV powstaje etapami; nic nie znika w połowie zdania.

**Dlaczego dobre:** Poszukiwanie pracy jest stresujące; stabilny rytm edycji obniża tarcia i liczbę porzuconych projektów.

---

### 1.8. Biblioteka 17 indywidualnych szablonów

**Co:** Każdy szablon ma własną nazwę i krótki opis stylistyczny (np. Ledger, Harbor, Cardinal, Volt) — bez kategorii branżowych w UI. Mockupy A4 w galerii i przy wyborze po imporcie.

**Ułatwia:** Start od konkretnego charakteru dokumentu, zamiast generycznego „CV nr 3” albo koszyka „Finanse / IT”.

**Dlaczego dobre:** Szablon to sygnał wizualny. Lepszy start = mniej czasu na „odbudowę” dokumentu od zera i większa pewność przy wysyłce.

---

### 1.9. Deterministyczne wypełnianie szablonu (Python layout)

**Co:** Po ekstrakcji lub kreatorze bio dane `cv_data` są układane algorytmem layoutu (nie „AI zgaduje współrzędne”).

**Ułatwia:** Powtarzalny, przewidywalny wynik: te same dane → spójny, czytelny układ w wybranym szablonie.

**Dlaczego dobre:** Modele językowe świetnie piszą tekst, ale słabo gwarantują geometrię A4. Rozdzielenie **treści (AI)** i **układu (deterministyczny silnik)** daje ładne CV bez „pływających” bloków i zepsutych sekcji.

---

### 1.10. Import CV z PDF („Wypełnij z mojego CV”)

**Co:** Upload PDF → ekstrakcja (imię, stanowisko, doświadczenie, edukacja, umiejętności, sekcje własne) → wybór szablonu (z hover-mockupem) → fill na płótno. Te same dane do wielu szablonów bez ponownego uploadu.

**Ułatwia:** Migrację ze starego Worda/PDF-a w minuty zamiast przepisywania całego życia zawodowego.

**Dlaczego dobre:** Większość kandydatów już ma CV — problemem jest odświeżenie formy, nie zaczynanie od pustej kartki. Import + wybór wyglądu to najszybsza ścieżka do „nowego dokumentu pod nową rolę”.

---

### 1.11. Podgląd mockupu szablonu na hover (krok 2 importu)

**Co:** Po lewej animowany podgląd A4 (opacity 0↔1) przy najechaniu na nazwę szablonu.

**Ułatwia:** Świadomy wybór wyglądu przed wypełnieniem — bez zgadywania po samej nazwie.

**Dlaczego dobre:** Decyzja o szablonie jest wizualna; podgląd zmniejsza liczbę „wybrałem źle, zaczynam od nowa”.

---

### 1.12. Kreator bio krok po kroku

**Co:** Formularz: dane osobowe, doświadczenie, edukacja, umiejętności, języki, własne sekcje (projekty, referencje…), podsumowanie; zapis szkicu; generacja do szablonu. Działa też na planie Free (bez ekstrakcji z PDF).

**Ułatwia:** Osobom bez gotowego PDF-a przejście przez pełną strukturę CV bez zapomnienia kluczowych sekcji.

**Dlaczego dobre:** Struktura > inspiracja. Kreator wymusza kompletność; potem płótno i AI dopracowują jakość.

---

### 1.13. Sekcje rekordowe (projekty, referencje, nagrody…)

**Co:** Wpisy ze strukturą tytuł + opis punktowany (jak doświadczenie), nie płaska lista chipów.

**Ułatwia:** Pokazanie projektów i osiągnięć w hierarchii, którą rekruter skanuje wzrokiem.

**Dlaczego dobre:** Płaskie listy „zabijają” kontekst. Rekordy = czytelna narracja kariery w sekcjach poza klasycznym doświadczeniem.

---

### 1.14. Asystent AI na płótnie

**Co:** Pływający coach z akcjami:

| Akcja | Korzyść dla użytkownika |
|--------|-------------------------|
| Oceń CV | Szybki „health check” 1–10 |
| Projekt | Krytyka wizualna układu |
| Dopasowanie | CV vs wklejone ogłoszenie |
| Gramatyka | Poprawki językowe |
| Styl | Ton i klarowność |
| Ulepsz | Mocniejsze bullet points (action verbs) |
| Wynik ATS | Sygnał czytelności dla systemów ATS |
| Układ — Premium | Wyrównania, odstępy i review cards do akceptacji na całym płótnie |

Standard obejmuje siedem analiz z tabeli poza Układem oraz chat naturalnym językiem. Premium dodaje Układ; niezależnie od planu użytkownik akceptuje albo odrzuca każdą propozycję.

**Ułatwia:** Dopracowanie treści i formy **w kontekście aktualnego dokumentu**, bez skakania między edytorem a osobnym „skanerem ATS”.

**Dlaczego dobre:** AI jako coach przy Twoim CV jest bardziej użyteczne niż generyczny generator fraz. Kontrola akceptacji chroni przed ślepym przepisaniem życiorysu przez model.

---

### 1.15. Eksport PDF 1:1 z płótnem

**Co:** Render serwerowy (ReportLab) z modelu elementów; zsynchronizowane fonty; wiele stron; zoom nie wpływa na geometrię pliku.

**Ułatwia:** Pewność, że wysyłasz to, co zaprojektowałeś — nie „przybliżoną wersję”.

**Dlaczego dobre:** Zaufanie do eksportu to fundament produktu CV. Rozjazd preview↔PDF niszczy konwersję i reputację narzędzia.

---

### 1.16. Moje dokumenty i zarządzanie projektami

**Co:** Lista projektów, wyszukiwanie, sortowanie, otwieranie, pobieranie, usuwanie; limity wg planu.

**Ułatwia:** Trzymanie wielu wersji CV (różne role / języki / szablony) w jednym miejscu.

**Dlaczego dobre:** Aktywne poszukiwanie pracy = wiele wariantów. Biblioteka projektów jest częścią workflow, nie dodatkiem.

---

### 1.17. Plany i kredyty AI (przejrzystość)

**Co (skrót oferty produktowej):**

| Plan | Istota |
|------|--------|
| **Free** | Edytor + eksport, 5 szablonów startowych, limity projektów/eksportów; bez asystenta AI |
| **Standard** | Import PDF, analizy AI treści (CV, projekt, dopasowanie, gramatyka, styl i ATS), wszystkie 14 szablonów oraz wyższe limity |
| **Premium** | Tryb Układ AI, więcej kredytów AI, bez limitu projektów/eksportów |

Model kredytów: ~1 kredyt ≈ 5 gr — rozliczenie zbliżone do realnego kosztu użycia.

**Ułatwia:** Start bez karty; płatność dopiero gdy potrzebujesz AI / pełnej biblioteki.

**Dlaczego dobre:** Przejrzysty freemium (wiemy, co jest darmowe) vs modele, w których „darmowe” kończy się przy przycisku Pobierz po godzinie pracy — to kluczowy argument zaufania na rynku PL.

---

### 1.18. Interfejs po polsku (produkt pod rynek PL)

**Co:** Marketing, edytor, AI, błędy API, modale — po polsku.

**Ułatwia:** Pracę bez tarcia językowego i bez „przetłumaczonego na szybko” UX.

**Dlaczego dobre:** Na lokalnym rynku pracy naturalny język = wyższa konwersja i mniej porzuceń. To nie jest „feature dodatkowego języka”, tylko pozycjonowanie produktu.

---

### 1.19. Auth i bezpieczeństwo sesji

**Co:** Rejestracja / logowanie, JWT, chronione płótno.

**Ułatwia:** Bezpieczne trzymanie projektów i galerii na koncie.

**Dlaczego dobre:** CV zawiera dane osobowe — konto i sesja to minimum wiarygodności produktu.

---

# 2. Research konkurencji (wewnętrzny)

Porównanie oparte o publiczne oferty i recenzje branżowe (2025–2026) oraz charakterystykę rynku PL.  
**~10 podmiotów / typów oferty** — do strategii, nie do cytowania nazw na stronie.

| # | Podmiot / typ | Typowa oferta | Typowe ograniczenia (obserwowane na rynku) |
|---|---------------|---------------|--------------------------------------------|
| 1 | Duże kreatory formularzowe (grupa marek „wypełnij sekcje → PDF”) | Szablony, frazy gotowe, checker, cover letter | Edycja poza prawdziwym płótnem; agresywny freemium / paywall przy pobraniu; mało kontroli geometrii |
| 2 | Marki PL powiązane z tym samym modelem kreatora | Szybki start, porady, PDF/DOC | Ten sam wzorzec „zbudujesz za darmo, zapłacisz przy eksporcie”; ograniczone WYSIWYG |
| 3 | Kreator portalu pracy (PL) | Darmowy start, szablony, zapis do konta portalu | Prosty formularz; mniejsza głębia designu i AI coach na dokumencie |
| 4 | Enhancv-style (storytelling, sekcje „soft”) | Silny branding osobisty, sekcje poza standardem | Często mniej „płótna DTP”; nacisk na treść i storytelling w szablonie |
| 5 | Canva / ogólne design toole | Pełna swoboda graficzna | Słaba dyscyplina ATS; łatwo o ładny chaos; brak CV-native AI (import→fill→ATS w jednym flow) |
| 6 | Kickresume | Szablony, AI copy, student-friendly | Mocniejszy „builder + content” niż precyzyjne studio A4 |
| 7 | Resume.io–style all-in-one | Builder + cover letter + job board extras | Szerokość produktu ≠ głębokość edycji dokumentu; paywall typowy dla SaaS US |
| 8 | Teal | Tailoring pod ogłoszenie, tracker aplikacji | Świetny job-search OS; CV jest jednym z modułów, nie studiem layoutu |
| 9 | Rezi / skanery ATS (Rezi, Jobscan…) | Score ATS, keyword match | Optymalizacja pod parser ≠ piękny, kontrolowany PDF A4; często osobne narzędzie od designu |
| 10 | FlowCV / „naprawdę darmowy PDF” | Transparentny free tier, dużo szablonów | Mniej głębokiego AI coach na żywym dokumencie; design w ramach builder UX, nie pełnego canvas studio |

### Wnioski strategiczne (bez nazw)

Rynek dzieli się zwykle na:

1. **Formularze + szablon** — szybko, ale użytkownik nie „czuje” dokumentu.
2. **Narzędzia graficzne** — ładnie, ale łatwo zabić ATS i spójność.
3. **ATS / job trackery** — mocna diagnostyka, słabsze studio wizualne.
4. **Freemium z pułapką na eksporcie** — buduje nieufność (w PL temat jest społecznie i regulacyjnie wrażliwy).

**Luka, w którą celuje CV STUDIO:** *studio A4 (WYSIWYG + eksport 1:1) + AI do treści/diagnostyki + deterministyczny layout + polski UX + uczciwy model Free→Standard.*

---

# 3. Dlaczego CV STUDIO

> Sekcja gotowa do generowania copy WWW. **Bez nazw konkurencji.** Odwołania ogólne do typowych rozwiązań rynku.

## 3.1. Filary (użyj jako H2 / karty)

### 1) Widzisz dokument, nie formularz
Większość kreatorów każe wypełniać pola, a „ładny PDF” pojawia się dopiero na końcu.  
**CV STUDIO** daje prawdziwe płótno A4: przeciągasz, wyrównujesz, stylizujesz — i eksportujesz to, co widzisz.  
**Dlaczego lepiej:** mniej niespodzianek przy wysyłce, więcej kontroli nad pierwszym wrażeniem rekrutera.

### 2) AI do treści — silnik do geometrii
Typowe „AI CV” próbuje jednocześnie pisać i układać. Efekt bywa nierówny: dobre zdania, krzywa siatka.  
**CV STUDIO** rozdziela role: AI pomaga wyciągnąć dane, poprawić język, ocenić ATS; **układ szablonu liczy deterministyczny silnik**.  
**Dlaczego lepiej:** powtarzalna jakość layoutu + sensowna treść, bez „magicznego” rozmieszczania bloków.

### 3) Od starego PDF do nowego wyglądu w jednym flow
Zamiast przepisywać CV albo walczyć z importem, który zostawia bałagan.  
**CV STUDIO** wyciąga treść z PDF, pokazuje podglądy szablonów i wlewa dane do wybranego układu — te same dane możesz przetestować w wielu wyglądach.  
**Dlaczego lepiej:** oszczędza godziny przy zmianie branży, języka aplikacji albo estetyki dokumentu.

### 4) Coach AI przy Twoim dokumencie — nie osobny skaner w drugiej karcie
Sam wynik ATS albo lista fraz z generatora nie wystarczy, jeśli nie widzisz ich na stronie.  
**CV STUDIO** łączy oceny, gramatykę, styl, dopasowanie do oferty i układ w asystencie osadzonym w edytorze — z akceptacją poprawek.  
**Dlaczego lepiej:** krótsza pętla „zobacz → popraw → sprawdź ponownie”.

### 5) Indywidualne szablony, nie jedna uniwersalna skórka
Generyczne biblioteki oferują dziesiątki „ładnych” layoutów bez charakteru.  
**CV STUDIO** daje 17 osobnych szablonów — każdy z nazwą i krótkim opisem stylistycznym, bez koszyków branżowych.
**Dlaczego lepiej:** szybszy wybór konkretnego charakteru dokumentu.

### 6) Precyzja jak w studiu, bezpieczeństwo jak w kreatorze
Pełna swoboda graficzna często kończy się przypadkowym zepsuciem tła. Sztywne kreatory chronią layout, ale więżą Cię w ramce.  
**CV STUDIO** daje prowadnice i warstwy, a jednocześnie blokuje dekoracje szablonu.  
**Dlaczego lepiej:** wolność tam, gdzie edytujesz treść i akcenty — ochrona tam, gdzie design ma zostać nienaruszony.

### 7) Eksport, któremu możesz zaufać
W wielu narzędziach podgląd i plik końcowy to dwa światy (inne fonty, inne łamanie).  
**CV STUDIO** renderuje PDF z tego samego modelu co płótno.  
**Dlaczego lepiej:** zero loterii przed deadline’em aplikacji.

### 8) Po polsku i bez gry w „zapłać, bo już wypełniłeś”
Część rynku uczy użytkowników, że „darmowe CV” kończy się paywallem przy pobraniu — po tym, jak włożono czas w treść.  
**CV STUDIO** startuje z realnym Free (edytor, szablony startowe, eksport w limicie) i jasno mówi, kiedy AI i pełna biblioteka są w Standard/Premium; kredyty AI są czytelne (~5 gr).  
**Dlaczego lepiej:** zaufanie jest częścią produktu. Szukasz pracy — narzędzie nie powinno Cię zaskakiwać na finiszu.

### 9) Workflow pod realne aplikowanie
Jedno CV rzadko wystarcza.  
**CV STUDIO** trzyma projekty, szkice bio, galerię obrazów i wiele wypełnień szablonów z tych samych danych.  
**Dlaczego lepiej:** wspieramy serię aplikacji, nie jednorazowy „generator PDF”.

---

## 3.2. Gotowy blok copy (długi) — „Dlaczego CV STUDIO”

**Nagłówek:** Dlaczego CV STUDIO  
**Lead:** Bo dobre CV to jednocześnie treść, układ i zaufanie do eksportu — a nie sam formularz z ładną miniaturką.

W typowych kreatorach wypełniasz pola i dopiero na końcu widzisz, czy dokument „się broni”. W ogólnych narzędziach graficznych masz pełną swobodę — i pełną odpowiedzialność za chaos, który systemy ATS słabo trawią. Osobne skanery mówią Ci, czego brakuje w słowach kluczowych, ale nie pomagają domknąć strony A4.

CV STUDIO łączy to, czego naprawdę potrzebujesz przy aplikacji: **wizualne studio A4**, **szablony pod branżę**, **import starego PDF albo kreator krok po kroku**, **asystenta AI przy żywym dokumencie** oraz **PDF wierny płótnu**. Treść może wspierać AI; geometrię pilnuje silnik layoutu — dlatego wynik jest powtarzalny, a nie „prawie dobry”.

Zaczynasz za darmo, po polsku, bez zgadywania, czy przycisk Pobierz jest pułapką. Gdy potrzebujesz więcej mocy (pełna biblioteka, import, coach AI), przechodzisz na plan z jasnymi limitami i kredytami. Cel jest prosty: od historii zawodowej do PDF-a, który otwiera drzwi na rozmowę.

---

## 3.3. Gotowy blok copy (krótki) — karty 2×2 / 3×2

| Karta | Tekst |
|-------|--------|
| **Płótno, nie formularz** | Edytujesz prawdziwe A4. To, co widzisz, trafia do PDF. |
| **AI + pewny układ** | Asystent poprawia treść i ATS; silnik układa szablon przewidywalnie. |
| **Stare CV → nowy wygląd** | Wgraj PDF, wybierz szablon z podglądu, wypełnij — bez przepisywania. |
| **17 indywidualnych szablonów** | Własna nazwa i opis stylu — wygląd z charakterem, nie „uniwersalność”. |
| **Precyzja co do piksela** | Prowadnice, odstępy, blokada dekoracji — wygląda na dopracowane. |
| **Uczciwy start** | Free bez karty. AI i pełna biblioteka — gdy naprawdę ich potrzebujesz. |

---

## 3.4. Szkic sekcji na website

Proponowana struktura pod Hero / landing:

```text
## Dlaczego CV STUDIO
Lead (1–2 zdania)

[Grid 6 kart z §3.3]

## Jak to działa inaczej
3 kroki: Wybierz / Dopracuj / Wyślij
(krótko powiąż z importem PDF, płótnem, eksportem 1:1)

## Co dostajesz w praktyce
Mini-lista: asystent AI (8 akcji) · 14 szablonów · autozapis · Moje dokumenty

## CTA
Załóż konto za darmo → /register
```

**Ton:** konkret, spokój, zero marketingowego „najlepszy na świecie”.  
**Unikać:** porównań z nazwami marek; obiecywania gwarancji zatrudnienia; twierdzeń o 100% ATS bez niuansu.  
**Wolno:** „sygnał ATS”, „czytelność dla systemów”, „PDF wierny płótnu”, „deterministyczny układ”.

---

## 3.5. Argumenty „lekka krytyka rynku” (safe do WWW)

Używaj jako kontrastu, bez wskazywania firm:

- Formularzowe kreatory **ukrywają dokument** za polami — użytkownik optymalizuje treść w ciemno.
- Narzędzia graficzne ogólnego przeznaczenia **nie pilnują dyscypliny CV** — łatwo o efekt „ładny plakat”, słaby skan.
- Same scorery ATS **diagnostykują, ale nie projektują** — dostajesz listę braków bez kontroli strony.
- Modele „zbuduj za darmo, zapłać przy pobraniu” **karzą za włożony czas** — budują nieufność dokładnie wtedy, gdy kandydat jest pod presją.
- „AI ułoży Ci całe CV” często znaczy **losową geometrię** — ładne zdania nie wystarczą, jeśli sekcje się rozjadą.

Każdy punkt domykaj benefitem CV STUDIO z §3.1.

---

# 4. Mapa funkcji → komunikat marketingowy (cheat sheet)

| Feature produktowy | Komunikat 1 linia |
|--------------------|-------------------|
| Canvas A4 | Projektujesz dokument, nie wypełniasz ankiety. |
| Prowadnice / px | Układ wygląda na dopracowany, bo jest dopracowany. |
| Chrome lock | Nie zepsujesz szablonu przypadkiem. |
| 14 szablonów | Wygląd pod branżę i rolę. |
| Import PDF | Odśwież formę bez przepisywania życia. |
| Hover mockup | Wybierasz szablon oczami, nie nazwą. |
| Bio wizard | Struktura CV nawet bez gotowego pliku. |
| Deterministic fill | Powtarzalny, czysty layout. |
| AI assistant | Coach przy Twoim dokumencie. |
| ATS / grammar / improve | Treść gotowa do systemów i ludzi. |
| PDF 1:1 | Zero loterii przy eksporcie. |
| Free + kredyty | Jasne zasady, uczciwy start. |
| PL UX | Narzędzie mówi Twoim językiem. |

---

# 5. Odniesienia (research)

Przydatne przy aktualizacji briefu (nie do cytowania nazw w sekcji „Dlaczego…”):

- Porównania AI resume builders / ATS (2026): zestawienia typu Teal, Rezi, Jobscan, Kickresume, FlowCV, Resume.io.
- Rynek PL: kreatory formularzowe, kreator portalu pracy, Enhancv PL.
- Kontekst zaufania freemium: publiczne decyzje organów ochrony konsumentów dotyczące paywalli przy pobieraniu CV (model „darmowy kreator → płatny export”).
- Canva / design tools: elastyczność vs ryzyko ATS.

Odświeżaj tę listę przy większej zmianie oferty (nowe plany, cover letter, tracker aplikacji itd.).

---

*CV STUDIO — od historii zawodowej do PDF-a gotowego na rozmowę.*
