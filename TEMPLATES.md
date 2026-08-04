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
- backend: `TEMPLATE_LAYOUTS` + `_GENERATORS` w `backend/app/services/cv_generator.py`

## Lista szablonów

1. Ledger — Instytucjonalny, spokojna typografia
2. Nimbus — Jasny i minimalistyczny
3. Cinder — Ciemny i wyrazisty
4. Rift — Abstrakcyjny i redakcyjny
5. Vector — Sieci i platformy
6. Kernel — Architektura systemów
7. Relay — DevOps i niezawodność
8. Scribe — Redakcyjny i formalny
9. Regent — Executive, wyważona elegancja
10. Aldine — Szlachetny papier
11. Merit — Dyplomatyczny minimalizm
12. Monument — Monochromatyczny editorial
13. Words — Dokument w stylu Word
14. Cardinal — Szlachetna czerwień, ikony przy sekcjach
15. Moss — Botaniczna elegancja, wąski sidebar
16. Harbor — Dwukolumnowy, ikony kontaktu
17. Signal — Ryzyko i treasury
18. Obsidian — Ciemny panel boczny
19. Raven — Ciemny pasek górny
20. Graphite — Minimalistyczny, chłodne srebro
21. Onyx — Rama dyplomatyczna
22. Nova — Redakcyjny masthead z ikonami
23. Ridge — Szyna ikon przy nagłówkach
24. Loom — Sidebar rzemieślniczy z ikonami
25. Volt — Ciemny sygnał, bursztynowe akcenty
