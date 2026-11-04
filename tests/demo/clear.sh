#!/bin/sh
# App rules, actual pointer/touch/keyboard routes and restart persistence.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
trap '[ -z "${KEEP:-}" ] || { mkdir -p "$KEEP"; cp "$tmp"/* "$KEEP/"; }; rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=420x760 ZINC_STORAGE="$tmp/state.kv"
ZINC_FRAMES=148 ZINC_SHOT="$tmp/session.png" ZINC_SHOT_FRAMES=1,18,33,44,60,82,104 \
  "$Z" run tests/data/clear >"$tmp/session.log" 2>&1 || { tail -15 "$tmp/session.log"; exit 1; }
grep -q 'clear session: pass' "$tmp/session.log"
"$Z" run tests/data/clear/restart.ts >"$tmp/restart.log" 2>&1 || { cat "$tmp/restart.log"; exit 1; }
grep -q 'clear restart: pass' "$tmp/restart.log"
echo 'clear: typing, edit, swipe, reorder, themes, pinch, pull, undo and restart passed'
