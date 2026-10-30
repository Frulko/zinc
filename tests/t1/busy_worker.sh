#!/bin/sh
# tests/t1/busy_spinner.sh with its 2 s computation in a worker (zinc:worker, D181): the Spinner keeps presenting frames while the worker
# computes, so the profiler's present_interval p99 stays under one 60 Hz frame (16.7 ms). Headless frames are not paced: the bound is on p99,
# since a loaded machine can still stall one frame.
cd "$(dirname "$0")/../.." || exit 2   # a real clock: the worker's busy wait reads it (tests/run sets ZINC_DETERMINISTIC)
out=$(env -u ZINC_DETERMINISTIC ZINC_HEADLESS=1 ZINC_PROFILE=json ZINC_FRAMES=100000000 timeout 90 "$ZINC" run tests/data/busy_worker/main.tsx 2>&1)
echo "$out" | grep -q '^worker done, frames kept coming$' || { echo "busy_worker: the frames stopped while the worker computed"; echo "$out" | tail -5; exit 1; }
json=$(echo "$out" | sed -n 's/^zinc profile json: //p')
[ -n "$json" ] || { echo "busy_worker: no profile"; exit 1; }
p99=$(printf '%s' "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["phases"]["present_interval"]["p99"])')
[ "$p99" -lt 16700 ] || { echo "busy_worker: present_interval p99 is ${p99} us, over a 60 Hz frame"; exit 1; }
echo "busy_worker: present_interval p99 ${p99} us while a worker computed for 2000 ms" >&2
