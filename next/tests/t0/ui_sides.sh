#!/bin/sh
# Side records (ZN-251): a node with no extended style property allocates no side record, one with such a class gets exactly the record it needs, and the old field names still read (tests/golden/ui-sides).
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" mem tests/golden/ui-sides/main.tsx --json 2>/tmp/ui_sides.$$) || { cat /tmp/ui_sides.$$; rm -f /tmp/ui_sides.$$; exit 1; }
python3 - "$out" <<'PY' || { cat /tmp/ui_sides.$$; rm -f /tmp/ui_sides.$$; exit 1; }
import json, sys
d = json.loads(sys.argv[1])
n = {c["name"]: c["allocs"] for c in d["classes"]}
want = {"RingX": 3, "BorderX": 3, "SnapX": 2, "InterX": 3}   # the shared default of each, plus the nodes that set a field (20 plain nodes cost none)
bad = {k: (n.get(k, 0), v) for k, v in want.items() if n.get(k, 0) != v}
if bad: print("side records (got, wanted):", bad); sys.exit(1)
PY
grep -q "read through the old names: ringW 1 borderStyle 2 hoverBg" /tmp/ui_sides.$$ && grep -q "ringW after a reclass 0" /tmp/ui_sides.$$ || { cat /tmp/ui_sides.$$; rm -f /tmp/ui_sides.$$; echo "ui_sides: old names or reset differ"; exit 1; }
rm -f /tmp/ui_sides.$$
echo "ui_sides: ok"
