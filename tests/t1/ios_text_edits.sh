#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
set -eu
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for engine in interp aot quickjs; do
  case $engine in interp) flag=--interp;; aot) flag=;; quickjs) flag='--engine quickjs';; esac
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_PLATFORM=ios ZINC_DEVICE_LOG="$t/$engine.device" ZINC_FRAMES=8 "$ZINC" run tests/golden/text-touch/edits.tsx $flag > "$t/$engine.out" 2>&1 || { cat "$t/$engine.out"; exit 1; }
  grep -q 'ime range edits: ok' "$t/$engine.out"
  grep -q '^textinput 11 7 -1 -1$' "$t/$engine.device"
  grep -q '^textinput 0 0 -1 -1$' "$t/$engine.device"
done
echo 'ios text edits: range replacement and controlled clear pass on all engines'
