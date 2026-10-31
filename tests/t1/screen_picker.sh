#!/bin/sh
# The share dialog of zinc:screen-capture/picker (ZN-911) over eight fake windows: the list scrolled with the wheel keeps its place while the
# thumbnails refresh, the search field filters by name, Share sends the source left (tests/golden/screen-picker).
cd "$(dirname "$0")/../.." || exit 2
[ "$(uname)" = Darwin ] || { echo "skipped: ScreenCaptureKit is macOS only"; exit 77; }
d=tests/golden/screen-picker
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FAKE_WINDOWS=8 ZINC_SCALE=1 ZINC_SIZE=900x700 ZINC_FRAMES=330 timeout 120 "$ZINC" run --interp $d 2>/dev/null)
[ "$out" = "$(cat $d/main.out)" ] || { echo "screen picker: $(echo "$out" | diff - $d/main.out | head -8)"; exit 1; }
echo "screen picker: ok"
