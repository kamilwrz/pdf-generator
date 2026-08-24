I.   POLITYKA PRYWATNOSCI / RODO
-----------------------------------------------------------------------------------------
II.  PLATNOSCI
-----------------------------------------------------------------------------------------
III. FUNNELING
-----------------------------------------------------------------------------------------
IV.  BUGZ / NEEDED FIXES
-----------------------------------------------------------------------------------------

1) JEZYKI - zbyt krotkie columny w sidebar-templates;dostosowac do innerContent?
2) SIDEBAR TEMPLATES - overFlow podczas kasowania elementow kontaktowych;niepotrzebnie;staly odstep
3) ATRIUM - chipsy kasuja mala linie dekoracyjna;zmiana na liste tez
4) UX / UI "Uklad CV"
5) Toast przy zmianie szablonow, ma znikac (tylko nowy ma istnies w UI)
6) Import CV - dane sie nie zapisuja na pozniej;powinny....
7) Meridian - inny layout;dodawanie sekcji powinno go skopiowac;
8) Po zapisaniu CV nie moge zmieniac szablonow;Trzeba to zaimplementowac
9) Problem w niektorych przypadkach z rodzajem rekordu i kategorii rekordu wybieranej automatycznie
10) Poprawic design i funkcjonalnosc kreatore CV
11) Dodac kategorie kolorystyczne dla szablonow
12) Zmiany po AI, powinny przechodzic do innego szablonu (np. CV po tlumaczeniu, skroceniu)
13) Dodac 2 szablonuy w stylu / layoutem Meridian
14) Seleckcja tekstu jest niewidoma na B,I,U przez editor panel i na odwrot. Ma byc tylko B,I,U przez   
    selekcje....
15) Jezeli rekord byl wybrakowany i wczytany w ten sposob do CV, nie mozna go skasowac ani dodac (CV30, CV21);
    W CV21 mozna. Doswiadczenei w CV21 jako kategoria / tresc? Dlaczego? Zrozumiec kod

 V.  TEMPLATES / CANVA A4
-----------------------------------------------------------------------------------------

1) Skopiowane szablony maja inna strukture. "RecordOverlay" - zaimplementowac dodawanie, zmiane kolejnosci, itd. (DONE)
2) Dodanie job position, jak nie ma w CV PDF lub WIZZARD
3) Wczytywanie linkow (np. LinkedIn - link ukryty)
4) Zdjecie profilowe - nie wszystkie maja ta sama funkcjonalnosc;Opcja - bez zdjecia;
5) Dodac 2-3 szablony z mniejszym akapitem;styl RenderCV
6) Za duze ikony (zmiana kolejnosci, usun, przenies na sidebar / main) i ich background
7) Lista elementow kontaktowych jest za duza
8) Zmodyfikowac rodzaj chipsow w szablonach
9) W sidebarowych szablonach jezyki na 3 nie na 4 kolumny (DONE)

a) Tessera
- schowanie job position nie powoduje znikniecia prostokata / tla dekoracyjnego (DONE)
- prostokat / tlo dekoracyjne powinien sie zwiekszac wraz z job position (DONE)
- klik na slot nie laduje galerii (DONE)

b) Slate
- schowanie job position nie powoduje znikniecia prostokata / tla dekoracyjnego (DONE)
- prostokat / tlo dekoracyjne powinien sie zwiekszac wraz z job position (DONE)
- klik na slot nie laduje galerii (DONE)
- paginacja strony jest krzywo
- skasowac 9xKWADRTA po prawej (wyglada jak menu)
- schowanie job position zaburze reflow / layout. Reflow nie powinien sie aktywowac przy    
   zmianie, dla tresci CV

c) Monument
- problem z cyframi przy zmianie kolejnosci / ewtl. manual
- klik na slot nie laduje galerii (DONE)
- zamienic element dekoracyjny na photo slot (DONE)
- brak ikon w elementach kontaktowych (DONE)

d) Atrium
- po schowaniu 'job position' kontakt jest za blisko imienia / zdjecia
- klik na slot nie laduje galerii (DONE)

e) Sterling
- brak UPPERCASE
- prak show/hide job position
- brak zdjecia profilowego / nie pokazuje sie po insert to canvas

f) Regent
- brak zdjecia profilowego

g) Nova (DELETED)
- jest ok, ale slot powinien miec ikone
- dodac inne paletty kolorow

h) Volt
- Naglowki dac BOLD
- Zwiekszyc zakres roszerzania rectangle w kontaktach

i) Vestige
- Zmniejszyc czcionke w naglowkach (Sidebar + Main)

VI.  AI
-----------------------------------------------------------------------------------------  

1) Wykrywanie i poprawiki w danym jezyku CV (DONE)
2) Skroc CV kasuje niektore elementy tekstowe... Naprawic (DONE?)

VII. INNE
-----------------------------------------------------------------------------------------
1) GOOGLE LOGIN
2) EMAIL Z POTWIERDZENIEM - REJESTRACJA
