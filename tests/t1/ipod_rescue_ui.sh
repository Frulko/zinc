#!/bin/sh
# Native UI + real JSONL child process, entirely simulated. Wait before the headless frame budget starts.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
trap '[ -z "${KEEP:-}" ] || { mkdir -p "$KEEP"; cp "$tmp"/*.png "$tmp"/*.out "$KEEP/" 2>/dev/null || true; }; rm -rf "$tmp"' EXIT
export ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1220x900 IPOD_RESCUE_MODE=simulation
export IPOD_RESCUE_BACKEND="$PWD/examples/ipod-rescue/backend/rescue.py" IPOD_RESCUE_OUTPUT="$tmp/sessions"
limit=$((45 * ${ZN_WAIT_SCALE:-1}))
timeout "$limit" "$Z" check examples/ipod-rescue > "$tmp/check.out" 2>&1 || { cat "$tmp/check.out"; exit 1; }
for engine in interp quickjs native; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; native) set -- --native;; esac
  ZINC_FRAMES=30 ZINC_SHOT="$tmp/$engine.png" ZINC_FRAMEHASH=last ZINC_PROFILE=1 timeout "$limit" "$Z" run tests/data/ipod-rescue "$@" > "$tmp/$engine.out" 2>&1 || { tail -15 "$tmp/$engine.out"; exit 1; }
  grep -q '^rescue-ui: nine verified steps, SysCFG preserved, no hardware writes$' "$tmp/$engine.out" || { cat "$tmp/$engine.out"; exit 1; }
  hash=$(awk '$2 == "framehash" {print $5}' "$tmp/$engine.out" | tail -1)
  [ -n "$hash" ] || { echo "Missing $engine frame"; exit 1; }
  if [ "$engine" = interp ] && [ "${UPDATE:-0}" = 1 ]; then
    printf '%s\n' "$hash" > tests/golden/ipod-rescue/hash.txt
    cp "$tmp/$engine.png" tests/golden/ipod-rescue/workshop.png
  fi
  [ "$hash" = "$(cat tests/golden/ipod-rescue/hash.txt)" ] || { echo "$engine recovery screen differs: $hash"; exit 1; }
  grep -q 'zinc profile: paint p50=0.00 p99=0.00 ' "$tmp/$engine.out" || { echo "$engine repaints while idle"; tail -10 "$tmp/$engine.out"; exit 1; }
done
IPOD_RESCUE_TEST_FAULT=short-write ZINC_FRAMES=30 ZINC_SHOT="$tmp/failure.png" ZINC_FRAMEHASH=last timeout "$limit" "$Z" run tests/data/ipod-rescue --interp > "$tmp/failure.out" 2>&1 || { tail -15 "$tmp/failure.out"; exit 1; }
grep -q '^rescue-ui: rejected rehearsal, no false success, no hardware writes$' "$tmp/failure.out" || { cat "$tmp/failure.out"; exit 1; }
hash=$(awk '$2 == "framehash" {print $5}' "$tmp/failure.out" | tail -1)
if [ "${UPDATE:-0}" = 1 ]; then
  printf '%s\n' "$hash" > tests/golden/ipod-rescue/failure-hash.txt
  cp "$tmp/failure.png" tests/golden/ipod-rescue/failure.png
fi
[ "$hash" = "$(cat tests/golden/ipod-rescue/failure-hash.txt)" ] || { echo 'Recovery failure screen differs'; exit 1; }
python3 - "$tmp/sessions" <<'PY'
import json, pathlib, sys
results = [json.loads(p.read_text()) for p in pathlib.Path(sys.argv[1]).glob('session-*/result.json')]
assert len(results) == 4, results
assert sum(bool(r.get('simulated') and r.get('identityPreserved')) for r in results) == 3, results
assert sum(r['status'] == 'failed' for r in results) == 1, results
PY
echo 'ipod-rescue: typed UI, Python/process protocol, three engines, identity preservation, pixels and idle verified'
