#!/bin/sh
# Neutral getters read same-event writes; raw React snapshots, scheduling and owner generations keep their contracts.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for model in solid react; do
  mkdir "$tmp/$model"; cp tests/data/component_signal/body.tsx "$tmp/$model/"
  cat >"$tmp/$model/main.ts" <<TS
import { render } from 'zinc:ui/$model';
import { App, advance } from './body';
render(App, 0xffffff, advance);
TS
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 ZINC_FRAMES=6 timeout 45 "$ZINC" run "$tmp/$model/main.ts" $engine >"$tmp/log" 2>&1 || { echo "$model $engine"; cat "$tmp/log"; exit 1; }
    grep -q '^component signal: pass$' "$tmp/log" || { echo "$model $engine"; cat "$tmp/log"; exit 1; }
  done
done
