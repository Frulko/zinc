#!/bin/sh
# The sounds of the 3D pinball (ZN-649.03, examples/pinball3d/src/audio.ts): every event of an element plays the sound the table file names for it.
# - The scripted game of tests/t1/pinball3d.sh, run with --sounds, prints the sound log of tests/data/pinball3d/sounds.log: each sound with what made
#   it, its volume and pitch (varied from one play to the next by a generator that repeats), its place between the speakers, the rolling sound
#   every half second and each change of music (tests/t1/pinball3d_aot.sh holds the compiled program to the same log).
# - The table is complete: every element names a sound for each of its events, every event of the game has a rule that plays one (a bump
#   of the table and a letter of the initials signed too, ZN-649.10: both are in the scripted game's log), every state
#   has its music, every file is there, and the audio is under 1 MB.
# - Every sound decodes and gives samples on the mixer that has no output (tools/soundcheck.ts, the plugin's native code).
# - The rolling sound follows the ball: louder means higher.
# - A sound name changed in the table file changes what plays, with no change of code: the bumpers given the standup's sound, the slingshots
#   a tone the copy of the table defines.
# - Single shots (tools/probe.ts ... sounds) for what the scripted player never reaches: the ramp, the rail, the dock, the spinner, the
#   standups, the tilt, multiball.
# To make the golden again after an intended change: tests/t1/pinball3d_sound.sh --update (with ZINC set).
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null 2>&1 || { echo "skipped: python3 is not installed"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ex=examples/pinball3d
data=$PWD/tests/data/pinball3d
table=$(cd $ex/assets/tables && ls | head -1)
folder=$(cd $ex/assets/tables/$table && pwd)

game() {   # output, arguments of the game...
  out=$1; shift
  ZINC_INPUT="$data/play.input" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=640x400 ZINC_FRAMES=3600 "$ZINC" run $ex -- --sounds "$@" >"$out" 2>"$out.err" \
    || { echo "pinball3d_sound: the game failed: $(head -c 400 "$out.err")"; fail=1; }
}
game "$tmp/sounds.log"
[ "$1" = "--update" ] && { cp "$tmp/sounds.log" "$data/sounds.log"; echo "pinball3d_sound: sounds.log is written again"; }
cmp -s "$tmp/sounds.log" "$data/sounds.log" || { echo "pinball3d_sound: the scripted game does not print sounds.log: $(diff "$tmp/sounds.log" "$data/sounds.log" | head -5 | tr '\n' ';')"; fail=1; }

# the table names a sound for everything, and its files are there and small
python3 - "$folder" "$data/sounds.log" <<'PY' || fail=1
import json, os, sys
folder, log = sys.argv[1], open(sys.argv[2]).read().split('\n')
t = json.load(open(folder + '/table.json'))
bad = []
EVENTS = {'walls': ['hit'], 'gates': ['pass'], 'flippers': ['up', 'down'], 'bumpers': ['hit'], 'slingshots': ['hit'], 'kickers': ['capture', 'eject'],
          'targets': ['hit', 'reset'], 'rollovers': ['roll'], 'spinners': ['spin'], 'ramps': ['enter', 'exit']}
names = {s['id'] for s in t.get('sounds', [])}
for kind, events in EVENTS.items():
    for e in t.get(kind, []):
        for ev in events:
            if e.get('sounds', {}).get(ev, '') not in names: bad.append(f"{e['id']} has no sound for {ev}")
for ev in ('pull', 'release'):
    if t['plunger'].get('sounds', {}).get(ev, '') not in names: bad.append(f'the plunger has no sound for {ev}')
for ev in ('roll', 'hit', 'land', 'knock'):
    if t['physics']['ball'].get('sounds', {}).get(ev, '') not in names: bad.append(f'the ball has no sound for {ev}')
for ev in ('start', 'ballStart', 'drain', 'ballSaved', 'bump', 'tilt', 'missionDone', 'rankUp', 'multiballStart', 'multiballEnd', 'jackpot', 'extraBall', 'gameOver', 'letter'):
    if not any(w['on'] == 'game' and w['event'] == ev and any(a['do'] == 'sound' for a in w['do']) for w in t['rules']['when']): bad.append(f'no rule plays a sound when the game says {ev}')
for state in ('attract', 'play', 'multiball', 'gameOver'):
    if t.get('music', {}).get(state, '') not in names: bad.append(f'no music for {state}')
files = sorted({s['file'] for s in t['sounds'] if s.get('file')})
size = 0
for f in files:
    if not os.path.exists(f'{folder}/{f}'): bad.append(f'{f} is missing')
    else: size += os.path.getsize(f'{folder}/{f}')
if size >= 1024 * 1024: bad.append(f'the audio is {size} bytes: 1 MB or more')
# every file has its author and its licence in the table file, and every page it names is in the example's LICENSES.md
licences = open(folder + '/../../../LICENSES.md').read()
credited = {f: c for c in t.get('credits', []) for f in c['files']}
for f in files:
    if f not in credited or not credited[f]['licence'] or not credited[f]['author']: bad.append(f'{f} has no credit with an author and a licence')
    elif credited[f]['source'].startswith('http') and (credited[f]['source'] not in licences or f.split('/')[-1] not in licences): bad.append(f'{f}: its source is not in LICENSES.md')
# the log: variation, the music of each state, and a rolling sound that is higher when it is louder
flips = {tuple(l.split()[-6:]) for l in log if ' left up: ' in l}
if len(flips) < 5: bad.append('the flipper sounds the same at every play')
for state in ('attract', 'play', 'gameOver'):
    if not any(f' music {state}: ' in l for l in log): bad.append(f'the music of {state} never starts')
rolls = sorted((float(l.split()[5]), float(l.split()[7])) for l in log if ' ball roll: ' in l and ' vol ' in l)
if len({v for v, _ in rolls}) < 5 or any(a[1] > b[1] + 0.011 for a, b in zip(rolls, rolls[1:])): bad.append('the rolling sound does not rise with its volume')
if bad:
    print('pinball3d_sound: ' + '; '.join(bad[:8]))
    sys.exit(1)
PY

# every sound of the table gives samples (the native mixer without an output)
ZINC_HEADLESS=1 ZINC_NATIVE=real "$ZINC" run $ex/tools/soundcheck.ts -- "$folder" >"$tmp/check.txt" 2>&1 || { echo "pinball3d_sound: soundcheck: $(grep -E 'SILENT|silent|error' "$tmp/check.txt" | head -3 | tr '\n' ';')"; fail=1; }
grep -q " sounds, 0 silent; " "$tmp/check.txt" || { echo "pinball3d_sound: soundcheck does not end with its count: $(tail -1 "$tmp/check.txt")"; fail=1; }

# another name in the table file, another sound: nothing else changes
cp -R "$folder" "$tmp/other"
python3 - "$tmp/other/table.json" <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))
for b in t['bumpers']: b['sounds']['hit'] = t['targets'][-1]['sounds']['hit']
t['sounds'].append({'id': 'otherTone', 'wave': 'triangle', 'hz': 660, 'seconds': 0.05})
for s in t['slingshots']: s['sounds']['hit'] = 'otherTone'
json.dump(t, open(sys.argv[1], 'w'))
PY
game "$tmp/other.log" "--table=$tmp/other"
python3 - "$data/sounds.log" "$tmp/other.log" "$folder/table.json" <<'PY' || fail=1
import json, sys
was, now = open(sys.argv[1]).read().split('\n'), open(sys.argv[2]).read().split('\n')
t = json.load(open(sys.argv[3]))
bumper, standup, sling = t['bumpers'][0]['sounds']['hit'], t['targets'][-1]['sounds']['hit'], t['slingshots'][0]['sounds']['hit']
def count(log, element, sound): return sum(1 for l in log if f' {element} hit: {sound} ' in l)
bad = []
for e in t['bumpers']:
    if count(was, e['id'], bumper) == 0 and e is t['bumpers'][0]: bad.append('the golden has no bumper to compare')
    if count(now, e['id'], standup) != count(was, e['id'], bumper) or count(now, e['id'], bumper) != 0: bad.append(f"{e['id']} does not play {standup}")
for e in t['slingshots']:
    if count(now, e['id'], 'otherTone') != count(was, e['id'], sling) or count(now, e['id'], sling) != 0: bad.append(f"{e['id']} does not play the new tone")
# every other line names the same sound for the same thing at the same time
changed = [f" {e['id']} hit:" for e in t['bumpers'] + t['slingshots']]
strip = lambda log: [' '.join(l.split()[:4]) for l in log if not l.startswith('audio ') and not any(c in l for c in changed)]
if strip(was) != strip(now): bad.append('other sounds changed too')
if bad:
    print('pinball3d_sound: a sound renamed in the table file: ' + '; '.join(bad[:5]))
    sys.exit(1)
PY

# single shots: what the scripted player does not reach
probe() { "$ZINC" run $ex/tools/probe.ts -- "$@" sounds 2>&1; }
snd() { python3 -c "import json,sys; t=json.load(open(sys.argv[1])); print(eval(sys.argv[2]))" "$folder/table.json" "$1"; }
t=assets/tables/$table
has() { echo "$out" | grep -q " sound $1: $2 gain " || { echo "pinball3d_sound: $3: no sound '$2' for '$1': $(echo "$out" | grep ' sound ' | tail -4 | tr '\n' ';')"; fail=1; }; }
out=$(probe $t 36 70 1.37 0 -330 0 4)
has "ramp enter" "$(snd "t['ramps'][0]['sounds']['enter']")" "a shot up the ramp"
has "ramp exit" "$(snd "t['ramps'][0]['sounds']['exit']")" "a shot up the ramp"
has "rail enter" "$(snd "t['ramps'][1]['sounds']['enter']")" "a shot up the ramp"
has "rail exit" "$(snd "t['ramps'][1]['sounds']['exit']")" "a shot up the ramp"
has "ball land" "$(snd "t['physics']['ball']['sounds']['land']")" "the ball that falls off the rail"
has "ball knock" "$(snd "t['physics']['ball']['sounds']['knock']")" "the ball in the ramp"
has "inlaneLeft roll" "$(snd "t['rollovers'][3]['sounds']['roll']")" "the left inlane"
has "rule" "$(snd "[a['target'] for w in t['rules']['when'] if w['event'] == 'drain' for a in w['do'] if a['do'] == 'sound'][0]")" "the drain"
echo "$out" | grep -q "^0.000 rolling 330" || { echo "pinball3d_sound: the probe does not say how fast the ball rolls: $(echo "$out" | grep rolling | head -2 | tr '\n' ';')"; fail=1; }
out=$(probe $t 40.5 30 1.37 0 -90 0 3)
has "dock capture" "$(snd "t['kickers'][0]['sounds']['capture']")" "the dock"
has "dock eject" "$(snd "t['kickers'][0]['sounds']['eject']")" "the dock"
out=$(probe $t 43.85 52 1.37 0 -260 0 2)
has "spinner spin" "$(snd "t['spinners'][0]['sounds']['spin']")" "a shot through the spinner"
out=$(probe $t 40.5 55 1.37 200 0 0 1)
has "stand1 hit" "$(snd "t['targets'][3]['sounds']['hit']")" "a shot at the standup"
out=$(probe $t 23 50 1.37 0 0 0 4 bump@0.2)
has "rule" "$(snd "[a['target'] for w in t['rules']['when'] if w['event'] == 'tilt' for a in w['do'] if a['do'] == 'sound'][0]")" "the tilt"
cp -R "$folder" "$tmp/multi"   # the whole folder: the table names its images, models and sounds
python3 - "$folder/table.json" "$tmp/multi/table.json" <<'PY'
import json, sys
t = json.load(open(sys.argv[1]))
t['rules']['multiball']['locks'] = 1
json.dump(t, open(sys.argv[2], 'w'))
PY
out=$(probe "$tmp/multi" 40.5 30 1.37 0 -90 0 4)
has "rule" "$(snd "[a['target'] for w in t['rules']['when'] if w['event'] == 'multiballStart' for a in w['do'] if a['do'] == 'sound'][0]")" "multiball"
has "plunger release" "$(snd "t['plunger']['sounds']['release']")" "the balls of multiball"
exit $fail
