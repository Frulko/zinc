#!/bin/sh
# The table chooser of the 3D pinball (ZN-649.17, examples/pinball3d/src/chooser.ts): while a table waits for a player, the list of
# the game's tables is over it, a card each with its picture and its name. (The list with the first table chosen is the frame 12 of
# tests/t1/pinball3d.sh, in both layouts.)
# - Tab goes to the next table: the second one is then behind the list and on the panel (frame 14 equals its pixel golden on the
#   software renderer, tests/golden/pinball3d/chooser-14.png), and Start plays it: the log names the table that came on, then the
#   game that starts.
# - A press on a card takes that table.
# - The interpreter draws the same frame as the compiled game, byte for byte (the long games are in pinball3d.sh and pinball3d_aot.sh).
# - A table put in the folder of the game's tables, as a folder or as a package, is in the list at the next start, and so is the
#   package --table names, which is the one that is on: Tab goes through all five in order and comes back to it. (On a copy of the
#   game, run by the interpreter: nothing is compiled for it.)
# ZN_UPDATE_GOLDEN=1 rewrites the golden from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/examples/pinball3d; gold=$PWD/tests/golden/pinball3d
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0

game() {   # where the log goes, the input, frames, frames to capture, then what `zinc run` takes
  out=$1; in=$2; frames=$3; shots=$4; shift 4
  ZINC_INPUT=$in ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=$frames ZINC_SHOT="$tmp/shot.png" ZINC_SHOT_FRAMES=$shots \
    "$ZINC" run "$@" >"$out" 2>"$tmp/err" || { echo "pinball3d_chooser: the game failed: $(head -c 300 "$tmp/err")"; fail=1; }
}

# ---- the second table chosen with Tab, and played
printf '8 key Tab\n20 pad Start\n24 padup Start\n' > "$tmp/tab.input"
game "$tmp/tab.log" "$tmp/tab.input" 40 14 "$ex" -- --log
printf 'table Twilight Fair\n0.000 game start\n0.000 game ballStart\n0.000 ball 1\n' | cmp -s - "$tmp/tab.log" \
  || { echo "pinball3d_chooser: Tab then Start does not play the second table: $(head -4 "$tmp/tab.log" | tr '\n' ';')"; fail=1; }
[ -n "$ZN_UPDATE_GOLDEN" ] && cp "$tmp/shot-14.png" "$gold/chooser-14.png"
cmp -s "$tmp/shot-14.png" "$gold/chooser-14.png" || tools/pngdiff "$tmp/shot-14.png" "$gold/chooser-14.png" >/dev/null 2>&1 \
  || { echo "pinball3d_chooser: the list with the second table chosen differs from its golden: $(tools/pngdiff "$tmp/shot-14.png" "$gold/chooser-14.png" 2>&1 | head -1)"; fail=1; }
cp "$tmp/shot-14.png" "$tmp/compiled-14.png"

# ---- the interpreter: the same frame; and a press on the second card
game "$tmp/interp.log" "$tmp/tab.input" 16 14 "$ex" --interp -- --log
cmp -s "$tmp/shot-14.png" "$tmp/compiled-14.png" || { echo "pinball3d_chooser: the interpreter does not draw the frame the compiled game draws"; fail=1; }
printf '6 move 190 230\n7 down\n8 up\n' > "$tmp/press.input"
game "$tmp/press.log" "$tmp/press.input" 14 0 "$ex" --interp -- --log
[ "$(cat "$tmp/press.log")" = "table Twilight Fair" ] || { echo "pinball3d_chooser: a press on the second card does not take its table: $(head -3 "$tmp/press.log" | tr '\n' ';')"; fail=1; }

# ---- tables put in the folder (a folder, a package) and a package named: all in the list
cp -R "$ex" "$tmp/game"
small=$PWD/examples/pinball3d-editor/assets/new-table/table.json   # a table with no file of its own: a board and a plunger
named() {   # folder, name: the small table under that name
  mkdir -p "$1"; sed "s/\"name\": \"[^\"]*\"/\"name\": \"$2\"/" "$small" > "$1/table.json"
}
named "$tmp/game/assets/tables/low-tide" "Low Tide"
named "$tmp/packed" "Packed Tide"; named "$tmp/other" "Named Tide"
"$ZINC" run "$ex/tools/table.ts" -- pack "$tmp/packed" "$tmp/game/assets/tables/packed.zpinball" >/dev/null 2>&1 || { echo "pinball3d_chooser: the small table is not packed"; fail=1; }
"$ZINC" run "$ex/tools/table.ts" -- pack "$tmp/other" "$tmp/named.zpinball" >/dev/null 2>&1 || { echo "pinball3d_chooser: the small table is not packed"; fail=1; }
printf '6 key Tab\n12 key Tab\n18 key Tab\n24 key Tab\n30 key Tab\n' > "$tmp/round.input"
game "$tmp/round.log" "$tmp/round.input" 36 0 "$tmp/game" --interp -- --log "--table=$tmp/named.zpinball"
printf 'table Low Tide\ntable Packed Tide\ntable Tidal Lock\ntable Twilight Fair\ntable Named Tide\n' | cmp -s - "$tmp/round.log" \
  || { echo "pinball3d_chooser: the tables put in the folder and the package named are not the list Tab goes through: $(tr '\n' ';' < "$tmp/round.log")"; fail=1; }

[ $fail = 0 ] && echo "pinball3d_chooser: ok"
exit $fail
