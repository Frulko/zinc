#!/bin/sh
# zinc:ink's matcher and grouper (ZN-932): the held-out writers of tools/ink-train/data/ink-set.json, letters >= 95 %, shapes >= 98 %,
# under 5 ms per group, the native C++ matcher and the TypeScript reference agreeing to 1e-9, the same lines on the interpreter, the AOT
# and QuickJS (tests/data/ink-recog/main.ts).
cd "$(dirname "$0")/../.." || exit 2
export INK_SET="$PWD/tools/ink-train/data/ink-set.json"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for e in --interp --native "--engine quickjs"; do
  n=$(echo "$e" | tr -d ' -')
  ZINC_HEADLESS=1 ZINC_BACKGROUND=1 timeout 300 "$ZINC" run tests/data/ink-recog $e >"$tmp/$n.out" 2>"$tmp/$n.err" || { echo "$e: failed"; tail -5 "$tmp/$n.err"; fail=1; continue; }
  grep -v '^timing' "$tmp/$n.out" >"$tmp/$n.cmp"
  grep -q '^grouper true true true true$' "$tmp/$n.out" || { echo "$e: the grouper"; fail=1; }
  awk '/^letters/ { split($2, a, "/"); if ($3 < 95) bad = 1 } /^shapes/ { if ($3 < 98) bad = 1 } /^agree/ { split($2, a, "/"); if (a[1] != a[2]) bad = 1 } /^timing/ { if ($2 != "ok") bad = 1 } END { exit bad }' "$tmp/$n.out" \
    || { echo "$e: below the bar:"; cat "$tmp/$n.out"; fail=1; }
  echo "$e: $(grep -E '^(letters|shapes|timing)' "$tmp/$n.out" | tr '\n' ' ')"
done
[ -f "$tmp/interp.cmp" ] && for n in native enginequickjs; do [ -f "$tmp/$n.cmp" ] && { cmp -s "$tmp/interp.cmp" "$tmp/$n.cmp" || { echo "$n differs from the interpreter"; fail=1; }; }; done
exit $fail
