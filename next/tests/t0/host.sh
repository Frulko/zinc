#!/bin/sh
# Graphics host (ZN-027): tests/visual/clock.ts, run headless with the deterministic clock, draws frame 20 identical to the frozen pixel golden.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=20 ZINC_SHOT="$tmp/clock.png" ZINC_SHOT_FRAMES=20 "$ZINC" run ../tests/visual/clock.ts >/dev/null 2>"$tmp/err" \
  || { echo "clock.ts failed: $(head -c 300 "$tmp/err")"; exit 1; }
tools/pngdiff "$tmp/clock-20.png" corpus/ui/clock-20.png >/dev/null || { echo "frame 20 differs from corpus/ui/clock-20.png"; exit 1; }
# Host modules (ZN-049): zinc:fs and zinc:storage over the host calls, in a scratch directory.
(cd "$tmp" && ZINC_STORAGE="$tmp/store.kv" "$ZINC" run "$OLDPWD/tests/golden/host/modules.ts") >"$tmp/mod.out" 2>&1
diff -q "$tmp/mod.out" tests/golden/host/modules.out >/dev/null || { echo "host modules output differs: $(head -c 200 "$tmp/mod.out")"; exit 1; }
