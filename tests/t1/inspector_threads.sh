#!/bin/sh
# The threads of a program in the Zinc Inspector: tests/data/inspector_threads (zinc:devtools, a worker that gets a job every 100 ms). The
# Threads view lists the worker with its state, queues, messages, live blocks and CPU time; a Performance recording has a track per thread,
# named, the worker's with its onmessage spans and the flows of its messages. ZINC_TRACE writes the same tracks and flows to a file.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'kill $target 2>/dev/null; rm -rf "$tmp"' EXIT
fail=0
THREADS_QUIT=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=0 ZINC_TRACE="$tmp/trace.json" timeout 60 "$ZINC" run tests/data/inspector_threads >/dev/null 2>"$tmp/run.err" ||
  { echo "the program failed: $(tail -5 "$tmp/run.err")"; fail=1; }
python3 - "$tmp/trace.json" <<'PY' || { echo "ZINC_TRACE has no worker track with its flows"; fail=1; }
import json, sys
t = json.load(open(sys.argv[1]))
names = {e["tid"]: e["args"]["name"] for e in t if e.get("name") == "thread_name"}
assert names.get(101) == "zinc worker work.ts#1", names
assert sum(1 for e in t if e["ph"] == "X" and e["tid"] == 101 and e["name"] == "onmessage") >= 5
ids = {}
for e in t:
    if e["ph"] in "stf": ids.setdefault(e["id"], []).append((e["ph"], e["tid"]))
assert sum(1 for v in ids.values() if v == [("s", 1), ("t", 101), ("f", 101)]) >= 5, ids
assert sum(1 for v in ids.values() if v == [("s", 101), ("t", 1), ("f", 1)]) >= 5, ids
PY
port=$(python3 tests/free_ports.py 1)
ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 ZINC_DEVTOOLS_PORT=$port timeout 90 "$ZINC" run tests/data/inspector_threads > "$tmp/target.log" 2>&1 & target=$!
n=0; while [ $n -lt $((400 * ${ZN_WAIT_SCALE:-1})) ] && ! grep -q "zinc devtools:" "$tmp/target.log"; do sleep 0.05; n=$((n+1)); done
grep -q "localhost:$port)" "$tmp/target.log" || { echo "the target does not listen on $port: $(cat "$tmp/target.log")"; exit 1; }
ZINC_INSPECTOR_DUMP=threads ZINC_REALTIME=1 ZINC_HEADLESS=1 ZINC_FRAMES=100000000 timeout 60 "$ZINC" run app/inspector/main.tsx -- "$port" > "$tmp/dump" 2>&1 ||
  { echo "the inspector failed: $(head -c 600 "$tmp/dump")"; exit 1; }
want() { grep -qE -- "$1" "$tmp/dump" || { echo "missing in the inspector's views: $1"; fail=1; }; }
want "^  zinc worker work.ts#1: running, queued [0-9]+ in / [0-9]+ out, messages [1-9][0-9]* in / [1-9][0-9]* out, [1-9][0-9]* live blocks, CPU [0-9]+ ms$"
want "^  main: [1-9][0-9]* frames, handlers true, posts true, flows out true, flows in true$"
want "^  zinc worker work.ts#1: worker, handlers true, posts true, flows out true, flows in true$"
[ $fail -eq 0 ] || cat "$tmp/dump"
exit $fail
