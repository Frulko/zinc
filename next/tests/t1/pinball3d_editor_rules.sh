#!/bin/sh
# The table editor of the 3D pinball, guided rules (ZN-649.14, examples/pinball3d-editor): someone who does not code makes the rules
# of a table by choices, and nothing is written as the file has it. The sessions reach things as every session of the editor does
# (a thing by its name with Cmd+G, a field of the selection by its key with Cmd+F, which leaves it alone at the top of the form;
# never by the place of a line), on the table kept with the tests (table.json); they are written by tests/golden/pinball3d-editor/
# guided.py with the typist that typed the second table, and kept beside it. What the forms do is checked by the files they save.
# Slice 1, conditions and actions from choices:
#   the document without a window (src/selftest.ts): every kind of condition and of action the format has starts as a whole object
#                     the game accepts, with what the table has (its first group of lights, its first bank of drop targets); a kind
#                     that speaks of what the table lacks says so; every kind has its sentence in English and in French with the
#                     parts the format says it reads; the rules of the table are said as sentences in both languages
#   conditions.input  three rules made by choices: a condition of every kind (lights, targets, counter, rank, mode, mission, balls)
#                     and actions of nine kinds, each added by its kind and whole at once, their parts chosen in lists or typed
#                     when they are numbers or a text for the panel; a sound cannot be added on a table without sounds, and the
#                     editor says what is missing; the buttons of a sentence (up, another kind, take away). Save: conditions.json
#   the second table  its sessions (examples/pinball3d/tools/twilight_fair/sessions) no longer write a rule as the file has it:
#                     no Cmd+J in them (pinball3d_second_table.sh replays them and gets the shipped table byte for byte)
# ZN_UPDATE_GOLDEN=1 rewrites the goldens from this run.
cd "$(dirname "$0")/../.." || exit 2
ex=$PWD/../examples/pinball3d-editor; g=$PWD/tests/golden/pinball3d-editor
game=$PWD/../examples/pinball3d
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0

edit() {  # table folder, session: the editor's --log on $tmp/out
  frames=$(sed -n 's/^# frames \([0-9]*\)$/\1/p' "$2")
  PINBALL_EDITOR_LANG=en ZINC_INPUT=$2 ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=$frames \
    "$ZINC" run "$ex" -- "$1" --log >"$tmp/out" 2>"$tmp/err" || { echo "the editor failed on $(basename "$2"): $(head -c 300 "$tmp/err")"; fail=1; }
  grep -q '^Not done' "$tmp/out" && { echo "$(basename "$2"): the editor refused something: $(grep '^Not done' "$tmp/out" | head -2 | tr '\n' ';')"; fail=1; }
}
fresh() {  # name: a folder with the test's table
  mkdir -p "$tmp/$1"; cp "$g/table.json" "$tmp/$1/table.json"
}
same() {  # what, file, golden
  if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$2" "$3"; return; fi
  cmp -s "$2" "$3" || { echo "$1: $(basename "$2") differs from $3"; diff "$2" "$3" 2>/dev/null | head -10; fail=1; }
}
accepted() {  # what, table folder: the game's loader takes it, and it is in the form the game writes
  got=$("$ZINC" run "$game/tools/table.ts" -- check "$2" 2>&1)
  case $got in *'is a valid table (version 1)'*) ;; *) echo "$1: the game's loader refuses the saved table: $(printf '%s' "$got" | head -c 300)"; fail=1 ;; esac
  "$ZINC" run "$game/tools/table.ts" -- print "$2" 2>/dev/null | cmp -s - "$2/table.json" || { echo "$1: the saved table is not in the canonical form"; fail=1; }
}

# the sessions kept are the ones their script writes
if command -v python3 >/dev/null 2>&1; then
  mkdir "$tmp/sessions"
  PYTHONDONTWRITEBYTECODE=1 python3 "$g/guided.py" "$tmp/sessions" >/dev/null 2>&1 || { echo "guided.py failed"; fail=1; }
  for s in "$tmp"/sessions/*.input; do cmp -s "$s" "$g/$(basename "$s")" || { echo "$(basename "$s") is not what guided.py writes"; fail=1; }; done
fi

# ---- slice 1: conditions and actions from choices
out=$("$ZINC" run "$ex/src/selftest.ts" -- "$g/table.json" 2>&1) || fail=1
for line in 'ok: every kind of condition and of action starts whole, as an object the game accepts' \
  'ok: every kind has its sentence in English and in French, with the parts the format says it reads' 'ok: every event of the format is said in both languages' \
  'ok: a new object speaks of what the table has: its first bank of drop targets, its first group of lights' 'ok: an action becomes one of another kind in one step, and is taken away alone' \
  'ok: on a table that lacks what a kind speaks of, the kind says so; a counter comes with the first thing that counts' 'ok: a part of an item of a list is found from the thing that holds the list' \
  'en rule 9: When the ball knocks bank down, if the targets of bank are all down: add 10,000 points; raise the targets of bank; show "SHIELDS DOWN" on the panel' \
  'fr rule 14: Quand la bille sort de rail, si le compteur laps vaut au moins 5 : compteur laps : mettre à 0 ; accorder une bille sauvée pendant 15 s ; afficher "FIVE LAPS: BALL SAVED" sur le panneau' \
  'fr rule 3: Quand la bille roule sur lanes, si les lampes de l’élément lui-même sont toutes éteintes : allumer les lampes de l’élément lui-même ; ajouter 1 000 points'; do
  case $out in *"$line"*) ;; *) echo "the document's self-test does not say: $line"; fail=1 ;; esac
done

fresh conditions
edit "$tmp/conditions" "$g/conditions.input"
same "conditions and actions from choices" "$tmp/conditions/table.json" "$g/conditions.json"
accepted "conditions and actions from choices" "$tmp/conditions"
grep -q '"Play a sound" needs one of the sounds, and the table has none yet' "$tmp/out" || { echo "a sound to play on a table without sounds: the editor does not say what is missing: $(head -c 200 "$tmp/out")"; fail=1; }
cmp -s "$tmp/conditions/table.json" "$g/table.json" && { echo "the conditions session changed nothing"; fail=1; }
# what the session made: a condition of every kind but one taken away again, and nothing typed as the file has it
for part in '"test": "lights", "target": "lanes", "is": "on"' '"test": "targets", "target": "bank", "is": "down"' '"test": "counter", "target": "laps", "value": 2' '"test": "mode", "target": "multiball"' \
  '"test": "mission", "target": "cargo"' '"test": "balls", "is": "below", "value": 3' '"do": "award", "mode": "ballSave", "seconds": 15' '"do": "count", "target": "laps", "mode": "set"'; do
  grep -qF "$part" "$g/conditions.json" || { echo "conditions.json does not hold { $part }"; fail=1; }
done
# (the table had rules that test the rank before: the one the session added and took away by its button must not be one more)
[ "$(grep -c '"test": "rank"' "$g/conditions.json")" = "$(grep -c '"test": "rank"' "$g/table.json")" ] || { echo "the condition taken away by its button is still in conditions.json"; fail=1; }
grep -q 'key j' "$g/conditions.input" "$g/rules.input" && { echo "a session of the guided rules writes something as the file has it (Cmd+J)"; fail=1; }
grep -lq 'key j' "$game"/tools/twilight_fair/sessions/*.input && { echo "a session of the second table still writes something as the file has it (Cmd+J)"; fail=1; }

[ $fail = 0 ] && echo "pinball3d_editor_rules: ok"
exit $fail
