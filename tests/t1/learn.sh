#!/bin/sh
# ZN-774.26: the lessons as exercises (zinc learn, Atelier's lesson panel).
#   format   every step of learn/lessons: its texts in the five languages, the starter fails its check, the solution passes it, both compile
#   cli      lesson 1 in a folder: the starter is not yet done (the step's message), a program that does not compile says so, the hint, the
#            solution passes and the progress moves on (in French too); the watch re-checks at each save, a wrong then a right answer
#   atelier  the same lesson in the side panel: opened from the menu's command, checked (not yet), the hint, the solution written and passed
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'kill $watcher 2>/dev/null; rm -rf "$tmp"' EXIT
watcher=
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_LANG=en
mkdir -p "$ZINC_HOME"

# ---- format
python3 - learn/lessons <<'EOF' || fail=1
import json, os, sys
bad = 0
for l in sorted(os.listdir(sys.argv[1])):
    d = os.path.join(sys.argv[1], l)
    m = json.load(open(os.path.join(d, 'lesson.json')))
    texts = [m['title']] + [s[k] for s in m['steps'] for k in ('text', 'message', 'hint')]
    for t in texts:
        if sorted(t) != ['de', 'en', 'es', 'fr', 'it'] or not all(t.values()): print(f'{l}: a text lacks a language: {t}'); bad = 1
    for i in range(1, len(m['steps']) + 1):
        for k in ('start', 'check', 'solution'):
            if not os.path.isfile(os.path.join(d, 'steps', f'{i}.{k}.ts')): print(f'{l}: no steps/{i}.{k}.ts'); bad = 1
    if not os.path.isfile(os.path.join('docs', m['lesson'] + '.md')): print(f'{l}: no page docs/{m["lesson"]}.md'); bad = 1
sys.exit(bad)
EOF
for l in learn/lessons/*/; do
  for c in "$l"steps/*.check.ts; do
    n=$(basename "$c" .check.ts)
    for k in start solution; do
      rm -rf "$tmp/p"; mkdir -p "$tmp/p/src"; cp "$l/zinc.json" "$tmp/p/"; [ -d "$l/assets" ] && cp -R "$l/assets" "$tmp/p/"
      cp "$l/steps/$n.$k.ts" "$tmp/p/src/main.ts"
      (cd "$tmp/p" && "$ZINC" check >/dev/null 2>&1) || { echo "learn: $l step $n: the $k does not compile"; fail=1; }
      "$ZINC" run --interp "$c" -- "$tmp/p/src/main.ts" >/dev/null 2>&1; rc=$?
      [ "$k" = start ] && [ $rc -eq 0 ] && { echo "learn: $l step $n: the starter passes its own check"; fail=1; }
      [ "$k" = solution ] && [ $rc -ne 0 ] && { echo "learn: $l step $n: the solution fails its check"; fail=1; }
    done
  done
done

# ---- cli
d=$tmp/l1
"$ZINC" learn 1 --dir "$d" --unpack > "$tmp/unpack" || { echo "learn: zinc learn 1 --unpack failed"; fail=1; }
grep -q '^A window and a shape, step 1 of 3:$' "$tmp/unpack" && [ -f "$d/src/main.ts" ] && [ -f "$d/.lesson" ] || { echo "learn: the lesson was not unpacked: $(cat "$tmp/unpack")"; fail=1; }
"$ZINC" learn --check --dir "$d" > "$tmp/c1"; rc=$?
[ $rc -eq 1 ] && grep -qx '✗ Not yet: No rectangle yet: the program does not call rect().' "$tmp/c1" || { echo "learn: the starter is not refused with its message ($rc): $(cat "$tmp/c1")"; fail=1; }
"$ZINC" learn --hint --dir "$d" | grep -q '^Hint: The numbers of rect are x, y' || { echo "learn: no hint"; fail=1; }
cp "$d/src/main.ts" "$tmp/start.ts"
printf 'import { onFrame, rect } from "zinc:gfx";\nrect(1, 2, 3, 4, "red");\n' > "$d/src/main.ts"
"$ZINC" learn --check --dir "$d" > "$tmp/c2"
grep -q '^✗ The program does not compile yet' "$tmp/c2" && grep -q 'error Z0103' "$tmp/c2" || { echo "learn: a program that does not compile is not said: $(cat "$tmp/c2")"; fail=1; }
"$ZINC" learn --solve --dir "$d" | sed 1d > "$d/src/main.ts"
"$ZINC" learn --check --dir "$d" > "$tmp/c3"; rc=$?
[ $rc -eq 0 ] && grep -qx '✓ Step 1 done.' "$tmp/c3" && grep -qx 'A window and a shape, step 2 of 3:' "$tmp/c3" || { echo "learn: the solution does not pass ($rc): $(cat "$tmp/c3")"; fail=1; }
grep -q '"01-window-and-shape": 1' "$ZINC_HOME/learn.json" || { echo "learn: the progress is not kept: $(cat "$ZINC_HOME/learn.json")"; fail=1; }
ZINC_LANG=fr "$ZINC" learn | grep -q 'Une fenêtre et une forme  *1/3$' || { echo "learn: the French list: $(ZINC_LANG=fr "$ZINC" learn)"; fail=1; }
ZINC_LANG=fr "$ZINC" learn --check --dir "$d" | grep -qx '✗ Pas encore : Pas encore de cercle : le programme n'"'"'appelle pas rrect().' || { echo "learn: the French message: $(ZINC_LANG=fr "$ZINC" learn --check --dir "$d")"; fail=1; }

# the watch: a save of a wrong answer, then of the right one (step 1 again, from its starter)
"$ZINC" learn 1 --dir "$d" --reset --unpack >/dev/null
cp "$tmp/start.ts" "$d/src/main.ts"
"$ZINC" learn 1 --dir "$d" < /dev/null > "$tmp/watch" 2>&1 &
watcher=$!
wait_for() { n=0; until grep -qF -- "$1" "$tmp/watch"; do n=$((n + 1)); [ $n -gt 100 ] && return 1; sleep 0.1; done; }
wait_for 'Enter checks again' || { echo "learn: the watch did not start: $(cat "$tmp/watch")"; fail=1; }
sleep 1.1   # a new modification time
printf 'import { onFrame, clear } from "zinc:gfx";\n\nonFrame((dt: number) => {\n  clear(0x000000);\n});\n' > "$d/src/main.ts"
wait_for '✗ Not yet: No rectangle yet' || { echo "learn: the watch did not check the wrong answer: $(cat "$tmp/watch")"; fail=1; }
sleep 1.1
cp learn/lessons/01-window-and-shape/steps/1.solution.ts "$d/src/main.ts"
wait_for '✓ Step 1 done.' || { echo "learn: the watch did not pass the right answer: $(cat "$tmp/watch")"; fail=1; }
kill $watcher 2>/dev/null; wait $watcher 2>/dev/null; watcher=

# ---- atelier
rm -f "$ZINC_HOME/learn.json"
mkdir -p "$tmp/book"
printf '3 lesson:01-window-and-shape\n5 lesson-check\n7 lesson-hint\n9 lesson-solve\n12 quit\n' > "$tmp/a.session"
ZINC_ATELIER_HOME="$tmp/book" ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_SYSTEM_LOG="$tmp/a.system" ZINC_ATELIER_SCRIPT="$tmp/a.session" \
  ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=12 "$ZINC" run app/atelier > "$tmp/a.out" 2> "$tmp/a.err" || { echo "learn: the Atelier session failed: $(tail -c 300 "$tmp/a.err")"; fail=1; }
for want in '[lesson] 01-window-and-shape step 1/3 not yet: No rectangle yet: the program does not call rect().' '[lesson] hint shown' '[lesson] 01-window-and-shape step 2/3 passed 1'; do
  grep -qxF -- "$want" "$tmp/a.out" || { echo "learn: Atelier did not say: $want ($(grep '^\[lesson\]' "$tmp/a.out" | tr '\n' '|'))"; fail=1; }
done
grep -q 'rect(40, 40, 160, 100' "$tmp/book/01-window-and-shape/src/main.ts" || { echo "learn: Atelier's solution is not in the file"; fail=1; }
grep -q '"01-window-and-shape": 1' "$ZINC_HOME/learn.json" || { echo "learn: Atelier did not keep the progress"; fail=1; }
exit $fail
