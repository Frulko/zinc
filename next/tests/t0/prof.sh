#!/bin/sh
# Profiling tools (ZN-046): zinc profile (flame graph and table), zinc mem (counts, leak check), the frame-phase profile of a UI app and
# its Perfetto trace, and the resource sampler tools/resmon.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
# zinc profile: without inlining the call structure is kept, so the table names the functions and the folded stacks nest them
ZN_NO_OPT=1 "$ZINC" profile ../tests/bench/kernels/spectralnorm.ts --speedscope "$tmp/p.json" --folded "$tmp/p.folded" >"$tmp/table" 2>/dev/null || { echo "zinc profile failed"; fail=1; }
grep -q "@A" "$tmp/table" || { echo "the profile table does not name the hot function"; fail=1; }
grep -q "main;timesAtA" "$tmp/p.folded" || { echo "the folded stacks do not nest the calls"; fail=1; }
python3 - "$tmp/p.json" <<'PY' || { echo "the speedscope file is not valid"; fail=1; }
import json, sys
d = json.load(open(sys.argv[1]))
p = d["profiles"][0]
assert d["$schema"].endswith("file-format-schema.json") and p["type"] == "sampled" and len(p["samples"]) == len(p["weights"]) > 0
assert all(0 <= i < len(d["shared"]["frames"]) for s in p["samples"] for i in s)
PY
# zinc mem: counts per class, retain/release traffic, a leak check that fails (exit 4) on a program that leaves objects alive
"$ZINC" mem tests/golden/run/library.ts --json >"$tmp/mem.json" 2>/dev/null || { echo "zinc mem failed"; fail=1; }
python3 - "$tmp/mem.json" <<'PY' || { echo "the mem report is not valid"; fail=1; }
import json, sys
d = json.load(open(sys.argv[1]))
assert d["allocs"] == d["frees"] > 0 and d["retains"] > 0 and d["leaked"] == 0 and d["peakLiveObjects"] > 0 and d["processPeakRssMb"] > 0
assert any(c["name"] == "str" for c in d["classes"])
PY
"$ZINC" mem ../tests/conformance/features.ts --check-leaks >/dev/null 2>&1; [ $? -eq 4 ] || { echo "zinc mem --check-leaks did not report the known cycle of features.ts"; fail=1; }
# frame phases of a UI app (p50/p99) and a trace Perfetto opens
ZINC_DETERMINISTIC=1 ZINC_FRAMES=10 ZINC_PROFILE=1 ZINC_TRACE="$tmp/trace.json" "$ZINC" run ../tests/visual/ui.tsx 2>"$tmp/frames" >/dev/null
grep -q "zinc profile: frames=10 work p50=" "$tmp/frames" && grep -q "layout p50=" "$tmp/frames" || { echo "no frame-phase summary"; fail=1; }
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert any(e.get('ph')=='X' for e in d)" "$tmp/trace.json" || { echo "the frame trace is not valid"; fail=1; }
# resmon
tools/resmon --no-samples -- "$ZINC" run ../tests/bench/kernels/fib.ts >"$tmp/res.json" 2>/dev/null || { echo "resmon failed"; fail=1; }
python3 -c "import json,sys; d=json.load(open(sys.argv[1])); assert d['peak_rss_mb']>1 and d['wall_s']>0 and d['user_s']>=0" "$tmp/res.json" || { echo "resmon output is not valid"; fail=1; }
exit $fail
