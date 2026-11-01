#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for mode in portrait landscape; do
  case $mode in portrait) size=390x844; safe='62 0 34 0';; landscape) size=844x390; safe='0 59 21 59';; esac
  printf '1 safearea %s\n6 key q\n' "$safe" > "$t/input"
  ZINC_HEADLESS=1 ZINC_PLATFORM=ios ZINC_SIZE=$size ZINC_FRAMES=8 ZINC_INPUT="$t/input" ZINC_SHOT="$t/$mode.png" "$ZINC" run tests/data/murdoku/safe-area.ts --engine quickjs > "$t/out" 2>&1 || { cat "$t/out"; exit 1; }
  grep -q 'safe area ok' "$t/out"
done
echo 'murdoku safe area: portrait and landscape controls stay inside the usable screen'
