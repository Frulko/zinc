#!/bin/sh
# Bounded pure contracts and actual keyboard/pointer callbacks, including unmount/restart.
set -eu
cd "$(dirname "$0")/../.."
root=$(pwd -P)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp tests/data/kit_extended/body.tsx "$tmp/body.tsx"
printf '{"entry":"solid.ts","permissions":["dialog","fs:read:%s"]}\n' "$root/tests/data" > "$tmp/zinc.json"
for model in solid react; do
 cat > "$tmp/$model.ts" <<EOF2
import { render } from 'zinc:ui/$model';
import { App } from './body';
render(App, 0xf2f2f2, null);
EOF2
done
for engine in --interp --native '--engine quickjs'; do
 # shellcheck disable=SC2086
 ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/kit_extended/model.ts $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
 grep -q '^extended models: ok$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
 echo "extended models ($engine): ok"
 # shellcheck disable=SC2086
 ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/kit_extended/system.ts $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
 grep -q '^extended System API: ok$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
 echo "extended System API ($engine): ok"
 for model in solid react; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 ZINC_FRAMES=8 ZINC_SIZE=800x1800 timeout 60 "$ZINC" run "$tmp/$model.ts" $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^extended UI: ok$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  echo "extended $model ($engine): ok"
 done
done
