#!/bin/sh
# The 2D console game, examples/platformer (ZN-754): a scripted session (tests/data/platformer/win.input: Start, then right and run held,
# ten jumps) plays to the flag on the interpreter, its event log is win.log and three of its frames hash as frames.txt; the native
# build and QuickJS draw the same frame 200; a run that never jumps loses its three lives in the first pit; the rules reach the same flag
# with the f32 numbers of the PS2 profile (examples/platformer/tests/world.test.ts); at the consoles' sizes (3DS 400x240, PSP 480x272,
# PS2 640x448, Vita 960x544) a frame stays inside the PSP's budget of the report docs/reports/games/console-2d-3d-frameworks.md (at
# most 2,300 tiles and 60 sprites, here far fewer). UPDATE=1 rewrites win.log and frames.txt.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
data=$PWD/tests/data/platformer
ex=$PWD/../examples/platformer
fail=0
run() {   # size frames input engine args...: the program's output on stdout, the frame hashes in $tmp/err
  size=$1; frames=$2; in=$3; shift 3
  ZINC_INPUT=$in ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$size ZINC_FRAMES=$frames ZINC_FRAMEHASH=all "$ZINC" run "$ex" "$@" 2>"$tmp/err"
}
hashes() { awk -v p=",$1," '/framehash/ && index(p, "," $3 ",") { print $3, $5 }' "$tmp/err"; }

run 480x272 840 "$data/win.input" --interp -- --log > "$tmp/win.log"
hashes 200,500,840 > "$tmp/frames.txt"
if [ "$UPDATE" = 1 ]; then cp "$tmp/win.log" "$tmp/frames.txt" "$data/"; fi
cmp -s "$tmp/win.log" "$data/win.log" || { echo "platformer: the scripted game differs from win.log: $(diff "$tmp/win.log" "$data/win.log" | head -4 | tr '\n' ';')"; fail=1; }
tail -1 "$tmp/win.log" | grep -q ' goal ' || { echo "platformer: the scripted game does not reach the flag"; fail=1; }
cmp -s "$tmp/frames.txt" "$data/frames.txt" || { echo "platformer: frames $(tr '\n' ' ' < "$tmp/frames.txt")differ from frames.txt"; fail=1; }
want=$(awk '$1 == 200 { print $2 }' "$data/frames.txt")
for engine in --native "--engine quickjs"; do
  run 480x272 200 "$data/win.input" $engine >/dev/null
  got=$(hashes 200 | awk '{ print $2 }')
  [ "$got" = "$want" ] || { echo "platformer: $engine draws frame 200 as $got, the interpreter $want: $(grep -v framehash "$tmp/err" | tail -2 | tr '\n' ';')"; fail=1; }
done

printf '20 pad Start\n24 padup Start\n30 pad Right\n' > "$tmp/lose.input"
run 480x272 400 "$tmp/lose.input" --interp -- --log > "$tmp/lose.log"
[ "$(grep -c ' fall ' "$tmp/lose.log")" = 3 ] && tail -1 "$tmp/lose.log" | grep -q ' over ' || { echo "platformer: a run that never jumps does not end in three falls: $(tr '\n' ';' < "$tmp/lose.log" | head -c 300)"; fail=1; }

(cd "$ex" && "$ZINC" test --profile ps2 >"$tmp/test.txt" 2>&1) || { echo "platformer: the rules fail with the PS2's f32 numbers: $(grep -i 'panic\|error' "$tmp/test.txt" | head -2)"; fail=1; }

for size in 400x240 480x272 640x448 960x544; do
  run $size 600 "$data/win.input" --interp -- --stats > "$tmp/stats.txt"
  awk -v s=$size '/^stats frame/ { if ($5 > t) t = $5; if ($7 > p) p = $7 } END { if (t == 0 || t > 2300 || p > 60) { print "platformer: " s " draws " t " tiles and " p " sprites (budget 2,300 and 60)"; exit 1 } }' "$tmp/stats.txt" || fail=1
done
[ $fail = 0 ] && echo "platformer: ok (flag at step $(tail -1 "$tmp/win.log" | cut -d' ' -f1), three engines agree, f32 rules, budgets)"
exit $fail
