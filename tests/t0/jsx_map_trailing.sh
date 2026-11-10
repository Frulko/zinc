#!/bin/sh
# Trailing separators do not turn mapped JSX rows into text or another helper argument.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for model in solid react; do
  mkdir "$tmp/$model"
  cp tests/data/jsx_map_trailing/body.tsx tests/data/jsx_map_trailing/rows.tsx "$tmp/$model/"
  cat >"$tmp/$model/main.ts" <<TS
import { render } from 'zinc:ui/$model';
import * as ui from 'zinc:ui';
import { App, verify } from './body';
ui.setAfterPaint(() => { verify(); ui.setAfterPaint(null); });
render(App, 0xffffff, null);
TS
  for engine in --interp --native '--engine quickjs'; do
    # shellcheck disable=SC2086
    ZINC_HEADLESS=1 ZINC_FRAMES=2 timeout 45 "$ZINC" run "$tmp/$model/main.ts" $engine >"$tmp/log" 2>&1 || { echo "$model $engine"; cat "$tmp/log"; exit 1; }
    grep -q '^jsx map trailing: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
    echo "$model $engine: pass"
  done
done
for engine in --interp --native '--engine quickjs'; do
  # shellcheck disable=SC2086
  ZINC_HEADLESS=1 ZINC_FRAMES=2 timeout 45 "$ZINC" run tests/data/jsx_map_trailing/custom.tsx $engine >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
  grep -q '^jsx custom trailing: pass$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  echo "custom $engine: pass"
done
for bad in extra invalid; do
  if LANG=en timeout 15 "$ZINC" check "tests/data/jsx_map_trailing/$bad.tsx" >"$tmp/log" 2>&1; then echo "$bad accepted"; exit 1; fi
  case $bad in extra) code=Z0104;; invalid) code=Z0001;; esac
  grep -q "$code" "$tmp/log" || { cat "$tmp/log"; exit 1; }
  echo "$bad $code: pass"
done
echo 'jsx trailing maps: pass'
