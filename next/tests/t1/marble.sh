#!/bin/sh
# The 3D console game, examples/marble (ZN-754): a scripted session (tests/data/marble/win.input, what the game's --autopilot held:
# Start, then the d-pad tilting the board down the terraces and onto the left shuttle) rolls into the goal ring on the interpreter, its
# event log is win.log and three of its frames hash as frames.txt; the native build and QuickJS draw the same frame 300; holding up and
# left from the start falls off three times (lose.input); the rules reach the ring with the f32 numbers of the PS2 profile
# (examples/marble/tests/course.test.ts); at the consoles' sizes a frame stays inside the budgets of
# docs/reports/games/console-2d-3d-frameworks.md: at most 5,000 triangles and 60 draws with the low models (3DS 400x240, PSP 480x272,
# PS2 640x448), 30,000 and 60 with the high ones (Vita 960x544). UPDATE=1 rewrites win.log and frames.txt.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
data=$PWD/tests/data/marble
ex=$PWD/../examples/marble
fail=0
run() {   # size frames input engine args...: the program's output on stdout, the frame hashes in $tmp/err
  size=$1; frames=$2; in=$3; shift 3
  ZINC_INPUT=$in ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$size ZINC_FRAMES=$frames ZINC_FRAMEHASH=all "$ZINC" run "$ex" "$@" 2>"$tmp/err"
}
hashes() { awk -v p=",$1," '/framehash/ && index(p, "," $3 ",") { print $3, $5 }' "$tmp/err"; }

run 480x272 1400 "$data/win.input" --interp -- --log --stats > "$tmp/out.txt"
grep -v '^stats' "$tmp/out.txt" > "$tmp/win.log"
hashes 300,900,1400 > "$tmp/frames.txt"
if [ "$UPDATE" = 1 ]; then cp "$tmp/win.log" "$tmp/frames.txt" "$data/"; fi
cmp -s "$tmp/win.log" "$data/win.log" || { echo "marble: the scripted game differs from win.log: $(diff "$tmp/win.log" "$data/win.log" | head -4 | tr '\n' ';')"; fail=1; }
tail -1 "$tmp/win.log" | grep -q ' goal ' || { echo "marble: the scripted game does not reach the ring"; fail=1; }
cmp -s "$tmp/frames.txt" "$data/frames.txt" || { echo "marble: frames $(tr '\n' ' ' < "$tmp/frames.txt")differ from frames.txt"; fail=1; }
budget() {   # size max-triangles: the largest frame of $tmp/out.txt
  awk -v s=$1 -v t=$2 '/^stats frame/ { if ($5 > tr) tr = $5; if ($7 > d) d = $7 } END { if (tr == 0 || tr > t || d > 60) { print "marble: " s " draws " tr " triangles in " d " draws (budget " t " and 60)"; exit 1 } }' "$tmp/out.txt"
}
budget 480x272 5000 || fail=1
want=$(awk '$1 == 300 { print $2 }' "$data/frames.txt")
for engine in --native "--engine quickjs"; do
  run 480x272 300 "$data/win.input" $engine >/dev/null
  got=$(hashes 300 | awk '{ print $2 }')
  [ "$got" = "$want" ] || { echo "marble: $engine draws frame 300 as $got, the interpreter $want: $(grep -v framehash "$tmp/err" | tail -2 | tr '\n' ';')"; fail=1; }
done

run 480x272 700 "$data/lose.input" --interp -- --log > "$tmp/lose.log"
[ "$(grep -c ' fall ' "$tmp/lose.log")" = 3 ] && tail -1 "$tmp/lose.log" | grep -q ' over ' || { echo "marble: holding up and left does not end in three falls: $(tr '\n' ';' < "$tmp/lose.log" | head -c 300)"; fail=1; }

(cd "$ex" && "$ZINC" test --profile ps2 >"$tmp/test.txt" 2>&1) || { echo "marble: the rules fail with the PS2's f32 numbers: $(grep -i 'panic\|error' "$tmp/test.txt" | head -2)"; fail=1; }

for sz in 400x240:5000 640x448:5000 960x544:30000; do
  run ${sz%:*} 900 "$data/win.input" --native -- --stats > "$tmp/out.txt"
  budget ${sz%:*} ${sz#*:} || fail=1
done
[ $fail = 0 ] && echo "marble: ok (ring at step $(tail -1 "$tmp/win.log" | cut -d' ' -f1), three engines agree, f32 rules, budgets)"
exit $fail
