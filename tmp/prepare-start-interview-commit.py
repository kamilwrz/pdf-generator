from pathlib import Path
from unittest.mock import patch
import difflib
import subprocess

paths = ('README.md', 'DESIGN.md', 'frontend/src/pages/PdfCanvas.jsx')
base = {name: subprocess.check_output(['git', 'show', 'HEAD:' + name]).decode('utf-8') for name in paths}
virtual = {name: base[name] for name in ('README.md', 'DESIGN.md')}
original_read = Path.read_text

def read_virtual(path, *args, **kwargs):
    return virtual[str(path)] if str(path) in virtual else original_read(path, *args, **kwargs)

def write_virtual(path, text, *args, **kwargs):
    assert str(path) in virtual, str(path)
    virtual[str(path)] = text
    return len(text)

script = Path('tmp/document-start-interview.py').read_text(encoding='utf-8-sig')
with patch.object(Path, 'read_text', read_virtual), patch.object(Path, 'write_text', write_virtual):
    exec(compile(script, 'document-start-interview.py', 'exec'), {})
needle = '                <StartChooser\n'
assert base[paths[2]].count(needle) == 1
virtual[paths[2]] = base[paths[2]].replace(needle, needle + '                  entitlements={entitlements}\n')
patch_text = ''.join(''.join(difflib.unified_diff(base[name].splitlines(keepends=True), virtual[name].splitlines(keepends=True), fromfile='a/' + name, tofile='b/' + name)) for name in paths)
Path('tmp/start-interview-commit.patch').write_text(patch_text, encoding='utf-8')
for name in paths:
    print(name, 'changed lines:', sum(1 for line in difflib.ndiff(base[name].splitlines(),virtual[name].splitlines()) if line[:2] in ('+ ','- ')))
