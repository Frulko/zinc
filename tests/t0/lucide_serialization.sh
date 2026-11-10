#!/bin/sh
# Compare generated documents and metadata with the pinned node catalog, including mixed shapes and aliases.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp" <<'PYTEST'
import json,pathlib,sys
out=pathlib.Path(sys.argv[1])
nodes=json.loads(pathlib.Path('third_party/lucide/icon-nodes.json').read_text())
aliases=json.loads(pathlib.Path('third_party/lucide/aliases.json').read_text())
names='bold chart-scatter circle-alert circle-check circle cross crosshair ellipse focus forward ghost grip group hand-grab image import info italic keyboard layers link mouse move phone pointer radio radius repeat rose rows-2 scale scroll search shrink square text-align-start text-wrap triangle-alert type underline video view x'.split()
names += ['grab','rows','text','text-','not-a-lucide-icon']
header='<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
rows=[]; selected=set()
for name in names:
    canonical=name if name in nodes else aliases.get(name.replace('-',''))
    if canonical not in nodes:
        rows.append([name,'']); continue
    selected.add(canonical)
    body=''
    for tag,attrs in nodes[canonical]:
        body += '<'+tag
        for key,value in attrs.items():
            if key=='key': continue
            text=value if isinstance(value,str) else format(float(value),'.6f')
            body += ' '+key+'="'+text+'"'
        body += '/>'
    rows.append([name,header+body+'</svg>'])
rows.append(['',''])
manifest={'name':'lucide-serialization','entry':'main.ts','icons':names}
(out/'zinc.json').write_text(json.dumps(manifest))
source="import { equal } from 'zinc:assert';\nimport { lucide, COUNT, NAMES, UNKNOWN } from 'zinc:icons/lucide';\n"
source += 'const cases: string[][] = '+json.dumps(rows)+';\n'
source += 'for (const row of cases) equal(lucide(row[0]),row[1],row[0]);\n'
source += 'equal(COUNT,'+str(len(selected))+');\n'
source += 'equal(NAMES.join(\',\'),'+json.dumps(','.join(key for key in nodes if key in selected))+');\n'
source += "equal(UNKNOWN.join(','),'not-a-lucide-icon');\nconsole.log('lucide serialization: pass');\n"
(out/'main.ts').write_text(source)
PYTEST
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_OFFLINE=1 ZINC_HEADLESS=1 timeout 45 "$ZINC" run "$tmp" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^lucide serialization: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
