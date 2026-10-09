#!/bin/sh
# SBOM and licences of exported apps (ZN-323): `zinc export` writes sbom.spdx.json (validated against the SPDX 2.3 schema, tests/data) and
# THIRD-PARTY-LICENSES.txt from what the program links (third_party/components.json): an app without the sqlite plugin has no SQLite entry,
# one with it has it; every listed component has its full licence text; with SOURCE_DATE_EPOCH two exports give the same SBOM.
cd "$(dirname "$0")/../.." || exit 2
python3 -c 'import jsonschema' 2>/dev/null || { echo "sbom: python jsonschema is not installed"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export SOURCE_DATE_EPOCH=1700000000
"$Z" new cli "$tmp/plain" >/dev/null && "$Z" new cli "$tmp/db" >/dev/null || exit 2
printf "import { Database } from 'zinc:sqlite';\nconst db = new Database();\ndb.exec('CREATE TABLE t (x INTEGER)');\nconsole.log('ok');\n" > "$tmp/db/src/main.ts"
for p in plain db; do (cd "$tmp/$p" && "$Z" export . >/dev/null 2>"$tmp/err.$p") || { echo "export $p failed: $(tail -3 "$tmp/err.$p")"; exit 1; }; done
cp "$tmp/plain/dist/plain-"*/sbom.spdx.json "$tmp/first.json"
(cd "$tmp/plain" && "$Z" export . >/dev/null 2>&1)
cmp -s "$tmp/first.json" "$tmp/plain/dist/plain-"*/sbom.spdx.json || { echo "two SBOMs of the same app differ with SOURCE_DATE_EPOCH"; exit 1; }
python3 - "$tmp" tests/data/spdx-2.3.schema.json third_party/components.json <<'PY'
import glob, json, sys, jsonschema
tmp, schema, comps = sys.argv[1], json.load(open(sys.argv[2])), json.load(open(sys.argv[3]))['components']
fail = False
for p in ('plain', 'db'):
    d = glob.glob(f'{tmp}/{p}/dist/{p}-*')[0]
    sbom = json.load(open(f'{d}/sbom.spdx.json'))
    try: jsonschema.validate(sbom, schema)
    except jsonschema.ValidationError as e: print(f'{p}: the SBOM does not validate: {e.message}'); fail = True
    names = {x['name'] for x in sbom['packages']}
    if ('SQLite' in names) != (p == 'db'): print(f'{p}: SQLite listed {"SQLite" in names}'); fail = True
    lic = open(f'{d}/THIRD-PARTY-LICENSES.txt').read()
    for c in comps:
        if c['name'] not in names: continue
        if f"==== {c['name']}" not in lic: print(f'{p}: no licence section for {c["name"]}'); fail = True
        if 'licenseFile' in c:
            text = open('../' + c['licenseFile'], encoding='utf-8', errors='replace').read().strip()
            if text not in lic: print(f'{p}: the licence of {c["name"]} is not there in full'); fail = True
sys.exit(1 if fail else 0)
PY
[ $? -eq 0 ] && echo "sbom: ok"
