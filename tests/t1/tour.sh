#!/bin/sh
# zinc tour (ZN-774.05), headless, in a new $ZINC_HOME:
# - zinc tour --auto --until 3 makes the project, runs it and changes its line; zinc tour --auto goes on from step 4: the mistake is Z0101,
#   zinc explain explains it, the fix checks clean, zinc dev refreshes a save, a second project is made; tour.json has the eight steps;
# - at a terminal (a pty) it waits for the save, sees it, and q stops between two steps; without a terminal or under CI it never waits;
# - --list, a step out of range, a project that moved, --reset, and the text in French.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
tmp=$(cd "$tmp" && pwd -P)
fail=0
export ZINC_HOME="$tmp/home"
unset CI
cd "$tmp" || exit 2
done_steps() { python3 -c 'import json, sys; print(",".join(map(str, json.load(open(sys.argv[1]))["done"])))' "$ZINC_HOME/tour.json" 2>/dev/null; }

timeout 60 "$Z" tour --auto --until 3 --dir walk </dev/null > a.out 2>&1; rc=$?
[ $rc -eq 0 ] && [ "$(done_steps)" = "1,2,3" ] && [ -f walk/zinc.json ] && grep -q 'hello from the tour' walk/src/main.ts \
  || { echo "zinc tour --auto --until 3: exit $rc, done $(done_steps): $(tail -5 a.out)"; fail=1; }
timeout 60 "$Z" tour --auto </dev/null > b.out 2>&1; rc=$?
[ $rc -eq 0 ] && [ "$(done_steps)" = "1,2,3,4,5,6,7,8" ] || { echo "zinc tour --auto from step 4: exit $rc, done $(done_steps): $(tail -8 b.out)"; fail=1; }
head -3 b.out | grep -q '^Step 4 of 8' && ! grep -q '^Step [123] of 8' b.out || { echo "zinc tour --auto did not go on from step 4: $(head -3 b.out)"; fail=1; }
grep -q '^  src/main.ts:1:[0-9]*: error Z0101: ' b.out && grep -q '^Z0101: Cannot find name' b.out && grep -q 'Fixed: zinc check finds no error again' b.out \
  || { echo "the mistake step does not show Z0101, its explanation and the fix: $(sed -n '/Step 4/,/Step 5/p' b.out | head -12)"; fail=1; }
(cd walk && "$Z" check >/dev/null 2>&1) && grep -q 'isDown, Btn' walk/src/main.ts || { echo "the mistake was not undone"; fail=1; }
# the save comes 1 s after zinc dev starts: swapped in (v1 refreshed); a machine so loaded that the program was not running yet starts it again
grep -Eq 'zinc dev changed the program while it ran: (v1 refreshed src/main.ts|v2 started)' b.out || { echo "no Fast Refresh at step 5: $(sed -n '/Step 5/,/Step 6/p' b.out)"; fail=1; }
[ -f walk-cli/zinc.json ] && grep -q 'start/choose/' b.out && grep -q 'docs/learn/' b.out || { echo "steps 6 and 7: $(sed -n '/Step 6/,/Step 8/p' b.out)"; fail=1; }
pgrep -f "$Z (run|dev)" >/dev/null && { echo "zinc dev or its program is still running"; pkill -f "$Z (run|dev)"; fail=1; }

# at a terminal: tour.py <keys...> -- argv; each key waits for its text (before '=>'), then types the rest, or runs it in a shell after '!'
cat > tour.py <<'PY'
import os, pty, select, subprocess, sys, time
sep = sys.argv.index("--")
keys, argv = sys.argv[1:sep], sys.argv[sep + 1:]
pid, fd = pty.fork()
if pid == 0:
    os.execv(argv[0], argv)
out = b""
def pump(until, limit):
    global out
    end = time.time() + limit
    while time.time() < end and (until is None or until not in out):
        if select.select([fd], [], [], 0.1)[0]:
            try: chunk = os.read(fd, 4096)
            except OSError: return
            if not chunk: return
            out += chunk
for k in keys:
    wait, act = k.split("=>", 1)
    pump(wait.encode(), 20)
    if act.startswith("!"): subprocess.run(act[1:], shell=True)
    else: os.write(fd, act.encode().decode("unicode_escape").encode("latin-1"))
pump(None, 20 if keys else 5)
_, status = os.waitpid(pid, 0)
sys.stdout.write(out.decode("utf-8", "replace"))
sys.exit(os.waitstatus_to_exitcode(status))
PY
timeout 60 python3 tour.py "waits for your save=>!sed -i.bak 's/isDown, Btn/isDwon, Btn/' walk/src/main.ts" "to go on=>\r" \
  "Now fix it=>!sed -i.bak 's/isDwon, Btn/isDown, Btn/' walk/src/main.ts" "for step 5=>q\r" -- "$Z" tour 4 > pty.out 2>&1; rc=$?
[ $rc -eq 0 ] && grep -q 'error Z0101' pty.out && grep -q 'Step 4 done' pty.out && grep -q 'Stopped at step 5' pty.out && ! grep -q 'Step 5 of 8' pty.out \
  || { echo "zinc tour 4 at a terminal: exit $rc, $(tail -6 pty.out)"; fail=1; }
# step 1 at a terminal: the zinc new question (the game already chosen) asks the folder's name
mkdir fresh
ZINC_HOME="$tmp/home2" timeout 60 python3 tour.py "Name of the new folder=>my-walk\r" "for step 2=>q\r" -- /bin/sh -c "cd fresh && exec '$Z' tour" > fresh.out 2>&1; rc=$?
[ $rc -eq 0 ] && [ -f fresh/my-walk/zinc.json ] && grep -q "\"project\": \"$tmp/fresh/my-walk\"" "$tmp/home2/tour.json" && grep -q 'Stopped at step 2' fresh.out \
  || { echo "zinc tour's first step at a terminal: exit $rc, $(tail -6 fresh.out)"; fail=1; }
timeout 10 python3 tour.py -- /usr/bin/env CI=1 "$Z" tour > ci.out 2>&1 </dev/null; rc=$?
[ $rc -eq 0 ] && grep -q 'start it in a terminal' ci.out && grep -q '\[x\] 8. Open Zinc Atelier' ci.out || { echo "zinc tour under CI at a terminal: exit $rc, $(tail -4 ci.out)"; fail=1; }
timeout 5 "$Z" tour </dev/null > noterm.out 2>&1; rc=$?
[ $rc -eq 0 ] && grep -q '^  \[x\] 1. Make a project$' noterm.out || { echo "zinc tour without a terminal: exit $rc, $(head -4 noterm.out)"; fail=1; }

# --list, a step out of range, French, a project that moved, --reset
"$Z" tour --list | grep -q '^zinc tour: 8 of 8 steps done$' || { echo "zinc tour --list: $("$Z" tour --list | head -2)"; fail=1; }
"$Z" tour 9 >/dev/null 2>&1; [ $? -eq 2 ] || { echo "zinc tour 9 is not refused"; fail=1; }
ZINC_LANG=fr "$Z" tour --list | grep -q '^  \[x\] 1. Créer un projet$' && ZINC_LANG=fr "$Z" tour --list | grep -q '^zinc tour : 8 étapes faites sur 8$' || { echo "zinc tour --list in French: $(ZINC_LANG=fr "$Z" tour --list | head -2)"; fail=1; }
mv walk moved && "$Z" tour --list | grep -q '0 of 8 steps done' || { echo "a project that moved still counts its steps"; fail=1; }
mv moved walk && "$Z" tour --reset | grep -q "Its project stays in $tmp/walk" && [ ! -e "$ZINC_HOME/tour.json" ] && [ -f walk/zinc.json ] || { echo "zinc tour --reset"; fail=1; }
[ $fail -eq 0 ] && echo "tour: ok"
exit $fail
