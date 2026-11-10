#!/bin/sh
# Pure assistant presentation rules and real controls, including IME, same-event sends and owned disclosure.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/kit_ai/model.ts $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^AI models: ok$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
done
for model in solid react; do
  mkdir "$tmp/$model"; cp tests/data/kit_ai/body.tsx "$tmp/$model/body.tsx"
  printf "import { render } from 'zinc:ui/%s';\nimport { App } from './body';\nrender(App, 0xffffff, null);\n" "$model" > "$tmp/$model/main.ts"
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 ZINC_FRAMES=39 ZINC_SIZE=900x2600 timeout 45 "$ZINC" run "$tmp/$model/main.ts" $engine > "$tmp/log" 2>&1 || { echo "$model $engine"; cat "$tmp/log"; exit 1; }
    grep -q '^AI UI: ok$' "$tmp/log" || { echo "$model $engine"; cat "$tmp/log"; exit 1; }
    echo "AI $model $engine: ok"
  done
done
