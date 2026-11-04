#!/bin/sh
# A native Clear scene: real assets and UI, matching engines, quiet idle.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
trap '[ -z "${KEEP:-}" ] || { mkdir -p "$KEEP"; cp "$tmp"/* "$KEEP/"; }; rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=420x760
"$Z" check examples/clear >"$tmp/check.log" 2>&1 || { cat "$tmp/check.log"; exit 1; }
for engine in interp native quickjs; do
  if [ "$engine" = quickjs ]; then set -- --engine quickjs; else set -- "--$engine"; fi
  ZINC_STORAGE="$tmp/$engine.kv" ZINC_FRAMES=3 ZINC_FRAMEHASH=last ZINC_SHOT="$tmp/$engine.png" \
    "$Z" run examples/clear "$@" >"$tmp/$engine.log" 2>&1 || { cat "$tmp/$engine.log"; exit 1; }
  hash=$(awk '$1 == "zinc:" && $2 == "framehash" {print $5}' "$tmp/$engine.log" | tail -1)
  [ -n "$hash" ] || { cat "$tmp/$engine.log"; exit 1; }
  if [ "$engine" = interp ] && [ -n "${UPDATE:-}" ]; then
    printf '%s\n' "$hash" > tests/golden/clear/initial.hash
    cp "$tmp/interp.png" tests/golden/clear/initial.png
  fi
  [ "$hash" = "$(cat tests/golden/clear/initial.hash)" ] || { echo "clear: $engine pixels differ"; exit 1; }
done
ZINC_STORAGE="$tmp/idle.kv" ZINC_FRAMES=300 ZINC_PROFILE=1 "$Z" run examples/clear >"$tmp/idle.log" 2>&1
# An invisible text-capture Input must not repaint to blink its caret.
grep -q 'zinc profile: paint p50=0.00 p99=0.00 ' "$tmp/idle.log" || { cat "$tmp/idle.log"; exit 1; }
echo 'clear: types, reference frame, three engines and idle passed'
