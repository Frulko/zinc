#!/bin/sh
# Offline native scene: input, one golden per look, engine parity and idle.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=900x720
gold=tests/golden/glass-icon-reveal
"$ZINC" check examples/glass-icon-reveal > "$tmp/check.log" 2>&1 || { cat "$tmp/check.log"; exit 1; }
"$ZINC" run tests/data/glass-icon-reveal/logic.ts > "$tmp/logic.log" 2>&1 || { cat "$tmp/logic.log"; exit 1; }
ZINC_INPUT=tests/data/glass-icon-reveal/session.input ZINC_FRAMES=114 \
  timeout 20 "$ZINC" run tests/data/glass-icon-reveal/interaction.ts > "$tmp/input.log" 2>&1 || { cat "$tmp/input.log"; exit 1; }
ZINC_INPUT=tests/data/glass-icon-reveal/session.input ZINC_FRAMES=360 ZINC_FRAMEHASH=all \
  ZINC_SHOT="$tmp/scene.png" ZINC_SHOT_FRAMES=41,46 \
  timeout 30 "$ZINC" run examples/glass-icon-reveal > "$tmp/session.log" 2>&1 || { tail -15 "$tmp/session.log"; exit 1; }
awk '$1 == "zinc:" && $2 == "framehash" && ($3 == 1 || $3 == 41 || $3 == 46 || $3 == 55 || $3 == 64 || $3 == 102 || $3 == 113 || $3 == 141 || $3 == 146 || $3 == 151 || $3 == 360) {print $3, $5}' "$tmp/session.log" > "$tmp/hashes.txt"
test "$(wc -l < "$tmp/hashes.txt" | tr -d ' ')" = 11
if [ -n "${UPDATE:-}" ]; then
  cp "$tmp/hashes.txt" "$gold/hashes.txt"
  cp "$tmp/scene-41.png" "$gold/light.png"
  cp "$tmp/scene-46.png" "$gold/dark.png"
fi
cmp "$tmp/hashes.txt" "$gold/hashes.txt"
# Stop at the end, then retain the scene for another 300 frames.
ZINC_FRAMES=480 ZINC_FRAMEHASH=all ZINC_PROFILE=1 timeout 30 "$ZINC" run examples/glass-icon-reveal > "$tmp/idle.log" 2>&1
awk '$1 == "zinc:" && $2 == "framehash" && $3 >= 181 {print $5}' "$tmp/idle.log" | sort -u > "$tmp/idle-hashes"
test "$(wc -l < "$tmp/idle-hashes" | tr -d ' ')" = 1
grep -q 'zinc profile: paint p50=0.00 ' "$tmp/idle.log"
expected=$(awk '$1 == 1 {print $2}' "$gold/hashes.txt")
for engine in native quickjs; do
  if [ "$engine" = native ]; then set -- --native; else set -- --engine quickjs; fi
  ZINC_FRAMES=1 ZINC_FRAMEHASH=last timeout 45 "$ZINC" run examples/glass-icon-reveal "$@" > "$tmp/$engine.log" 2>&1 || { tail -15 "$tmp/$engine.log"; exit 1; }
  actual=$(awk '$1 == "zinc:" && $2 == "framehash" {print $5}' "$tmp/$engine.log")
  test "$actual" = "$expected"
done
for size in 360x640 800x480 640x360; do
  ZINC_SIZE=$size ZINC_FRAMES=2 timeout 15 "$ZINC" run examples/glass-icon-reveal > "$tmp/$size.log" 2>&1
done
echo 'glass_icon_reveal: checker, timeline, input goldens, three engines and 300 idle frames ok (software preview; GPU checked separately)'
