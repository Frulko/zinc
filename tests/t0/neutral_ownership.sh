#!/bin/sh
# Ordinary neutral child JSX owns hooks; conditional siblings, keyed rows and focused virtual fields retain the correct identity.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for model in solid react; do
  mkdir "$tmp/$model"
  cp tests/data/neutral_ownership/*.ts tests/data/neutral_ownership/*.tsx "$tmp/$model/"
  mv "$tmp/$model/main.tsx" "$tmp/$model/body.tsx"
  cat >"$tmp/$model/main.ts" <<TS
import { render } from 'zinc:ui/$model';
import { App, advance } from './body';
render(App, 0xffffff, advance);
TS
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_FRAMES=10 timeout 60 "$ZINC" run "$tmp/$model/main.ts" $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
    grep -q '^neutral ownership: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done

for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  if ! ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 60 "$ZINC" run tests/data/neutral_ownership/lifecycle.tsx $engine >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
  grep -q '^neutral lifecycle: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
if ! timeout 20 "$ZINC" check tests/data/neutral_ownership/custom.tsx >"$tmp/log" 2>&1; then cat "$tmp/log"; exit 1; fi
