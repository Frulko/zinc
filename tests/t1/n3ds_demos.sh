#!/bin/sh
# The 3DS's two-screen games (ZN-790): examples/n3ds-pinball, n3ds-platformer and n3ds-starfall, headless on the interpreter with their
# bottom screen as a second window. Each plays a scripted session (the pinball: a game started, launched and flipped; the platformer: the
# platformer's run to the flag; Starfall: a tap on the touch screen, then lines drawn with the stylus) and three of its top screen's
# frames hash as frames.txt; Starfall's and the platformer's frame 200 is the same on QuickJS; Starfall's rules pass `zinc test`.
# On the 3DS itself (Azahar, by hand): tools/console-demos <project> <name> n3ds, see each README. UPDATE=1 rewrites frames.txt.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
data=$PWD/tests/data/n3ds-demos
fail=0
run() {   # project frames input engine...: the frame hashes on stderr ($tmp/err)
  p=$1; frames=$2; in=$3; shift 3
  ZINC_INPUT=$in ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=$frames ZINC_FRAMEHASH=all "$ZINC" run "examples/$p" "$@" >"$tmp/out" 2>"$tmp/err"
}
hashes() { awk -v d="$1" -v p=",$2," '/framehash/ && index(p, "," $3 ",") { print d, $3, $5 }' "$tmp/err"; }

: > "$tmp/frames.txt"
run n3ds-pinball 900 "$data/pinball.input" --interp; hashes n3ds-pinball 300,600,900 >> "$tmp/frames.txt"
run n3ds-platformer 840 "$PWD/tests/data/platformer/win.input" --interp; hashes n3ds-platformer 200,500,840 >> "$tmp/frames.txt"
run n3ds-starfall 900 "$data/starfall.input" --interp; hashes n3ds-starfall 200,500,900 >> "$tmp/frames.txt"
if [ "$UPDATE" = 1 ]; then cp "$tmp/frames.txt" "$data/frames.txt"; fi
[ "$(wc -l < "$tmp/frames.txt")" -eq 9 ] || { echo "n3ds_demos: a session drew fewer frames than asked: $(tr '\n' ' ' < "$tmp/frames.txt")$(grep -i 'panic\|error' "$tmp/err" | head -2)"; fail=1; }
cmp -s "$tmp/frames.txt" "$data/frames.txt" || { echo "n3ds_demos: frames differ from frames.txt: $(diff "$tmp/frames.txt" "$data/frames.txt" | grep '^<' | head -3 | tr '\n' ';')"; fail=1; }

for p in n3ds-platformer n3ds-starfall; do
  in="$data/starfall.input"; [ $p = n3ds-platformer ] && in="$PWD/tests/data/platformer/win.input"
  want=$(awk -v d=$p '$1 == d && $2 == 200 { print $3 }' "$data/frames.txt")
  run $p 200 "$in" --engine quickjs
  got=$(hashes $p 200 | awk '{ print $3 }')
  [ "$got" = "$want" ] || { echo "n3ds_demos: QuickJS draws $p's frame 200 as $got, the interpreter $want: $(grep -v framehash "$tmp/err" | tail -2 | tr '\n' ';')"; fail=1; }
done

(cd examples/n3ds-starfall && "$ZINC" test >"$tmp/test.txt" 2>&1) || { echo "n3ds_demos: Starfall's rules fail: $(grep -i 'panic\|error' "$tmp/test.txt" | head -2)"; fail=1; }
exit $fail
