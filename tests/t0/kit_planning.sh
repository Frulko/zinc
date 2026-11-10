#!/bin/sh
# Planning geometry and owned real controls through the public kit barrel.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/kit_planning/model.ts $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^planning models: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
for model in solid react; do
  mkdir "$tmp/$model"; cp tests/data/kit_planning/body.tsx "$tmp/$model/"
  cat >"$tmp/$model/main.ts" <<TS
import { render } from 'zinc:ui/$model';
import { App, advance } from './body';
render(App, 0xffffff, advance);
TS
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 ZINC_SIZE=1100x1500 ZINC_FRAMES=12 timeout 45 "$ZINC" run "$tmp/$model/main.ts" $engine >"$tmp/log" 2>&1 || { echo "$model $engine"; cat "$tmp/log"; exit 1; }
    grep -q '^kit planning: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
echo 'kit planning: models and both UI models pass'
