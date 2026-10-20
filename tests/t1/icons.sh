#!/bin/sh
# zinc:icons (ZN-374): tests/golden/icons names three Lucide icons; only those three are compiled in, they draw with zinc:svg in their colours and stroke
# widths (frame hash), an unknown name gives null; tests/golden/icons-all compiles the whole set ("icons": ["*"]) and every icon parses and has shapes.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=3 ZINC_SIZE=320x120 ZINC_SCALE=1
fail=0
out=$("$ZINC" run tests/golden/icons 2>&1); [ "$out" = "$(cat tests/golden/icons/main.out)" ] || { echo "icons: $(echo "$out" | head -4)"; fail=1; }
h=$(ZINC_FRAMEHASH=last "$ZINC" run tests/golden/icons 2>&1 | grep framehash); [ "$h" = "$(cat tests/golden/icons/frame.hash)" ] || { echo "icons frame: $h"; fail=1; }
all=$("$ZINC" run tests/golden/icons-all 2>&1 | tail -1); [ "$all" = "icons 1848, parsed 1848, failed 0" ] || { echo "icons-all: $all"; fail=1; }
[ $fail -eq 0 ] && echo "icons: ok"
exit $fail
