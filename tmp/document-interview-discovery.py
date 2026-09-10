from pathlib import Path
import re
import importlib.util

readme = Path('README.md')
s = readme.read_text(encoding='utf-8')
en = '''### Discovering the Pro career interview

The interview is introduced as a way to turn real experience into CV content. The minimum path is **library → interview → confirm facts → preview → save a new CV**. For an existing offer, the help guide directs the owner to **open a CV → assistant → Dopasuj do oferty → Dopasuj z wywiadem — nowe CV**. This keeps the selected source in the existing assistant instead of inventing a second tailoring route.

- `/help#wywiad` explains creation/enrichment, the initial eight-question limit, voluntary extra rounds, beginner projects, answer meanings, clarification, credits and resuming saved answers. Native disclosures keep optional explanations collapsed.
- `/help#dopasowanie` explains the initial five-question tailoring round, review and preservation of the source document. `/help#profil` explains field edits, explicit profile save and the separate effects of deleting profiles, interviews and documents.
- `/pricing#wywiad` explains the benefit and shared credit pool. `PLAN_PRESENTATION` puts the interview first in Pro benefits, so public pricing, the landing, registration and the plan picker use the same wording. Backend prices and entitlements remain authoritative.
- The library replaces its supporting hero note with a direct interview invitation only when the resolved server `ai_assistant` entitlement is exactly `true`. The account page uses the same condition for its Pro interview section. Loading, unavailable and Free access never claim active Pro access; the existing profile navigation remains available. No invitation invokes paid AI.
- The landing feature list links to the help guide. The existing start chooser entry states Pro and credit requirements. Interview help opens in an explicitly labelled new tab so reading instructions does not navigate away from the current answer.

`SiteLayout` scrolls to and focuses a matching fragment after a client-side route mounts; ordinary route changes retain heading focus. The new help topics preserve existing URLs and anchors. This change adds no endpoint, schema, migration, runtime dependency, price, credit allowance or PDF behavior. The interview still needs active Pro and available credits for AI operations; profile management remains free after Pro expires. Unsaved answer text is not promised to survive a browser restart.

Implementation (verified whole-module extents):

{EN_MAP}

Tests: `frontend/e2e/interview-discovery.spec.js` covers pricing-to-help navigation and focus, keyboard disclosures, 390/834/1280/1920 px widths, 200% text zoom, Pro invitations, Free/unavailable access and plan-picker copy without paid calls. `planPresentation.test.js` verifies canonical benefits and retained server pricing. Run `npm run test:e2e -- e2e/interview-discovery.spec.js e2e/site-architecture.spec.js --project=desktop-chromium`, `npm test`, `npm run test:runtime`, `npm run lint` and `npm run build` from `frontend/`. The new browser test lives in the existing `frontend/e2e/` directory; application folder and database structures are unchanged. Deploy through the existing frontend pipeline. Tests use mocked account data and do not verify production activation or live AI quality. [WAI page structure](https://www.w3.org/WAI/tutorials/page-structure/) explains semantic regions, headings and navigation used by the guide.

'''
pl = '''### Odkrywanie wywiadu zawodowego w Pro

Wywiad jest przedstawiony jako sposób przełożenia rzeczywistych doświadczeń na treść CV. Najkrótsza ścieżka to **biblioteka → wywiad → zatwierdzenie faktów → podgląd → zapis nowego CV**. Przy konkretnej ofercie pomoc prowadzi właściciela przez **otwarcie CV → asystent → Dopasuj do oferty → Dopasuj z wywiadem — nowe CV**. Wybrane źródło pozostaje w istniejącym asystencie, bez tworzenia drugiej trasy dopasowania.

- `/help#wywiad` opisuje tworzenie/uzupełnianie, początkowy limit ośmiu pytań, dobrowolne kolejne rundy, projekty początkujących, znaczenie odpowiedzi, doprecyzowanie, kredyty i powrót do zapisanych odpowiedzi. Natywne rozwijane sekcje ukrywają dodatkowe wyjaśnienia do momentu ich otwarcia.
- `/help#dopasowanie` opisuje pierwszą rundę pięciu pytań pod ofertę, przegląd wyniku i zachowanie dokumentu źródłowego. `/help#profil` wyjaśnia edycję pól, jawny zapis profilu oraz odrębne skutki usuwania profilu, wywiadu i dokumentów.
- `/pricing#wywiad` wyjaśnia korzyść i wspólną pulę kredytów. `PLAN_PRESENTATION` umieszcza wywiad na początku korzyści Pro, więc cennik publiczny, landing, rejestracja i wybór planu używają tych samych opisów. Źródłem prawdy dla cen i uprawnień pozostaje backend.
- Biblioteka zastępuje pomocniczą notatkę nagłówka bezpośrednim zaproszeniem do wywiadu tylko wtedy, gdy pobrane z serwera uprawnienie `ai_assistant` ma dokładnie wartość `true`. Strona konta stosuje ten sam warunek do sekcji wywiadu Pro. Ładowanie, niedostępność i Free nie deklarują aktywnego dostępu Pro; istniejąca nawigacja profilu pozostaje dostępna. Zaproszenia nie uruchamiają płatnego AI.
- Lista funkcji na stronie głównej prowadzi do instrukcji. Dotychczasowe wejście w ekranie startowym podaje wymóg Pro i kredytów. Pomoc w wywiadzie otwiera się w wyraźnie opisanej nowej karcie, aby czytanie instrukcji nie opuszczało bieżącej odpowiedzi.

`SiteLayout` przewija do wskazanego fragmentu i ustawia na nim fokus po wyrenderowaniu trasy przeglądarkowej; zwykłe zmiany trasy zachowują fokus nagłówka. Nowe tematy pomocy zachowują dotychczasowe adresy i kotwice. Zmiana nie dodaje endpointu, schematu, migracji, zależności uruchomieniowej ani zmian cen, puli kredytów i PDF. Operacje AI wywiadu nadal wymagają aktywnego Pro i dostępnych kredytów; zarządzanie profilem pozostaje bezpłatne po wygaśnięciu Pro. Nie obiecujemy zachowania niewysłanego tekstu po restarcie przeglądarki.

Implementacja (zweryfikowane zakresy całych modułów):

{PL_MAP}

Testy: `frontend/e2e/interview-discovery.spec.js` sprawdza przejście z cennika do pomocy i fokus, rozwijanie klawiaturą, szerokości 390/834/1280/1920 px, zoom tekstu 200%, zaproszenia Pro, Free/niedostępne uprawnienia i opisy w wyborze planu bez płatnych wywołań. `planPresentation.test.js` weryfikuje kanoniczne korzyści i zachowanie cen serwera. Uruchom `npm run test:e2e -- e2e/interview-discovery.spec.js e2e/site-architecture.spec.js --project=desktop-chromium`, `npm test`, `npm run test:runtime`, `npm run lint` i `npm run build` z `frontend/`. Nowy test przeglądarkowy znajduje się w istniejącym `frontend/e2e/`; struktura aplikacji i bazy pozostaje bez zmian. Wdrażaj przez istniejący proces frontendu. Testy używają mocków konta i nie weryfikują aktywacji produkcyjnej ani jakości rzeczywistych odpowiedzi AI. [Struktura strony według WAI](https://www.w3.org/WAI/tutorials/page-structure/) wyjaśnia semantyczne regiony, nagłówki i nawigację użyte w instrukcji.

'''
files = {
    'frontend/src/pages/Site/PublicPages.jsx': 'PricingPage, HelpPage',
    'frontend/src/utils/planPresentation.js': 'PLAN_PRESENTATION, applyPlanPresentation',
    'frontend/src/pages/Site/DocumentsPage.jsx': 'DocumentsPage',
    'frontend/src/pages/Site/AccountPage.jsx': 'AccountPage',
    'frontend/src/pages/Hero/Hero.jsx': 'Hero',
    'frontend/src/components/editor/StartChooser/StartChooser.jsx': 'StartChooser',
    'frontend/src/pages/Site/InterviewPage.jsx': 'InterviewPage',
    'frontend/src/components/ai/Interview/InterviewFlow.jsx': 'InterviewFlow',
    'frontend/src/components/common/SiteLayout/SiteLayout.jsx': 'SiteLayout',
    'frontend/src/components/common/SiteLayout/SiteLayout.module.css': 'guideFaq',
    'frontend/e2e/interview-discovery.spec.js': 'Playwright',
}
def file_map(word):
    return '\n'.join(f'- `{path}`, {word} 1–{len(Path(path).read_text(encoding="utf-8").splitlines())}, `{symbol}`.' for path,symbol in files.items())
s = s.replace('### Site navigation, document library, and private bookmarks', en.replace('{EN_MAP}', file_map('lines')) + '### Site navigation, document library, and private bookmarks',1)
s = s.replace('### Nawigacja serwisu, biblioteka dokumentów i prywatne adresy CV', pl.replace('{PL_MAP}', file_map('linie')) + '### Nawigacja serwisu, biblioteka dokumentów i prywatne adresy CV',1)
for path in files:
    n = len(Path(path).read_text(encoding='utf-8').splitlines())
    s = re.sub(r'(`'+re.escape(path)+r'`, (?:lines|linie) )\d+–\d+', lambda m:m[1]+f'1–{n}', s)
    s = re.sub(r'(\| `'+re.escape(path)+r'` \| )\d+–\d+', lambda m:m[1]+f'1–{n}', s)
readme.write_text(s,encoding='utf-8')
design=Path('DESIGN.md')
d=design.read_text(encoding='utf-8').replace('### 5.9 Career interview contract\n','''### 5.9 Career interview contract

- Discoverability uses the existing site hierarchy: public pricing and landing explain the interview and link to bookmarkable help topics for the interview, tailoring and career profile. Canonical Pro copy is shared with registration and plan selection. State the shared credit pool and free profile management after Pro expires; never imply unlimited AI or a fixed number of interviews.
- Library and account invitations claim active Pro access only after the server AI entitlement resolves true. Keep manual starts, document navigation and profile management reachable. Invitations are links and never invoke paid AI automatically. Help topics use native disclosures for optional explanations, meaningful headings, fragment focus after client-side navigation, and the shared responsive guide layout. In-progress interview help opens in a labelled new tab to preserve the current form.
''')
design.write_text(d,encoding='utf-8')

spec=importlib.util.spec_from_file_location('docs_check','.github/scripts/check_documentation.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
failures=mod.readme_parity_failures(readme)
for path in [readme,design]: failures+=mod.broken_local_links(path.resolve())
print(failures)
assert not failures
