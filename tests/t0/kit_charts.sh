#!/bin/sh
# Geometry invariants and real chart controls; no gallery or pixel golden.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/kit_charts/model.ts $engine >"$tmp/model.log" 2>&1 || { cat "$tmp/model.log"; exit 1; }
  grep -q '^chart models: pass$' "$tmp/model.log" || { cat "$tmp/model.log"; exit 1; }
done
for model in solid react; do
  mkdir "$tmp/$model"; cp tests/data/kit_charts/body.tsx "$tmp/$model/"
  cat >"$tmp/$model/main.ts" <<TS
import { render } from 'zinc:ui/$model';
import { App, advance } from './body';
render(App, 0xffffff, advance);
TS
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 ZINC_SIZE=660x740 ZINC_FRAMES=8 timeout 45 "$ZINC" run "$tmp/$model/main.ts" $engine >"$tmp/ui.log" 2>&1 || { echo "$model $engine"; cat "$tmp/ui.log"; exit 1; }
    grep -q '^kit charts: pass$' "$tmp/ui.log" || { cat "$tmp/ui.log"; exit 1; }
  done
done
echo 'kit charts: models and both UI models pass'
