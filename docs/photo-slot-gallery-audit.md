# Audyt: sloty na zdjęcie i otwieranie galerii w szablonach

Data: 2026-08-18
Zakres: 13 szablonów w `frontend/src/templates/*.js`

## Cel

Ustalić, w których szablonach można wstawić wcześniej wgrane zdjęcie
(`photoSlot`) oraz w których kliknięcie w slot na zdjęcie otwiera galerię
zdjęć użytkownika. Te dwa mechanizmy są od siebie **niezależne** — szablon
może mieć slot oznaczony jako slot na zdjęcie, a mimo to nie reagować na
kliknięcie.

## Mechanizm (jak to działa dziś)

Dwie osobne rzeczy decydują o zachowaniu:

### (a) „To jest slot na zdjęcie” — pole `photoSlot`

Ustawiane bezpośrednio na elementach szablonu w `frontend/src/templates/*.js`.
Używane wartości: `"frame"` (docelowa ramka, w którą trafia zdjęcie),
`"glyph"` (podgląd/placeholder wewnątrz ramki), `"ornament"` (dekoracyjny
kształt, który zdjęcie ma przykryć), `"image"` (już zaaplikowane zdjęcie
użytkownika).

Pole jest przekazywane do komponentów w
`frontend/src/components/canvas/CanvasElements/CanvasElements.jsx:280`
(do `Image`) i `:316` (do `Rectangle`). **Nie jest przekazywane do
`Ellipse`** (koło) — linie 320–337 tego pliku nie przekazują `photoSlot`
do komponentu koła w ogóle.

Logika dopasowania „który element to slot na zdjęcie” (w tym starsza
heurystyka dla szablonów bez tagu `photoSlot`) jest w
`frontend/src/utils/profilePhoto.js`:
- `isProfilePhotoFrame` (linia ~74–78)
- `findProfilePhotoSlot` (linia ~204–234)

### (b) „Kliknięcie otwiera galerię” — zaimplementowane WYŁĄCZNIE w `Rectangle.jsx`

`frontend/src/components/canvas/Rectangle/Rectangle.jsx:47`:

```js
const isPhotoFrame = isProfilePhotoFrame({ photoSlot, id: semanticId });
```

`handleClick` (linie 53–58):

```js
function handleClick(e) {
    selectElement(elementId, e.ctrlKey || e.metaKey);
    if (isPhotoFrame && !e.ctrlKey && !e.metaKey) {
        showGallery?.();
    }
}
```

Warunki, które muszą być spełnione **jednocześnie**, żeby kliknięcie w
canvas otworzyło galerię:

1. Element ma `photoSlot: "frame"` (albo pasuje do starszej heurystyki po `id`).
2. Element ma `category: "rectangle"` — bo tylko `Rectangle.jsx` ma tę logikę.
   `Image.jsx` (glify) i `Ellipse.jsx` (ramki-koła) **nie mają w ogóle**
   obsługi `photoSlot`/`showGallery`.
3. Element **nie ma** `fixedToPage: true` — bo `Rectangle.jsx:79–81` zwraca
   wtedy wcześniej goły, nieinteraktywny `<div>` (z `pointerEvents: none`),
   zanim handler kliknięcia zostanie w ogóle podpięty:

   ```js
   if (fixedToPage) {
       return <div id={elementId} style={style} />;
   }
   ```

`showGallery` prowadzi do `handleShowGallery` w
`frontend/src/pages/PdfCanvas.jsx:940`, który otwiera ten sam panel galerii,
co przycisk „Zdjęcia” w sidebarze
(`frontend/src/components/editor/Sidebar/Sidebar.jsx:67`). **Dodanie zdjęcia
przez sidebar działa zawsze**, niezależnie od tego, czy klik w canvas działa
— sidebar korzysta z `applyProfilePhoto` w `profilePhoto.js`, który sam
potrafi trafić w odpowiedni element nawet bez klikalnej ramki.

**Wniosek:** `photoSlot` i „klik otwiera galerię” to dwie różne rzeczy.
Posiadanie `photoSlot: "frame"` NIE gwarantuje, że kliknięcie zadziała —
do tego potrzeba dodatkowo `category: "rectangle"` i braku `fixedToPage`.

## Wynik per szablon (13 szablonów)

| Szablon | Ma slot na zdjęcie? | `photoSlot` ustawiony? | Kategoria ramki | Klik otwiera galerię? |
|---|---|---|---|---|
| **atrium** | Nie — tylko małe ikony (telefon/e-mail/linkedin/github/www/lokalizacja), `category:"image"`, żadna nie ma `photoSlot` | Nie | — | Nie |
| **axis** | Nie — ten sam wzorzec ikon co atrium | Nie | — | Nie |
| **blueprint** | Nie — brak jakichkolwiek elementów `image` | Nie | — | Nie |
| **cardinal** | Nie — ikony kontaktowe / ikony nagłówków sekcji, żadna nieoznaczona | Nie | — | Nie |
| **cinder** | Tak — `cinder-frame-one` (+ 2 kształty `photoSlot:"ornament"`) | Tak, `"frame"` | `rectangle`, bez `fixedToPage` | **Tak** |
| **harbor** | Tak — `harbor-photo-frame` + `harbor-photo-glyph` | Tak, `"frame"`/`"glyph"` | `category: "circle"` (Ellipse) | **Nie** — `Ellipse.jsx` w ogóle nie ma tej logiki |
| **iconic** | Tak — `nova-photo-well` (ornament) + `nova-photo-frame` | Tak, `"frame"`/`"ornament"` | `rectangle`, bez `fixedToPage` | **Tak** |
| **monument** | Tak — `monument-masthead-frame` (+ 3 kształty `photoSlot:"ornament"`) | Tak, `"frame"`/`"ornament"` | `rectangle`, ale **`fixedToPage: true`** (potwierdzone w źródle) | **Nie** — wczesny `return` w `Rectangle.jsx` pomija handler kliknięcia |
| **nimbus** | Tak — `nimbus-photo-fill` (ornament), `nimbus-photo-frame`, `nimbus-photo-image` | Tak, `"frame"`/`"ornament"`/`"image"` | `rectangle`, bez `fixedToPage` | **Tak** |
| **portico** | Tak — `portico-photo-well` (ornament) + `portico-photo-frame` | Tak, `"frame"`/`"ornament"` | `rectangle`, bez `fixedToPage` | **Tak** |
| **sterling** | Nie — brak jakichkolwiek elementów `image` | Nie | — | Nie |
| **tessera** | Tak — `tessera-photo-frame` + `tessera-photo-glyph` | Tak, `"frame"`/`"glyph"` | `rectangle`, ale **`fixedToPage: true`** | **Nie** |
| **slate** | Tak — `slate-photo-frame` + `slate-photo-glyph` | Tak, `"frame"`/`"glyph"` (potwierdzone w źródle) | `rectangle`, ale **`fixedToPage: true`** (potwierdzone w źródle) | **Nie** |

## Podsumowanie

- **5 szablonów bez slotu na zdjęcie kandydata w ogóle**: atrium, axis,
  blueprint, cardinal, sterling. Jedyne elementy `category:"image"` (tam,
  gdzie występują) to małe ikony dekoracyjne (kontakt/sekcje), nigdy
  oznaczone `photoSlot`.
- **8 szablonów ma zadeklarowany obszar na zdjęcie (`photoSlot`)**: cinder,
  harbor, iconic, monument, nimbus, portico, slate, tessera.
- Z tych 8, tylko **4 faktycznie otwierają galerię po kliknięciu ramki na
  canvasie**: cinder, iconic, nimbus, portico — bo ich ramka to zwykły,
  nie-`fixedToPage` element `rectangle`, przechodzący przez logikę
  `handleClick`/`showGallery` w `Rectangle.jsx`.
- Pozostałe **4 mają metadane `photoSlot`, ale klik nie działa**, z dwóch
  różnych powodów:
  - **harbor**: ramka to `category:"circle"` → renderowana przez
    `Ellipse.jsx`, który w ogóle nie ma propa `photoSlot` ani obsługi
    kliknięcia/galerii.
  - **monument, slate, tessera**: ramka to `category:"rectangle"` z
    `photoSlot:"frame"`, ale też `fixedToPage: true`, więc `Rectangle.jsx`
    wchodzi w gałąź wczesnego `return` (goły, nieinteraktywny `<div>`)
    zanim handler kliknięcia zostanie podpięty.
  - We wszystkich czterech przypadkach użytkownik nadal może dodać zdjęcie
    przez przycisk „Zdjęcia” w sidebarze — po prostu nie działa to przez
    bezpośredni klik w slot na canvasie.

## Co trzeba zrobić, żeby ujednolicić (do dalszej decyzji)

Żeby wszystkie 8 szablonów z `photoSlot` zachowywały się tak samo (klik →
galeria), potrzebne są zmiany w dwóch różnych miejscach, bo przyczyny
niespójności są różne:

1. **harbor** (ramka-koło): dodać obsługę `photoSlot`/`showGallery` do
   `frontend/src/components/canvas/Ellipse/Ellipse.jsx`, analogicznie do
   `Rectangle.jsx` (przekazać `photoSlot` z `CanvasElements.jsx`, dodać
   `isPhotoFrame`/`handleClick`). Wymaga też sprawdzenia, czy pominięcie
   `fixedToPage`-guard jest bezpieczne dla kółek w innych szablonach.
2. **monument, slate, tessera** (ramka `fixedToPage: true`): to trudniejsza
   decyzja produktowa — `fixedToPage` istnieje po to, żeby chronić chrome
   szablonu przed przypadkowym przesunięciem/edycją. Otwarcie tego pod klik
   wymaga albo (a) osobnej flagi rozróżniającej „zablokowane pozycyjnie, ale
   nadal klikalne dla zdjęcia” od pełnego zablokowania interakcji, albo
   (b) przeniesienia testu `isPhotoFrame` przed early-return w
   `Rectangle.jsx` i jawnego dopuszczenia klikalności tylko dla tego
   przypadku (zachowując `pointerEvents: none` dla reszty stylu).
3. **atrium, axis, blueprint, cardinal, sterling** (brak slotu w ogóle):
   to nie naprawa, tylko nowa funkcja — wymaga zaprojektowania miejsca w
   layoucie każdego z tych 5 szablonów na ramkę ze zdjęciem i dodania
   nowych elementów `photoSlot:"frame"` (+ ew. `"glyph"`/`"ornament"`) po
   wzorze istniejących szablonów (np. `cinder.js` jako referencja pełnej,
   działającej implementacji).

Nie zaimplementowano żadnej z powyższych zmian — to tylko audyt stanu
obecnego, do wykorzystania przy planowaniu ujednolicenia.
