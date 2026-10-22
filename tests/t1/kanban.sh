#!/bin/sh
# Native Kanban: offline pointer/touch/keyboard session, feature goldens, engine smoke checks and idle paint.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
data=$(pwd)/tests/data/kanban
gold=$(pwd)/tests/golden/kanban
tmp=$(mktemp -d)
trap '[ -z "${KEEP:-}" ] || { mkdir -p "$KEEP"; cp "$tmp"/* "$KEEP/"; }; rm -rf "$tmp"' EXIT
export KANBAN_SNAPSHOT="$data/snapshot.json" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1560x940
timeout 45 "$Z" check examples/kanban > "$tmp/check.out" 2>&1
ZINC_FRAMES=240 ZINC_INPUT="$data/session.input" ZINC_FRAMEHASH=all ZINC_SHOT="$tmp/session.png" ZINC_SHOT_FRAMES=1,11,41,111,225 \
  timeout 45 "$Z" run examples/kanban > "$tmp/session.out" 2>&1 || { tail -12 "$tmp/session.out"; exit 1; }
awk '$1 == "zinc:" && $2 == "framehash" && ($3 == 1 || $3 == 11 || $3 == 41 || $3 == 111 || $3 == 126 || $3 == 184 || $3 == 225) {print $3, $5}' "$tmp/session.out" > "$tmp/hashes.txt"
[ "$(wc -l < "$tmp/hashes.txt" | tr -d ' ')" = 7 ] || { echo 'kanban: missing scripted frames'; exit 1; }
if [ -n "${UPDATE:-}" ]; then
  cp "$tmp/hashes.txt" "$gold/hashes.txt"
  for frame in 1 11 41 111 225; do cp "$tmp/session-$frame.png" "$gold/$frame.png"; done
fi
cmp "$tmp/hashes.txt" "$gold/hashes.txt" || { echo 'kanban: feature frames differ'; exit 1; }
for expected in 'kanban move ZN-713 -> Ready' 'kanban move ZN-650.07 -> Review' 'kanban move ZN-713 -> Ready before ZN-369' 'kanban move ZN-713 -> In Progress'; do
  grep -Fq "$expected" "$tmp/session.out" || { echo "kanban: missing $expected"; exit 1; }
done
[ "$(grep -c '^kanban move ZN-713 -> Ready$' "$tmp/session.out")" = 2 ] || { echo 'kanban: pointer and touch moves did not both finish'; exit 1; }
ZINC_FRAMES=20 timeout 20 "$Z" run tests/data/kanban/geometry.tsx > "$tmp/geometry.out" 2>&1 || { tail -10 "$tmp/geometry.out"; exit 1; }
ZINC_FRAMES=300 ZINC_PROFILE=1 timeout 45 "$Z" run examples/kanban > "$tmp/idle.out" 2>&1
grep -q 'zinc profile: paint p50=0.00 p99=0.00 ' "$tmp/idle.out" || { echo 'kanban: repainting while idle'; exit 1; }
expected=$(awk '$1 == 1 {print $2}' "$gold/hashes.txt")
for engine in native quickjs; do
  if [ "$engine" = native ]; then set -- --native; else set -- --engine quickjs; fi
  ZINC_FRAMES=3 ZINC_FRAMEHASH=last timeout 45 "$Z" run examples/kanban "$@" > "$tmp/$engine.out" 2>&1 || { tail -12 "$tmp/$engine.out"; exit 1; }
  actual=$(awk '$1 == "zinc:" && $2 == "framehash" {print $5}' "$tmp/$engine.out" | tail -1)
  [ "$actual" = "$expected" ] || { echo "kanban: $engine hash $actual, expected $expected"; exit 1; }
done
echo 'kanban: types, pointer/touch/keyboard, modal, filters, feature frames, three engines and idle ok'
