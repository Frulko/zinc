#!/bin/sh
# The 3D pinball compiled (ZN-649.02): the program `zinc build` makes of examples/pinball3d plays the scripted game of tests/t1/pinball3d.sh
# for 60 seconds and prints the same score and event log as the interpreter (tests/data/pinball3d/play.log).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
data=$PWD/tests/data/pinball3d
"$ZINC" build ../examples/pinball3d -o "$tmp/pinball3d" >"$tmp/build.log" 2>&1 || { echo "pinball3d_aot: the game does not compile: $(tail -c 400 "$tmp/build.log")"; exit 1; }
cd ../examples/pinball3d || exit 2   # a compiled program reads its files from where it runs: the project's folder
ZINC_INPUT="$data/play.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=3600 "$tmp/pinball3d" --log >"$tmp/play.log" 2>"$tmp/err" \
  || { echo "pinball3d_aot: the compiled game failed: $(head -c 300 "$tmp/err")"; exit 1; }
cmp -s "$tmp/play.log" "$data/play.log" || { echo "pinball3d_aot: the compiled game prints another log: $(diff "$tmp/play.log" "$data/play.log" | head -4 | tr '\n' ';')"; exit 1; }
exit 0
