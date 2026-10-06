#!/bin/sh
# Zinc Atelier (ZN-050): the app (app/atelier/main.tsx) runs headless on scripted input and draws the same pixels as the goldens:
#   check.input   click Check on a file with a type error: the Problems tab lists the diagnostic of `zinc check`
#   run.input     open good.ts, click Run: the child `zinc run` prints into the Output tab
#   edit.input    type into the editor and Save
#   trace.json    a ZINC_TRACE file loaded into the Frames tab (ZINC_ATELIER_TRACE)
# The emulated ESP32 run is tests/t2/atelier_esp32.sh (it needs the downloaded emulator).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
g=tests/golden/atelier
shot() {  # name frames input [VAR=value]
  n=$1; f=$2; in=$3; extra=${4:-ZINC_ATELIER=1}
  env "$extra" ZINC_ATELIER_SYNC=1 ZINC_INPUT="$in" ZINC_SIZE=1100x700 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=$f ZINC_SCALE=1 ZINC_SHOT="$tmp/$n.png" ZINC_SHOT_FRAMES=$f \
    "$ZINC" run app/atelier/main.tsx -- $g/proj >/dev/null 2>"$tmp/err" || { echo "atelier $n failed: $(head -c 300 "$tmp/err")"; fail=1; return; }
  tools/pngdiff "$tmp/$n-$f.png" "$g/$n-$f.png" >/dev/null || { echo "atelier $n: frame $f differs from $g/$n-$f.png"; fail=1; }
}
shot check 12 $g/check.input
shot run 16 $g/run.input
shot trace 3 /dev/null ZINC_ATELIER_TRACE=$g/trace.json
# edit: click in the editor, go to the end, type a word, click Save: the file on disk has it
cp -R $g/proj "$tmp/proj"
ZINC_ATELIER_SYNC=1 ZINC_INPUT=$g/edit.input ZINC_SIZE=1100x700 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=14 "$ZINC" run app/atelier/main.tsx -- "$tmp/proj" >/dev/null 2>"$tmp/err" \
  || { echo "atelier edit failed: $(head -c 300 "$tmp/err")"; fail=1; }
grep -q EDITED "$tmp/proj/bad.ts" || { echo "atelier edit: the typed text was not saved"; fail=1; }
exit $fail
