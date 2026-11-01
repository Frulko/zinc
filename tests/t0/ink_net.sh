#!/bin/sh
# zinc:ink's int8 letter net (ZN-936): the C kernels reproduce the Python reference (tools/ink-train/inknet.py) on 50 held-out marks within 1 LSB,
# the recogniser with the net beats the template matcher (stage A) on the held-out letters by >= 2 points, one group takes <= 5 ms natively, and
# the same lines come out of the interpreter, the AOT and QuickJS (tests/data/ink-net/main.ts).
cd "$(dirname "$0")/../.." || exit 2
export INK_SET="$PWD/tools/ink-train/data/ink-set.json"
export INK_ZNM="$PWD/tools/ink-train/data/ink-net.znm"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export INK_TMP="$tmp" INK_GOLDEN="$tmp/golden.json"
export INK_STRESS="$tmp/stress.json"
python3 tools/ink-train/inknet.py golden "$INK_ZNM" "$INK_SET" 50 >"$INK_GOLDEN" || { echo "inknet.py golden failed"; exit 1; }
python3 tools/ink-train/inknet.py stress "$INK_SET" 2 >"$INK_STRESS" || { echo "inknet.py stress failed"; exit 1; }
fail=0
for e in --interp --native "--engine quickjs"; do
  n=$(echo "$e" | tr -d ' -')
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 300 "$ZINC" run tests/data/ink-net $e >"$tmp/$n.out" 2>"$tmp/$n.err" || { echo "$e: failed"; tail -5 "$tmp/$n.err"; fail=1; continue; }
  grep -v '^timing' "$tmp/$n.out" >"$tmp/$n.cmp"
  # stress letters N stageA a pctA net b pctNet both c pctBoth: the net and the recogniser beat stage A by 2 points on the bent marks
  awk '/^logits/ { if ($5 != "ok") bad = 1 } /^stress letters/ { if ($12 - $6 < 2 || $9 - $6 < 2) bad = 1 } /^plain letters/ { if ($12 < $6 - 0.5) bad = 1 } /^timing/ { if ($2 != "ok") bad = 1 } /^(async|labels)/ { if ($NF != "true") bad = 1 } END { exit bad }' "$tmp/$n.out" \
    || { echo "$e: below the bar:"; cat "$tmp/$n.out"; fail=1; }
  echo "$e: $(grep -E '^(logits|plain letters|stress letters|timing)' "$tmp/$n.out" | tr '\n' ' ')"
done
[ -f "$tmp/interp.cmp" ] && for n in native enginequickjs; do [ -f "$tmp/$n.cmp" ] && { cmp -s "$tmp/interp.cmp" "$tmp/$n.cmp" || { echo "$n differs from the interpreter"; fail=1; }; }; done
exit $fail
