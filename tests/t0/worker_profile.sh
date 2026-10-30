#!/bin/sh
# zinc profile of a program with a worker: a profile and a table per thread (the main one and the worker, named), and a Chrome trace with a named
# track per thread, the sampled calls on each, and the worker's messages as flows (post on one track, receive and handler on the other).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
ZN_NO_OPT=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" profile tests/data/worker_profile/main.ts --speedscope "$tmp/p.json" --trace "$tmp/t.json" --folded "$tmp/f.txt" >"$tmp/table" 2>"$tmp/err" ||
  { echo "zinc profile failed: $(cat "$tmp/err")"; exit 1; }
grep -q "@mainWork" "$tmp/table" || { echo "the main thread's table does not name mainWork"; fail=1; }
grep -q "^zinc profile: thread zinc worker work.ts#1: " "$tmp/table" && grep -q "@crunch" "$tmp/table" || { echo "no table for the worker's thread: $(cat "$tmp/table")"; fail=1; }
grep -q "^zinc worker work.ts#1;.*crunch " "$tmp/f.txt" || { echo "the folded stacks do not have the worker's under its name"; fail=1; }
python3 - "$tmp/p.json" "$tmp/t.json" <<'PY' || fail=1
import json, sys
s = json.load(open(sys.argv[1]))
names = [p["name"] for p in s["profiles"]]
assert names == ["interpreter", "zinc worker work.ts#1"], names
frames = [f["name"] for f in s["shared"]["frames"]]
for p in s["profiles"]:
    assert len(p["samples"]) == len(p["weights"]) > 0, p["name"]
    assert all(0 <= i < len(frames) for st in p["samples"] for i in st)
assert any(frames[st[-1]] == "crunch" for st in s["profiles"][1]["samples"]), "the worker's profile has no crunch"
assert any(frames[st[-1]] == "mainWork" for st in s["profiles"][0]["samples"]), "the main profile has no mainWork"
t = json.load(open(sys.argv[2]))
tracks = {e["tid"]: e["args"]["name"] for e in t if e.get("name") == "thread_name"}
assert tracks.get(1) == "main" and tracks.get(101) == "zinc worker work.ts#1", tracks
slices = lambda tid, name: [e for e in t if e["ph"] == "X" and e["tid"] == tid and e["name"] == name]
assert slices(1, "mainWork") and slices(101, "crunch"), "the sampled calls are not on their thread's track"
assert len(slices(101, "onmessage")) == 4 and len(slices(1, "onmessage work.ts#1")) == 4, "the handlers' spans are missing"
flows = {}
for e in t:
    if e["ph"] in "stf": flows.setdefault(e["id"], []).append((e["ph"], e["tid"], e["ts"]))
to_worker = [f for f in flows.values() if [p for p, _, _ in f] == ["s", "t", "f"] and f[0][1] == 1 and f[1][1] == 101 and f[2][1] == 101]
to_main = [f for f in flows.values() if [p for p, _, _ in f] == ["s", "t", "f"] and f[0][1] == 101 and f[1][1] == 1 and f[2][1] == 1]
assert len(to_worker) == 4 and len(to_main) == 4, flows
assert all(f[0][2] <= f[1][2] <= f[2][2] for f in to_worker + to_main), "a flow goes back in time"
PY
exit $fail
