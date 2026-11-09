#!/bin/sh
# Public collection results are snapshot arrays only in Zinc source, never a global native JS patch.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/collection_results/main.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^collection results: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
mkdir -p "$tmp/project/node_modules" "$tmp/workspace-native"
ln -s "$tmp/workspace-native" "$tmp/project/node_modules/native-collections"
printf '%s\n' '{"entry":"main.ts"}' > "$tmp/project/zinc.json"
printf '%s\n' '{"name":"native-collections","type":"module","exports":"./index.ts"}' > "$tmp/project/node_modules/native-collections/package.json"
cat > "$tmp/project/node_modules/native-collections/index.ts" <<'JS'
export function nativePackage() {
  const map = new Map([['one', 1]]), it = map.values(); map.set('two', 2);
  return !Array.isArray(map.values()) && it.next().value === 1 && it.next().value === 2;
}
JS
cat > "$tmp/project/raw.js" <<'JS'
export function rawNative() { const s = new Set(['one']); return !Array.isArray(s.values()) && !Array.isArray(s['values']()); }
export function getterMethod() {
  let receivers = 0, getters = 0;
  const o = {value: 7, get values() { getters++; return function() { return this.value; }; }};
  function receiver() { receivers++; return o; }
  return {receiver, counts: () => receivers === 1 && getters === 1};
}
// An earlier dependency can replace a method. The bridge must compare captured identities, not mutable prototypes.
const old = Map.prototype.values;
const overridden = ['override'];
Map.prototype.values = function() { return overridden; };
export function overrideResult() { return overridden; }
export function restore() { Map.prototype.values = old; }
JS
cat > "$tmp/project/main.ts" <<'TS'
import { nativePackage } from 'native-collections';
import { rawNative, getterMethod, restore, overrideResult } from './raw.js';
import { equal, ok } from 'zinc:assert';
const m = new Map<string, number>([['one', 1]]);
ok(m.values() === overrideResult()); restore();
equal(m.values().length, 1); ok(nativePackage()); ok(rawNative());
const custom = getterMethod(); equal(custom.receiver().values(), 7); ok(custom.counts());
equal(m.values?.().length, 1);
const absent = null;
equal(absent?.map.values().length, undefined);
let keyCalls = 0;
function key() { keyCalls++; return 'map'; }
equal(absent?.[key()].values().length, undefined); equal(keyCalls, 0);
let failed = false;
try { ({map: null})?.map.values(); } catch (error) { failed = true; }
ok(failed);
failed = false;
try { (absent?.values()).length; } catch (error) { failed = true; }
ok(failed);
console.log('native boundary: pass');
TS
ZINC_HEADLESS=1 timeout 45 "$ZINC" run "$tmp/project" --engine quickjs >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
grep -q '^native boundary: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/collection_results/embedded.ts --engine quickjs >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
grep -q '^embedded collections: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }

ZINC_HEADLESS=1 timeout 30 "$ZINC" run tests/data/collection_results/suspend.ts --engine quickjs >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
grep -q '^suspending collection chain: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
# The linked form uses the same private adapter and preserves native package semantics.
if ZINC_OFFLINE=1 timeout 15 "$ZINC" toolchain esbuild >/dev/null 2>&1; then
  timeout 45 "$ZINC" bundle "$tmp/project/main.ts" -o "$tmp/linked.js" --minify >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  ZINC_HEADLESS=1 timeout 30 "$ZINC" run "$tmp/linked.js" --engine quickjs >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^native boundary: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
fi

# These spellings are outside the existing typed checker boundary, rather than new extraction/binding APIs.
for fixture in bracket extracted; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/collection_results/$fixture.ts" >"$tmp/log" 2>&1; then
    echo "unsupported collection spelling accepted: $fixture"; exit 1
  fi
  grep -Eq 'Z0113|Z0005' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done

cat > "$tmp/raw-entry.js" <<'JS'
#!/usr/bin/env zinc
const m = new Map([['one', 1]]), values = m.values();
m.set('two', 2);
if (Array.isArray(values) || values.next().value !== 1 || values.next().value !== 2) throw new Error('native entry changed');
console.log('raw entry: pass');
JS
ZINC_HEADLESS=1 timeout 30 "$ZINC" run "$tmp/raw-entry.js" --engine quickjs >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
grep -q '^raw entry: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
