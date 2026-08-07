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

a) Logout - ikona jest mimo guest mode
b) Po zalogowaniu, jako inny uzytkownik generowane jest CV stworzone w guest mode!!! Jakby ten krok sie zawiesil i powtarzal niepotrzebnie caly czas.
c) zacznij od zera - uzyj wlasnych danych - powrot, powoduje znikniecie tego "mode"
d) po kliknieciu na "stworz cv od poczatku" w sekcji 1, zamkniecie kreatora wywala uzytkownika do freeform, bez informacji. Zamkniecie kreatora, powinno przekierowywac do sekcji 1
e) Po zaladowaniu CV przez wizarda, dane sie kasuja z local storage. Powinny byc w wizzardzie, w razie jakby uzytkownik chcial wygenerowac zmodyfikowane CV

3. KWESTIE DO ZMIANY / POPRAWY / IMPLEMENTACJI

1) A4 PREVIEW W WIZZARDZIE
2) KOLOR NA LIGHT THEME (GRAY, BLUE, WHITE THEME)
3) DOPRACOWANIE SZABLONOW:
  aa) SIDEBAR -> nie dzialaja sekcje oraz import skilli / sekcji na sidebar
  bb) Monument -> bug w iteracji przy imporcie sekcji
  cc) Github, etc
  dd) wylapac ewentualne bugi i dopracowac...
4) IMAGE -> edytor sturkturalny ma uploadowac zdjecie w odpowiednich rozmiarach w odpowiednie miejsce
5) pokazywanie "Resizera" podczas edycji strukturalnej wylaczyc
6) nie pokazywac wartosci do edycji w panelu, jezeli nie ma to wplywu
7) kasowanie bloku, ewentualnie elementu lub sekcji ma aktywowas reFlow i podciagac dolne elementy
8)  strzalki w a4:
  aa) zmiana kolejnosci recordu w sekcji inne niz wyksztalcenie / edukacja
  bb) zmiana kolejnosci recordow w edu / exp
  cc) kasowanie bloku / sekcji
  dd) dodawanie rekoru w sekcji innej niz edu/exp