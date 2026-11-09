#!/bin/sh
# Reached helper/default strings infer pinned icons without rooting the provider catalog or an unused family.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/library" "$tmp/helper"
cp tests/data/library_icons/library/defaults.tsx tests/data/library_icons/library/worker-defaults.ts tests/data/library_icons/library/stage-defaults.ts "$tmp/library/"
cat >"$tmp/helper/scene.tsx" <<'TS'
import { render } from 'zinc:ui/solid';
import { ReachedDefault } from '../library/defaults';
const App = (): i32 => <View><ReachedDefault /></View>;
render(App, 0xffffff, null);
TS
for fixture in defaults selection dynamic unknown alias; do
  mkdir "$tmp/$fixture"
  cp "tests/data/library_icons/$fixture/scene.tsx" "$tmp/$fixture/"
done
for fixture in helper defaults selection dynamic unknown alias; do
  printf '{"name":"library-icons-%s","entry":"main.ts"%s}\n' "$fixture" "$( [ "$fixture" != dynamic ] || printf ',"icons":["heart"]' )" >"$tmp/$fixture/zinc.json"
  cat >"$tmp/$fixture/main.ts" <<'TS'
import './scene';
import { iconNames, icon } from 'zinc:icons';
for (const name of iconNames()) { const svg = icon(name); if (svg === null || !svg.ok || svg.items() === 0) throw new Error('selected SVG icon did not parse'); }
console.log('library-icons:' + iconNames().join(','));
TS
done
for fixture in helper defaults selection dynamic; do
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_OFFLINE=1 ZINC_HEADLESS=1 ZINC_FRAMES=3 timeout 60 "$ZINC" run "$tmp/$fixture/main.ts" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
    if grep -q U0001 "$tmp/log"; then cat "$tmp/log"; exit 1; fi
    names=$(sed -n 's/^library-icons://p' "$tmp/log")
    case "$fixture" in
      helper) printf '%s' "$names" | grep -qw alarm-clock;;
      defaults|dynamic) printf '%s' "$names" | grep -q info; printf '%s' "$names" | grep -q loader-circle;;
      selection) for name in check minus eye; do printf '%s' "$names" | grep -qw "$name"; done;;
    esac
    if [ "$fixture" = dynamic ]; then printf '%s' "$names" | grep -qw heart; fi
    if printf '%s' "$names" | grep -qw apple; then echo 'unused library icon retained'; exit 1; fi
  done
done
# Only the worker imports the provider; the parent must not need eager icon discovery.
mkdir "$tmp/worker"
cp tests/data/library_icons/worker/*.ts "$tmp/worker/"
printf '{"name":"worker-library-icons","entry":"main.ts"}\n' >"$tmp/worker/zinc.json"
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_OFFLINE=1 ZINC_HEADLESS=1 timeout 45 "$ZINC" run "$tmp/worker/main.ts" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^worker-icons:.*rocket' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  if sed -n 's/^worker-icons://p' "$tmp/log" | grep -qw apple; then echo 'unused worker icon retained'; exit 1; fi
done
# A main loader screen is not part of a worker's graph, even when that screen is valid JS outside Zinc's typed subset.
printf '{"name":"worker-library-icons","entry":"main.ts","loading":{"screen":"screen.ts","minMs":0,"fadeMs":0}}\n' >"$tmp/worker/zinc.json"
for stage in typed javascript; do
  if [ "$stage" = javascript ]; then
    printf 'const value = new Proxy({ n: 1 }, {});\n' >"$tmp/worker/screen.ts"
    cat tests/data/library_icons/worker/screen.ts >>"$tmp/worker/screen.ts"
  fi
  if ! ZINC_OFFLINE=1 ZINC_HEADLESS=1 timeout 45 "$ZINC" run "$tmp/worker/main.ts" --engine quickjs >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^worker-icons:.*rocket' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  if sed -n 's/^worker-icons://p' "$tmp/log" | grep -qw sailboat; then echo 'main loader icon leaked into worker'; exit 1; fi
done
# Explicit dynamic JSX aliases keep the existing rename warning; inferred matching ordinary strings do not create one.
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_OFFLINE=1 ZINC_HEADLESS=1 ZINC_FRAMES=2 timeout 30 "$ZINC" run "$tmp/alias/main.ts" $engine >"$tmp/log" 2>&1
  grep -q "U0001.*trash-2.*old Lucide name.*trash" "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
ZINC_OFFLINE=1 ZINC_HEADLESS=1 ZINC_FRAMES=2 timeout 30 "$ZINC" run "$tmp/unknown/main.ts" --interp >"$tmp/log" 2>&1
grep -q 'U0001.*not-a-lucide-icon' "$tmp/log"
# The unbundled browser stage uses the same discovery, without requiring an esbuild binary.
ZINC_OFFLINE=1 timeout 30 "$ZINC" bundle "$tmp/helper/main.ts" --stage "$tmp/stage" >"$tmp/log" 2>&1
python3 - "$tmp/stage" <<'PY'
import json,pathlib,sys
root=pathlib.Path(sys.argv[1]); index=json.loads((root/'stage.json').read_text())
provider=next(m['file'] for m in index['modules'] if m['name']=='zinc:icons/lucide')
source=(root/provider).read_text()
assert 'alarm-clock' in source and 'apple' not in source, source
PY
# The linked/minified path retains the same single icon when the already-cached tool is available.
if ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1; then
  ZINC_OFFLINE=1 timeout 45 "$ZINC" bundle "$tmp/helper/main.ts" -o "$tmp/helper.js" --minify >"$tmp/log" 2>&1
  ZINC_OFFLINE=1 ZINC_HEADLESS=1 ZINC_FRAMES=3 timeout 30 "$ZINC" run "$tmp/helper.js" --engine quickjs >"$tmp/log" 2>&1
  grep -q '^library-icons:.*alarm-clock' "$tmp/log"
fi
# Failed optional typed discovery never rejects unrelated dynamic JavaScript.
ZINC_OFFLINE=1 ZINC_HEADLESS=1 timeout 15 "$ZINC" run tests/data/library_icons/plainjs/main.js --engine quickjs >"$tmp/log" 2>&1
grep -q '^plain JS: pass$' "$tmp/log"
# Explicitly documented fallback limit: unsupported arbitrary JS + kit defaults still needs caller declarations.
mkdir "$tmp/plainjs"
cp tests/data/library_icons/plainjs/defaults.js "$tmp/plainjs/main.js"
ZINC_OFFLINE=1 ZINC_HEADLESS=1 ZINC_FRAMES=3 timeout 30 "$ZINC" run "$tmp/plainjs/main.js" --engine quickjs >"$tmp/log" 2>&1
grep -q '^plain JS defaults fallback: pass$' "$tmp/log"
grep -q 'U0001' "$tmp/log"
printf 'library icons: pass\n'
