#!/bin/sh
# M5 demo (ZN-045): tests/visual/ui.tsx built by `zinc build` draws frames 1 and 40 identical to the pixel goldens (the build takes about 40 s).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" build ../tests/visual/ui.tsx -o "$tmp/ui" 2>"$tmp/err" || { echo "aot build of ui.tsx failed: $(head -c 300 "$tmp/err")"; exit 1; }
for n in 1 40; do
  ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=$n ZINC_SHOT="$tmp/u.png" ZINC_SHOT_FRAMES=$n "$tmp/ui" >/dev/null 2>&1
  tools/pngdiff "$tmp/u-$n.png" ../tests/visual/ui-$n.png >/dev/null || { echo "aot ui frame $n differs from tests/visual/ui-$n.png"; fail=1; }
done
exit $fail
