#!/bin/sh
# The second table of the 3D pinball, Twilight Fair, made with the editor only (ZN-649.05). The proof that a table is data, and that
# the editor makes one:
# - the five editor sessions kept with the example (examples/pinball3d/tools/twilight_fair/sessions, written by sessions.py: what a
#   person does in the editor, in order) are replayed here on the table the editor's own test makes from nothing (new.json), in a
#   folder holding the table's art/ and sounds/: the table they save is, byte for byte, the one the game ships
#   (assets/tables/twilight-fair/table.json). No line of that file was typed outside the editor;
# - the game's loader accepts it and it is in the canonical form; every file it names is in its folder and has a credit;
# - the game plays its scripted game on it (the same hands as on Tidal Lock: tests/data/pinball3d/play.input) and prints the log of
#   tests/data/pinball3d/twilight-fair.log: a whole game with bumpers, coconuts and a mission done; Tidal Lock's own log is held by
#   pinball3d.sh, with the same code;
# - single shots show what is its own: the high striker catches the ball and throws it onto the bandstand, where it rings a bell;
# - nothing of the table is in the game's code: no name, text or file of its table.json appears in the sources.
# To make the log again after an intended change of the table: tests/demo/pinball3d_second_table.sh --update (with ZINC set).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: python3 is not installed"; exit 77; }
ed=$PWD/examples/pinball3d-editor; game=$PWD/examples/pinball3d
table=$game/assets/tables/twilight-fair; made=$game/tools/twilight_fair
data=$PWD/tests/data/pinball3d
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0

# the sessions are the ones their script writes
PYTHONDONTWRITEBYTECODE=1 python3 "$made/sessions.py" "$tmp/sessions" >/dev/null 2>&1 && diff -r "$tmp/sessions" "$made/sessions" >/dev/null || { echo "the sessions of Twilight Fair are not what sessions.py writes"; fail=1; }
# replayed in the editor, from the table made from nothing
mkdir "$tmp/fair"
cp "$PWD/tests/golden/pinball3d-editor/new.json" "$tmp/fair/table.json"
cp -R "$table/art" "$table/sounds" "$tmp/fair/"
for s in "$made"/sessions/*.input; do
  frames=$(sed -n 's/^# frames \([0-9]*\)$/\1/p' "$s")
  PINBALL_EDITOR_LANG=en ZINC_INPUT=$s ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=1440x900 ZINC_FRAMES=$frames "$ZINC" run "$ed" -- "$tmp/fair" --log >"$tmp/out" 2>"$tmp/err" \
    || { echo "the editor failed on $(basename "$s"): $(head -c 300 "$tmp/err")"; fail=1; }
  grep -q '^Not done' "$tmp/out" && { echo "$(basename "$s"): the editor refused something: $(grep '^Not done' "$tmp/out" | head -2 | tr '\n' ';')"; fail=1; }
done
cmp -s "$tmp/fair/table.json" "$table/table.json" || { echo "the table the sessions make is not the one the game ships: $(diff "$tmp/fair/table.json" "$table/table.json" | head -6 | tr '\n' ';')"; fail=1; }
got=$("$ZINC" run "$game/tools/table.ts" -- check "$table" 2>&1)
case $got in *'"Twilight Fair" is a valid table (version 1)'*) ;; *) echo "the game's loader refuses Twilight Fair: $(printf '%s' "$got" | head -c 300)"; fail=1 ;; esac
"$ZINC" run "$game/tools/table.ts" -- print "$table" 2>/dev/null | cmp -s - "$table/table.json" || { echo "Twilight Fair is not in the canonical form"; fail=1; }

# the scripted game
ZINC_INPUT="$data/play.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=3600 "$ZINC" run "$game" -- "--table=$table" --log >"$tmp/play.log" 2>"$tmp/err" \
  || { echo "the game failed on Twilight Fair: $(head -c 300 "$tmp/err")"; fail=1; }
[ "$1" = "--update" ] && { cp "$tmp/play.log" "$data/twilight-fair.log"; echo "pinball3d_second_table: twilight-fair.log is written again"; }
cmp -s "$tmp/play.log" "$data/twilight-fair.log" || { echo "the scripted game on Twilight Fair does not print twilight-fair.log: $(diff "$tmp/play.log" "$data/twilight-fair.log" | head -5 | tr '\n' ';')"; fail=1; }
grep -q "game over: score" "$data/twilight-fair.log" && [ "$(grep -c ' hit ' "$data/twilight-fair.log")" -ge 20 ] && grep -q ' game missionDone' "$data/twilight-fair.log" \
  || { echo "twilight-fair.log is not a whole game with hits and a mission done"; fail=1; }
cmp -s "$data/twilight-fair.log" "$data/play.log" && { echo "the two tables play the same game"; fail=1; }
# the high striker: a slow ball above it is caught, held, thrown up onto the bandstand (5 cm above the board), and rings a bell there
out=$("$ZINC" run "$game/tools/probe.ts" -- "$table" 9 27 1.37 0 60 0 3 2>&1)
echo "$out" | grep -q " striker capture" && echo "$out" | grep -q " striker eject" && echo "$out" | grep -q " bell1 hit" || { echo "the high striker does not throw the ball to a bell: $(echo "$out" | head -6 | tr '\n' ';')"; fail=1; }
high=$(echo "$out" | sed -n 's/.*highest \([0-9.]*\),.*/\1/p')
python3 -c "import sys; sys.exit(0 if 6 < float('$high') < 9 else 1)" || { echo "the ball does not reach the bandstand (highest $high)"; fail=1; }

# its files, their credits, and nothing of it in the code
python3 - "$game" "$table" <<'PY' || fail=1
import glob, json, os, re, sys
game, folder = sys.argv[1], sys.argv[2]
t = json.load(open(folder + '/table.json'))
code = ''.join(open(f).read() for f in glob.glob(game + '/src/*.ts') + glob.glob(game + '/../pinball-kit/*.ts') + glob.glob(game + '/../pinball-kit/format/*.ts') + glob.glob(game + '/tools/*.ts'))
credited = {f for c in t.get('credits', []) for f in c['files'] if c.get('author') and c.get('licence')}
WORDS = {'format', 'event', 'jackpotEvent', 'do', 'mode', 'test', 'is', 'kind', 'shape', 'style', 'show', 'align', 'button', 'shading', 'penalty', 'collide', 'wave'}
bad, named = [], set()
def walk(v, key=''):
    if isinstance(v, dict):
        for k, x in v.items(): walk(x, k)
    elif isinstance(v, list):
        for x in v: walk(x, key)
    elif isinstance(v, str):
        if key not in WORDS and len(v) > 3 and not v.startswith('#') and re.search(r'[A-Z0-9 /.]', v) and (("'" + v + "'") in code or ('"' + v + '"') in code or ('`' + v + '`') in code): bad.append(f'the code holds "{v}"')
        if key in ('texture', 'textureLit', 'mesh', 'image', 'file') and v:
            named.add(v)
            if not os.path.exists(folder + '/' + v): bad.append(f'{v} is not in the folder')
            if v not in credited: bad.append(f'{v} has no credit')
walk(t)
on_disk = {os.path.relpath(f, folder) for f in glob.glob(folder + '/art/*') + glob.glob(folder + '/sounds/*')}
if on_disk - named: bad.append('files nothing names: ' + ', '.join(sorted(on_disk - named)))
if len(t['sounds']) < 30 or len([l for l in t['looks'] if l.get('texture')]) < 8 or len([m for m in t['models'] if m.get('mesh')]) < 2: bad.append('the table lost its sounds, images or models')
if bad:
    print('Twilight Fair: ' + '; '.join(sorted(set(bad))[:8]))
    sys.exit(1)
PY

[ $fail = 0 ] && echo "pinball3d_second_table: ok"
exit $fail
