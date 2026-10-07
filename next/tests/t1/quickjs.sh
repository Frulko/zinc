#!/bin/sh
# QuickJS engine (ZN-051): the programs of the golden corpus that need no typed features print the frozen output on QuickJS-ng (types stripped),
# and a zinc:gfx program draws the pixels of its golden through the host calls generated from the runtime table.
# Not run on QuickJS: arena_frame (an engine feature), inspect_cycles (`<ref *1>` markers), u64_literals (JavaScript numbers are doubles), and the M3 programs that rely on i32 / f32 arithmetic, Dyn corners or the typed clock (tour, features, dyn, dyn_unknown, clock).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for f in tests/golden/run/*.ts; do
  b=$(basename "$f" .ts)
  [ -f "tests/golden/run/$b.out" ] || continue
  case "$b" in inspect_cycles|u64_literals|arena_frame) continue ;; esac  # no <ref> markers; JavaScript numbers are doubles, so 64-bit integer literals differ
  "$ZINC" run "$f" --engine quickjs 2>/dev/null | cmp -s - "tests/golden/run/$b.out" || { echo "$b differs on quickjs"; fail=1; }
done
for b in array_search async conversions dyn_literals errors generic_static literal_errors literal_member_arrays pinball_physics regressions regressions2 shapes string_number_edges; do
  "$ZINC" run "../tests/conformance/$b.ts" --engine quickjs 2>/dev/null | cmp -s - "../tests/conformance/$b.out" || { echo "conformance $b differs on quickjs"; fail=1; }
done
ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/shapes.png" ZINC_SHOT_FRAMES=30 "$ZINC" run ../tests/visual/shapes.ts --engine quickjs >/dev/null 2>"$tmp/err" \
  || { echo "shapes.ts failed on quickjs: $(head -c 300 "$tmp/err")"; fail=1; }
tools/pngdiff "$tmp/shapes-30.png" ../tests/visual/shapes-30.png >/dev/null || { echo "shapes frame 30 on quickjs differs from the golden"; fail=1; }
exit $fail
