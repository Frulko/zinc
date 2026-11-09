#!/bin/sh
# Show retains all children and numeric-array text across updates; Solid also disposes row owners.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for model in solid react; do
  mkdir "$tmp/$model"
  cp tests/data/jsx_show/main.tsx "$tmp/$model/body.tsx"
  cat > "$tmp/$model/main.tsx" <<P
import { render } from 'zinc:ui/$model';
import { App, advance } from './body';
render(App, 0xffffff, advance);
P
  cp "tests/data/jsx_show/$model.ts" "$tmp/$model/model.ts"
  for engine in --interp '--engine quickjs'; do
    # shellcheck disable=SC2086
    if ! ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 45 "$ZINC" run $engine "$tmp/$model/main.tsx" >"$tmp/log" 2>&1 || ! grep -q '^show children: ok$' "$tmp/log"; then
      echo "$model $engine: failed"; cat "$tmp/log"; fail=1
    fi
  done
  if ! timeout 45 "$ZINC" build --native "$tmp/$model/main.tsx" -o "$tmp/$model/app" >"$tmp/log" 2>&1; then
    echo "$model native build: failed"; cat "$tmp/log"; fail=1
  elif ! ZINC_HEADLESS=1 ZINC_FRAMES=8 timeout 10 "$tmp/$model/app" >"$tmp/log" 2>&1 || ! grep -q '^show children: ok$' "$tmp/log"; then
    echo "$model native run: failed"; cat "$tmp/log"; fail=1
  fi
done
exit "$fail"
