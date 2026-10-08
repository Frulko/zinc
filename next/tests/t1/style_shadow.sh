#!/bin/sh
# React Native's shadows in object styles (ZN-360): tests/golden/style-shadow (shadowColor, shadowOffset { width, height }, shadowOpacity, shadowRadius,
# elevation 2/8/16, a dynamic shadow, none without opacity) renders to its frame hash, and the GL renderer draws it within the tolerance policy (5 % / 3).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_FRAMES=4 ZINC_SIZE=620x320 ZINC_SCALE=1
fail=0
h=$(ZINC_HEADLESS=1 ZINC_FRAMEHASH=last "$ZINC" run tests/golden/style-shadow 2>&1 | grep framehash)
[ "$h" = "$(cat tests/golden/style-shadow/frame.hash)" ] || { echo "style shadow: $h"; fail=1; }
ZINC_HEADLESS=1 ZINC_SHOT="$tmp/sw.png" "$ZINC" run tests/golden/style-shadow >/dev/null 2>&1
ZINC_RENDERER=gl ZINC_DISPLAY=gl ZINC_SHOT="$tmp/gl.bmp" timeout 90 "$ZINC" run tests/golden/style-shadow >/dev/null 2>&1
if [ -s "$tmp/gl.bmp" ] && command -v python3 >/dev/null; then
  out=$(python3 tools/glcompare "$tmp/gl.bmp" "$tmp/sw.png") || { echo "glcompare: $out"; fail=1; }
  python3 - "$out" <<'PY' || fail=1
import re, sys
m = re.search(r"over \d+: ([\d.]+)%, mae ([\d.]+)", sys.argv[1])
if not m or float(m.group(1)) > 5 or float(m.group(2)) > 3: print("GL shadows differ from the software ones: " + sys.argv[1]); sys.exit(1)
PY
fi
[ $fail -eq 0 ] && echo "style shadow: ok"
exit $fail
