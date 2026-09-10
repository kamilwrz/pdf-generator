from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
path = root / 'README.md'
text = path.read_text(encoding='utf-8')
text = text.replace('Hover a skill to reveal its trash icon beside the add control.',
    'Hover a skill to reveal a 24px trash button directly over the right end of that skill’s text line or chip. For a wrapped skill, the button stays on the line fragment first entered by the pointer, including while moving onto the button. It follows scrolling and zoom without an entry animation. The add control remains centred under the group.')
text = text.replace('Najedź na umiejętność, aby obok kontrolki dodawania pojawił się kosz.',
    'Najedź na umiejętność, aby kosz 24px pojawił się bezpośrednio na prawym końcu jej wiersza tekstu lub chipsa. Przy zawiniętej umiejętności przycisk pozostaje na fragmencie wiersza wskazanym przy wejściu kursora, również podczas przechodzenia na kosz. Podąża za przewijaniem i powiększeniem bez animacji wejścia. Kontrolka dodawania pozostaje wyśrodkowana pod grupą.')
for filename in ['frontend/src/utils/skillsItemTarget.js',
    'frontend/src/components/canvas/SkillsEntryActions/SkillsEntryActions.jsx',
    'frontend/e2e/skills-delete.spec.js']:
    count = len((root / filename).read_text(encoding='utf-8').splitlines())
    text = re.sub(r'(`' + re.escape(filename) + r'`, (?:lines|linie) )1–\d+',
        lambda m: m[1] + f'1–{count}', text)
control = 'frontend/src/components/canvas/SkillsEntryActions/SkillDeleteControl.jsx'
control_count = len((root / control).read_text(encoding='utf-8').splitlines())
paragraph_en = (f'Placement: `{control}`, lines 1–{control_count}, component `SkillDeleteControl`, lives beside `SkillsEntryActions` and renders the trash in a separate body portal sharing the group hover lifecycle. `mergeSkillRects` combines styled spans per visual line; `skillDeletePosition` places the fixed-size button on the chosen fragment and suppresses fully offscreen targets. The separate plus/trash portals retain logical Tab/Shift+Tab order. The shared danger button uses a short edge-aligned tooltip while its accessible label includes the complete skill name. `frontend/src/utils/skillsItemTarget.test.js`, lines 1–37, covers wrapping, zoom, scrolling and viewport edges; the browser suite also checks that the button stays still along an actual pointer path.\n\n')
paragraph_pl = (f'Położenie: `{control}`, linie 1–{control_count}, komponent `SkillDeleteControl`, znajduje się obok `SkillsEntryActions` i renderuje kosz w osobnym portalu do body, współdzieląc z grupą cykl hover. `mergeSkillRects` łączy formatowane fragmenty w obrębie wiersza; `skillDeletePosition` umieszcza przycisk o stałym rozmiarze na wskazanym fragmencie i ukrywa cele całkowicie poza ekranem. Osobne portale plusa/kosza zachowują logiczną kolejność Tab/Shift+Tab. Wspólny przycisk niebezpiecznej akcji ma krótki tooltip wyrównany do krawędzi, a jego dostępna etykieta zawiera pełną nazwę umiejętności. `frontend/src/utils/skillsItemTarget.test.js`, linie 1–37, sprawdza zawijanie, powiększenie, przewijanie i krawędzie ekranu; testy przeglądarkowe sprawdzają też stabilność przycisku podczas rzeczywistego ruchu kursora.\n\n')
text = text.replace('References: [MDN Range.getClientRects]', paragraph_en + 'References: [MDN Range.getClientRects]')
text = text.replace('Źródła: [MDN Range.getClientRects]', paragraph_pl + 'Źródła: [MDN Range.getClientRects]')
path.write_text(text, encoding='utf-8')
