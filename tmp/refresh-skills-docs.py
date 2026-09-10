from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
readme = root / 'README.md'
text = readme.read_text(encoding='utf-8')
paths = [
    'frontend/src/utils/skillsEntry.js',
    'frontend/src/utils/skillsEntry.test.js',
    'frontend/src/components/canvas/SkillsEntryActions/SkillsEntryActions.jsx',
    'frontend/src/components/canvas/CanvasElements/CanvasElements.jsx',
    'frontend/src/hooks/useA4Elements.js',
    'frontend/src/pages/PdfCanvas.jsx',
]
lines = text.splitlines(keepends=True)
new_section = False
for i, line in enumerate(lines):
    if line.startswith('### '):
        new_section = line.startswith(('### Delete individual skills', '### Usuwanie pojedynczych'))
    if new_section:
        lines[i] = line.replace('lines 30–79', 'lines 30–73').replace('linie 30–79', 'linie 30–73')
        continue
    for file in paths:
        count = len((root / file).read_text(encoding='utf-8').splitlines())
        names = [file]
        if file.endswith('CanvasElements.jsx'):
            names.append('CanvasElements.jsx')
        for name in names:
            # Legacy feature references span multiple symbols in these modules.
            # Use the verified full module range while retaining named symbols.
            pattern = r'(`' + re.escape(name) + r'`, (?:lines|linie) )\d+[–-]\d+(?:(?:, |, and |, oraz | and | i )\d+[–-]\d+)*'
            line = re.sub(pattern, lambda m: m[1] + f'1–{count}', line)
    lines[i] = line
readme.write_text(''.join(lines), encoding='utf-8')
