# Szablony CV

Każdy szablon jest indywidualnym bytem produktowym: własna nazwa + krótki opis stylistyczny.
UI nie grupuje szablonów według branży ani stylu (Finanse / IT / Classic / Iconic itd.).

W kodzie pozostaje podział według struktury layoutu (`layouts`), żeby generatory i reflow
mogły współdzielić zachowanie:

| Tag | Znaczenie dla generatora |
| --- | --- |
| `single` | Jedna kolumna treści |
| `sidebar` | Dwukolumnowy układ / panel boczny |
| `icons` | Ikony przy kontakcie / nagłówkach sekcji |
| `dark` | Ciemne tło / chrome strony |

Źródła prawdy:

- frontend: `frontend/src/templates/index.js` (`name`, `description`, `layouts`)
- backend: `TEMPLATE_LAYOUTS` + `_GENERATORS` w `backend/app/services/cv_templates/registry.py`

## Lista szablonów

1. Ledger — Instytucjonalny, spokojna typografia
2. Nimbus — Jasny i minimalistyczny
3. Cinder — Ciemny i wyrazisty
4. Kernel — Architektura systemów
5. Regent — Executive, wyważona elegancja
6. Aldine — Szlachetny papier
7. Monument — Monochromatyczny editorial
8. Words — Dokument w stylu Word
9. Cardinal — Szlachetna czerwień, ikony przy sekcjach
10. Harbor — Dwukolumnowy, ikony kontaktu
11. Nova — Redakcyjny masthead z ikonami
12. Volt — Ciemny sygnał, bursztynowe akcenty
13. Tessera — Mozaikowy sidebar, prostokątne zdjęcie
14. Slate — Stalowy sidebar, siatka i prostokątne zdjęcie
