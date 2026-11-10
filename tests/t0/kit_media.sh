#!/bin/sh
# Pixel-space zoom/crop bounds and index contracts are shared by inline and modal media controls.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cp tests/data/kit_media/body.tsx "$tmp/body.tsx"
for model in solid react; do
  cat > "$tmp/$model.ts" <<EOF
import { render } from 'zinc:ui/$model';
import { App } from './body';
render(App, 0xf2f2f2, null);
EOF
done
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 timeout 45 "$ZINC" run tests/data/kit_media/model.ts $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^media models: ok$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  echo "media models ($engine): ok"
  for model in solid react; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 ZINC_FRAMES=10 ZINC_SIZE=800x1300 timeout 60 "$ZINC" run "$tmp/$model.ts" $engine > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
    grep -q '^media UI: ok$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
    echo "media $model ($engine): ok"
  done
done
echo 'kit media: ok'
