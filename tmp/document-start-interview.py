from pathlib import Path
import re
p=Path('README.md')
s=p.read_text(encoding='utf-8')
s=s.replace('two primary cards: **Utwórz nowe CV** opens `NewCvSetupModal`, and **Zaimportuj istniejące CV** opens `AiCvPanel`.', 'three primary cards: **Utwórz nowe CV** opens `NewCvSetupModal`, **Zaimportuj istniejące CV** opens `AiCvPanel`, and the highlighted **Wywiad** opens `/app/interview` for resolved `ai_assistant: true`. Free accounts see **Dostępny w Pro**, an explanation and **Poznaj Pro** linking to `/app/account`. Unknown or failed permission loading never grants AI access; **Sprawdź dostęp** links to the account. `EditorController` passes existing entitlements into the chooser without a second plan request. Entry navigation never starts paid generation.')
s=s.replace('dwiema kartami głównymi: **Utwórz nowe CV** otwiera `NewCvSetupModal`, a **Zaimportuj istniejące CV** otwiera `AiCvPanel`.', 'trzema kartami głównymi: **Utwórz nowe CV** otwiera `NewCvSetupModal`, **Zaimportuj istniejące CV** otwiera `AiCvPanel`, a wyróżniony **Wywiad** otwiera `/app/interview` przy potwierdzonym `ai_assistant: true`. Konto Free widzi **Dostępny w Pro**, wyjaśnienie i **Poznaj Pro** prowadzące do `/app/account`. Nieznane uprawnienia lub błąd ich pobrania nie przyznają dostępu do AI; **Sprawdź dostęp** prowadzi do konta. `EditorController` przekazuje istniejące uprawnienia bez kolejnego zapytania o plan. Samo przejście nie uruchamia płatnego generowania.')
s=s.replace('two primary cards (`onNew`, `onImport`)', 'three primary cards (`onNew`, `onImport`, entitlement-aware interview link)')
s=s.replace('dwie główne karty (`onNew`, `onImport`)', 'trzy główne karty (`onNew`, `onImport`, link wywiadu zależny od uprawnień)')
s=s.replace('a two-card primary grid', 'three columns on wide screens, two columns with a full-width third choice on tablets, and one column on compact screens')
s=s.replace('gridem dwóch głównych kart', 'trzema kolumnami na szerokim ekranie, dwiema z trzecią kartą na całą szerokość na tablecie i jedną na małym ekranie')
s=s.replace('new A4 or import', 'new A4, import or Pro interview')
s=s.replace('new/import primary actions', 'new/import/interview primary actions')
s=s.replace('nowe/import jako akcje główne', 'nowe/import/wywiad jako akcje główne')
en=' Tests: `frontend/src/components/editor/StartChooser/StartChooser.runtime.test.jsx` covers keyboard order and Free/Pro/unresolved/revoked permissions; `frontend/e2e/start-interview.spec.js` checks plan destinations, all three choices, four viewport widths, reduced motion and 200% text reflow with mocked API calls. The inverse interview card reuses editor ink and paper tokens; controls remain outside saved documents and PDF output. No backend, schema, credit or deployment configuration changes are required.'
pl=' Testy: `frontend/src/components/editor/StartChooser/StartChooser.runtime.test.jsx` obejmuje kolejność klawiatury oraz uprawnienia Free/Pro/nieznane/cofnięte; `frontend/e2e/start-interview.spec.js` sprawdza docelowe adresy planów, trzy wybory, cztery szerokości, reduced motion i powiększenie tekstu 200% z atrapami API. Kontrastowy kafel wywiadu używa tokenów tuszu edytora i papieru; kontrolki pozostają poza dokumentami i PDF. Nie ma zmian backendu, schematu, rozliczeń ani konfiguracji wdrożenia.'
lines=s.splitlines()
for i,line in enumerate(lines):
    if line.startswith('**Empty-state onboarding (StartChooser).**'): lines[i]+=en
    elif line.startswith('**Onboarding pustego stanu zalogowanego (StartChooser).**'): lines[i]+=pl
s='\n'.join(lines)+'\n'
for filename in ['frontend/src/components/editor/StartChooser/StartChooser.jsx','frontend/src/components/editor/StartChooser/StartChooser.module.css']:
    length=len(Path(filename).read_text(encoding='utf-8').splitlines())
    s=re.sub(r'(`'+re.escape(filename)+r'`[^\n]*?(?:lines|linie) \d+[–-])\d+',lambda m:m[1]+str(length),s)
p.write_text(s,encoding='utf-8')
p=Path('DESIGN.md')
s=p.read_text(encoding='utf-8')
marker='A full-screen onboarding decision surface replaces the complete editor shell until the user chooses a path.'
s=s.replace(marker,'Authenticated onboarding presents three ordered choices: manual CV setup, PDF import and a highlighted interview card using inverse editor ink/paper tokens. The third card shows Pro availability to Free users and links to the account plan; only a resolved server AI entitlement links directly to the interview. Unknown access remains neutral and cannot grant AI access. Use three columns on wide screens, two with the interview spanning the row on tablets, and one column on compact screens. Preserve keyboard order, 44px action areas, reduced motion and 200% reflow. These independent creation choices are the intentional three-card exception to the narrative-page guidance.\n\n'+marker)
p.write_text(s,encoding='utf-8')
