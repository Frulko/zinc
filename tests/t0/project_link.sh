#!/bin/sh
# The map carried by /play/ survives native -> browser -> native, including Unicode and rejected paths.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:?set ZINC}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 "$Z" run tests/data/project_link/main.ts --interp > "$tmp/native" || exit 1
for engine in aot quickjs; do
  if [ "$engine" = quickjs ]; then set -- --engine quickjs; else set -- --native; fi
  ZINC_HEADLESS=1 "$Z" run tests/data/project_link/main.ts "$@" > "$tmp/$engine" || exit 1
  cmp -s "$tmp/native" "$tmp/$engine" || exit 1
done
node --input-type=module - "$tmp/native" "$tmp/browser" <<'JS' || exit 1
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { stripTypeScriptTypes } from 'node:module';
const source = fs.readFileSync('lib/std/project-link.ts', 'utf8');
const api = await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
const link = fs.readFileSync(process.argv[2], 'utf8').trim();
const files = api.projectLinkFiles(link);
assert.equal(files['src/math.ts'], 'export const n = 42;\n');
assert.ok(files['src/main.ts'].includes('🌍'));
assert.equal(api.projectLink(files), link);
for (const bad of [null, [], {}, {'../escape.ts':'x'}, {'a.ts': 3}, JSON.parse('{"__proto__":"x","a.ts":"x"}')]) assert.throws(() => api.projectFiles(bad));
assert.throws(() => api.projectLink({'main.ts':'x'.repeat(9000)}));
fs.writeFileSync(process.argv[3], api.projectLink(files));
JS
cmp -s "$tmp/native" "$tmp/browser" || [ "$(cat "$tmp/native")" = "$(cat "$tmp/browser")" ] || exit 1
ZINC_HEADLESS=1 "$Z" run tests/data/project_link/main.ts --interp -- "$tmp/browser" > "$tmp/roundtrip" || exit 1
rg -q '^browser-to-native: ok$' "$tmp/roundtrip" || exit 1
printf 'project_link: ok\n'
