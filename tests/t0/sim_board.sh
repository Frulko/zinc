#!/bin/sh
# board.json (ZN-294): ten diagrams load, validate and round-trip; an unknown part type and a dangling connection are named (tests/native/board_test.cpp); a strict diagram.json reader that
# knows only version, author, editor, parts and connections reads a board with the zinc block exactly as it reads the same board without it.
cd "$(dirname "$0")/../.." || exit 2
[ -x build/board_test ] || { echo "build/board_test is not built (cmake --build build --target board_test)"; exit 1; }
build/board_test | tail -1 | grep -q "^board: ok" || { build/board_test; exit 1; }
python3 - <<'PY' || exit 1
import json, glob
def strict(doc):   # what Wokwi reads of diagram.json
    parts = [(p["id"], p["type"], p.get("left"), p.get("top"), p.get("rotate"), json.dumps(p.get("attrs", {}), sort_keys=True)) for p in doc["parts"]]
    conns = [tuple(c[:3]) + (json.dumps(c[3] if len(c) > 3 else []),) for c in doc["connections"]]
    return doc.get("version"), parts, conns
n = 0
for f in sorted(glob.glob("tests/golden/sim/diagrams/*.json")):
    doc = json.load(open(f))
    without = {k: v for k, v in doc.items() if k != "zinc"}
    assert strict(doc) == strict(without), f
    for p in doc["parts"]: assert "zinc" not in p, f
    n += doc.get("zinc") is not None
assert n >= 3, "diagrams with a zinc block"
print("strict reader: ok")
PY
