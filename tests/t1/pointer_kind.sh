#!/bin/sh
# Pointer kinds (ZN-228): a click-drag with a mouse does not scroll a ScrollView on a desktop, a touch drag does (ZINC_POINTER=mouse|touch force the policy; a Pi panel or the sim
# keep drag scrolling by default), and the wheel still scrolls with a mouse.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
shot() {   # $1 name, $2 pointer policy, $3 input tape
  env $2 ZINC_INPUT="$3" ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=320x240 ZINC_FRAMES=40 ZINC_SHOT="$tmp/$1.png" ZINC_SHOT_FRAMES=40 "$ZINC" run tests/golden/ui/scrolldrag.tsx >/dev/null 2>"$tmp/err" || { echo "$1: run failed: $(head -c 200 "$tmp/err")"; exit 1; }
}
: > "$tmp/none.input"
shot rest ZINC_POINTER=mouse "$tmp/none.input"
shot mouse ZINC_POINTER=mouse tests/golden/ui/scrolldrag.input
shot touch ZINC_POINTER=touch tests/golden/ui/scrolldrag.input
python3 tools/pngdiff "$tmp/rest-40.png" "$tmp/mouse-40.png" >/dev/null || { echo "a mouse drag scrolled the page"; exit 1; }
python3 tools/pngdiff "$tmp/rest-40.png" "$tmp/touch-40.png" >/dev/null && { echo "a touch drag did not scroll the page"; exit 1; }
exit 0
