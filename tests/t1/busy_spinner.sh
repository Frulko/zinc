#!/bin/sh
# The baseline of the threads work (docs/reports/threads-ui-compute-animation.md, step 0): a kit Spinner turns while the program's own thread
# busy-waits 2 s at frame 30. The profiler's present_interval (ZINC_PROFILE=json) records the gap the user sees: today one interval of about
# 2000 ms with no frame. When a compositor keeps presenting while the script works (step 6), this test's bound flips to p99 <= 17.5 ms.
cd "$(dirname "$0")/../.." || exit 2   # a real clock: the busy wait reads it (tests/run sets ZINC_DETERMINISTIC)
out=$(env -u ZINC_DETERMINISTIC ZINC_HEADLESS=1 ZINC_PROFILE=json ZINC_FRAMES=60 timeout 90 "$ZINC" run tests/data/busy_spinner/main.tsx 2>&1)
echo "$out" | grep -q '^busy done$' || { echo "busy_spinner: the program did not finish its busy wait"; echo "$out" | tail -5; exit 1; }
json=$(echo "$out" | sed -n 's/^zinc profile json: //p')
[ -n "$json" ] || { echo "busy_spinner: no profile"; exit 1; }
gap=$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["phases"]["present_interval"]["max"])')
[ "$gap" -ge 1900000 ] || { echo "busy_spinner: the longest present interval is ${gap} us; the busy script should leave a ~2 s gap"; exit 1; }
echo "busy_spinner: present_interval max ${gap} us (the script busy for 2000 ms, nothing presented meanwhile)" >&2
