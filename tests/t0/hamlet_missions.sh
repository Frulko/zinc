#!/bin/sh
# Hamlet missions: every mission file loads, the validator names its errors, the maps, locks and knobs reach the village, the first goals play through, the save carries the mission.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=1
for engine in "" "--interp" "--engine quickjs"; do
  case "$engine" in
    --interp) "$ZINC" run --interp tests/data/hamlet/missions.ts > "$tmp/out" 2> "$tmp/err" ;;
    "") "$ZINC" run tests/data/hamlet/missions.ts > "$tmp/out" 2> "$tmp/err" ;;
    *) "$ZINC" run tests/data/hamlet/missions.ts --engine quickjs > "$tmp/out" 2> "$tmp/err" ;;
  esac
  [ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
  grep -q 'hamlet missions: ALL PASS' "$tmp/out" || { grep FAIL "$tmp/out"; exit 1; }
done
echo 'hamlet_missions: PASS'
