#!/bin/sh
# The original AS3 rules, page lifecycle, saved scores and byte-for-byte asset/comment fidelity.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1 ZINC_STORAGE="$tmp/storage" ZINC_ASSETS="$PWD/examples/fatty/assets"
node node_modules/typescript/bin/tsc -p examples/fatty > "$tmp/types.out" 2>&1 || { cat "$tmp/types.out"; exit 1; }
python3 - <<'PY'
from pathlib import Path
import hashlib, json, re, subprocess
app = Path('examples/fatty')
reference = Path('tests/data/fatty/as3')
# Lex comments and strings together so a URL's // is not confused with an authored comment.
tokens = re.compile(r'/\*[\s\S]*?\*/|//[^\n]*|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'')
def comments(text):
    return [m[0] for m in tokens.finditer(text) if m[0].startswith(('//','/*'))]
for original in reference.rglob('*.as'):
    port = app/'src'/original.relative_to(reference).with_suffix('.ts')
    assert port.is_file(), port
    authored = comments(original.read_text())
    actual = iter(comments(port.read_text()))
    for comment in authored:
        assert any(c == comment for c in actual), (port, comment)
manifest = json.loads((app/'source-manifest.json').read_text())['sha256']
for path, digest in manifest.items():
    if path.startswith('assets/'):
        copy = app/path
    elif path.startswith('src/'):
        copy = reference/path[4:]
    else:
        copy = app/'assets/media/audio/musique_de_fond.mp3'
    assert hashlib.sha256(copy.read_bytes()).hexdigest() == digest, copy
before = (app/'assets/atlas-data.json').read_bytes()
subprocess.run(['python3', str(app/'tools/prepare-assets.py')], check=True)
assert (app/'assets/atlas-data.json').read_bytes() == before, 'atlas metadata is not reproducible'
print('fatty fidelity: original sources, comments, graphics, music and atlas metrics ok')
PY
timeout 15 "$Z" run tests/data/fatty/logic.ts --engine quickjs > "$tmp/logic.out" 2>&1 || { tail -15 "$tmp/logic.out"; exit 1; }
grep '^fatty logic:' "$tmp/logic.out"
timeout 15 "$Z" run tests/data/fatty/persist.ts --engine quickjs > "$tmp/persist.out" 2>&1 || { tail -10 "$tmp/persist.out"; exit 1; }
grep '^fatty persistence:' "$tmp/persist.out"
