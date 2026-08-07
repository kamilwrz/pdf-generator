1. LEPSZY ONBOARDING

a) I. SEKCJA NA HERO
 Sa 3 opcje:
 aa) WGRAJ CV (POTRZEBA REJESTRACJI)
 bb) CV WIZZARD
 cc) PRZYKLADOWE CV I POKAZ EDYTORA

b) II. SEKCJA NA HERO
Tez 3 opcje:
aa) SZABLONY - trzeba skasowac, albo dopracowac
bb) WGRACJ CV (POTRZEBA REJESTRACJI)
cc) FREEFORM

I i II SEKCJA "nie sa zgrane", szablony sa bez sensu w obecnym stanie. Freeform jest bardziej dodatkiem, a nie glowna usluga do sprzedania. Konieczna poprawa.

2. BUGZ po OSTATNIM REFACTORINGU

FIXED a) Logout - ikona jest mimo guest mode
FIXED b) Po zalogowaniu, jako inny uzytkownik generowane jest CV stworzone w guest mode!!! Jakby ten krok sie zawiesil i powtarzal niepotrzebnie caly czas.
FIXED c) zacznij od zera - uzyj wlasnych danych - powrot, powoduje znikniecie tego "mode"
d) po kliknieciu na "stworz cv od poczatku" w sekcji 1, zamkniecie kreatora wywala uzytkownika do freeform, bez informacji. Zamkniecie kreatora, powinno przekierowywac do sekcji 1
e) Po zaladowaniu CV przez wizarda, dane sie kasuja z local storage. Powinny byc w wizzardzie, w razie jakby uzytkownik chcial wygenerowac zmodyfikowane CV
f) Bulletlist - Textarea - nie radzi sobie z empty space. Zapamietuje w edycji. Poza edycja zaburza wysokosc uwzgledniajac content hight (niby DONE, ale teraz nie mozna dawac empty space'ow)
g) Przykladow CV nie trzyma rytmu przy wklejaniu recordow/ Sekcji nie da rady wkleic

3. KWESTIE DO ZMIANY / POPRAWY / IMPLEMENTACJI

1) A4 PREVIEW W WIZZARDZIE
DONE 2) KOLOR NA LIGHT THEME (GRAY, BLUE, GOLD, WHITE THEME)
3) DOPRACOWANIE SZABLONOW:
  aa) SIDEBAR -> nie dzialaja sekcje oraz import skilli / sekcji na sidebar
  bb) Monument -> bug w iteracji przy imporcie sekcji
  cc) Github, etc
  dd) wylapac ewentualne bugi i dopracowac...
  ee) ewentualnie nowe lub skopiowane szablony i dopracowac, moze byc mniej niz 14
4) IMAGE -> edytor sturkturalny ma uploadowac zdjecie w odpowiednich rozmiarach w odpowiednie miejsce
DONE 5) pokazywanie "Resizera" podczas edycji strukturalnej wylaczyc (drag + pola W/H w panelu)
DONE 6) nie pokazywac wartosci do edycji w panelu, jezeli nie ma to wplywu (+ brak klonuj/usun w edycji strukturalnej)
7)  strzalki w a4:
  aa) zmiana kolejnosci recordu w sekcji inne niz wyksztalcenie / edukacja (strzalki po prawej, wys. kosz/+)
  DONE bb) zmiana kolejnosci recordow w edu / exp (strzalki po prawej, wys. kosz/+)
  DONE cc) kasowanie bloku / sekcji (hover kosz obok + na naglowku sekcji / rekordu)
  dd) dodawanie rekordu w sekcji innej niz edu/exp? 
  DONE ee) zmienic UX / DESIGN
  DONE ff) zmiana kolejnosci sekcji (strzalki po prawej naglowka, jak przy rekordach)
8) Dodac: Firma . Okres > Firma . Miejsce.  Okres; to samo z edu
9) masthead / topbar mozna ruszac dragiem w edycji strukturalnej.... ewentulanie inne elementy
DONE 10) Uzytkownika zawsze ma zaczynac od zooma 130% nie 100%
11) SZABLONY - LANDING PAGE - zmienic na CV WIZZARD? SZABLONY - nei dziala rytm....

4. AI - zastanowic sie i zmodyfikowac / reImplement
