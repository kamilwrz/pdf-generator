# Review jakości kodu i struktury — CV Studio

**Status:** P0, P1 i P2 (bez TypeScript) wdrożone (2026-08-03).  
**Pkt 12 (TypeScript):** świadomie odłożony — osobna decyzja produktowa.  
**Plan dalszy:** sekcja [Plan na później (P3+)](#plan-na-później-p3) — wrócić tu gdy będzie slot na refactor, nie mieszać z roadmapą produktową korektora.

---

## Ocena jakości (teraz)

| Moment | Ocena |
|--------|-------|
| Przed poprawkami (baseline) | **6.5 / 10** |
| Po P0–P2 (bez TS) | **8 / 10** |

### Dlaczego 8, a nie wyżej

**Co podciąga ocenę**

- CI + pinned deps + `npm test` / unittest
- Security footguny domknięte (billing defaults, sekrety, boot-check `SECRET_KEY`)
- Uploady prywatne (`GET /images/{id}/content`)
- Kontrakt szablonów + schemat elementów (`shared/pdf-element.schema.json`)
- Alembic zamiast ad-hoc ALTER
- Pierwszy poziom rozbicia god-file’ów + split kontekstu
- Smoke HTTP: ownership IDOR, metering eksportu, reject extract na Free

**Co trzyma poniżej 9**

- `cv_generator.py` nadal ~2300 LOC (themes tylko `it` + `classic`)
- `useA4Elements.js` nadal ~1300 LOC
- ~21 konsumentów nadal na fasadzie `PdfContext` (nie focused hooks)
- Brak TypeScript / pełnej walidacji Ajv na FE
- Bootstrap DB hybrydowy: `create_all` + Alembic (nie Alembic-only)
- Pokrycie testami krytycznych ścieżek jest dobre, ale nie głębokie (brak e2e UI)

**Werdykt:** jakość **wystarczająca do dalszego feature’owania** (np. roadmap korektora). Dalszy refactor to inwestycja w tempo zmian, nie blocker shipu.

---

## Zrobione

### P0 — DONE
Contract test rejestru szablonów + Nova w Free starter; usunięte `console.log` hot-path; `ALLOW_UNPAID_PLAN_SELECTION` default `false`; `ADMIN_RESET_SECRET` bez fallbacku; boot-check `SECRET_KEY`; pinned `requirements.txt` + `python-dotenv`; CI; `npm test`.

### P1 — DONE
5. `cv_generator_primitives.py` + re-export  
6. Split `useA4Elements` (history / factories / materialize)  
7. Wspólny `fillTemplate` + BioCvModal → `TemplateCarousel`  
8. `document_service` + auth’d `GET /images/{id}/content`

### P2 — DONE (oprócz #12)
9. `PdfElement.category` + `element_id` wymagane; JSON Schema; FE `assertCanvasElementRoot`  
10. Alembic (`backend/alembic/`); `init_db` → `alembic upgrade head`  
11. Nested `CanvasContext` / `UiSurfacesContext` / `SessionContext` + fasada `PdfContext`  
13. TestClient: IDOR PDF, metering eksportów, reject extract na Free  
14. `themes/it.py` + `themes/classic.py`; `useElementSelectionDrag`

12. TypeScript — **odłożone**

---

## Plan na później (P3+)

Cel: dojść do **~9 / 10** bez blokowania product work. Kolejność = ROI utrzymania.

### Faza A — szybkie wykończenie P2 (niski koszt, wysoki komfort)

1. **Dokończyć migrację `PdfContext`**  
   Przenieść pozostałych konsumentów (~21 plików: Topbar, Sidebar, AiAssistant, ModalPdfs, elementy canvas, …) na `useCanvas` / `useUiSurfaces` / `useSession`.  
   Potem usunąć lub mocno odchudzić fasadę `PdfContext`.  
   *Efekt:* mniej niepotrzebnych re-renderów, czytelniejsze zależności.

2. **Ajv (lub równoważne) na FE** względem `shared/pdf-element.schema.json`  
   Przy eksporcie / zapisie — pełniejszy kontrakt niż `assertCanvasElementRoot`.  
   *Efekt:* błędy schematu wcześniej, bliżej API.

3. **Themes: dark / monument** (i pozostałe generatory)  
   Kontynuacja wyciągnięcia z `cv_generator.py` do `backend/app/services/themes/`.  
   *Efekt:* plik poniżej ~1–1.5k LOC, łatwiejsze review layoutów.

### Faza B — struktura edytora (średni koszt)

4. **Dalszy split `useA4Elements`**  
   Wydzielić resize, multi-select, clipboard, page ops jeśli nadal siedzą w fasadzie.  
   Cel: fasada < ~400–600 LOC orchestracji.

5. **Alembic-only bootstrap**  
   Gdy migracje pokryją pełny schemat: wyłączyć `create_all` w `init_db` (albo zostawić tylko dla świeżego SQLite lokalnego z flagą).  
   *Uwaga:* wymaga sprawdzenia fresh-install na Postgres (Render).

### Faza C — decyzja produktowa (wysoki koszt / osobny projekt)

6. **TypeScript (#12) — stopniowo**  
   Najpierw: `templates/*` + `ApiClient` + typy elementów.  
   Potem: store / hooks.  
   *Nie zaczynać „cały FE naraz”.*

7. **E2E smoke (Playwright)** — opcjonalnie  
   Login → canvas → export / ownership.  
   Dopiero gdy flaki manualne staną się drogie.

### Poza tym plikiem (osobny tor)

- Roadmap produktowy korektora: `docs/PRODUCT_ROADMAP_CV_CORRECTOR.md` (Faza 0+) — **nie mieszać** z P3 jakościowym, chyba że refactor odblokowuje feature.

---

## Rekomendowana kolejność powrotu

```text
1) PdfContext → focused hooks (A1)
2) Themes dark/monument (A3)  — równolegle OK z A1
3) Ajv na eksporcie (A2)
4) Split useA4Elements (B4)
5) Alembic-only (B5) — gdy będzie pewność migracji
6) TypeScript (C6) — osobna decyzja
```

**Kiedy wrócić:** po większym feature’ze (korektor / Układ) albo gdy `cv_generator` / kontekst znów blokują PR-y.  
**Kiedy nie ruszać:** w środku dużego feature’a UI/AI — najpierw ship, potem A1/A3.

---

## Snapshot metryk (2026-08-03)

| Metryka | Wartość (orientacyjnie) |
|---------|-------------------------|
| `cv_generator.py` | ~2300 LOC |
| `useA4Elements.js` | ~1300 LOC |
| Konsumenci `PdfContext` | ~21 plików |
| Themes wydzielone | `it`, `classic` |
| Backend testy | ~227 |
| Frontend testy | ~79 |

---

## Werdykt praktyczny

P0–P2 domknęły kontrakty, CI, security, prywatność uploadów, schemat elementów, Alembic, pierwszy split kontekstu i HTTP smoke.  
**Jakość dziś: 8 / 10.**  
Plan P3 powyżej jest backlogiem utrzymaniowym — gotowy do podjęcia w osobnej sesji bez powtórnego discovery.
