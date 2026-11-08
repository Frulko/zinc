#!/bin/sh
# Windows that open where asked and close cleanly (ZN-1032), on the interpreter, AOT and QuickJS: open({x, y}); a zinc:ui window closed and
# reopened on one root leaves no Surface behind; onClosed runs once per window; closing the main window with onClosed(quit) ends the program
# while other windows are open; the scene window keeps the pixels of its one drawScene (frame 6 against a golden).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
for r in interp native quickjs; do
  e=""; [ $r = quickjs ] && e="--engine quickjs"
  env ZINC_RUN=$r ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=60 ZINC_SHOT="$tmp/$r.png" ZINC_SHOT_FRAMES=6 \
    timeout 60 "$ZINC" run tests/data/multiwin_close $e 2>/dev/null | grep -v '^zinc: plugins' >"$tmp/$r.log"
  printf '%s\n' "scene at 300,50 120x80" "mounted 1" "tools 3 closed" "after close: mounted 0" "reopened: mounted 1" "tools 4 closed" \
    "after the second close: mounted 0, windows 3" "main closed: quit" | diff -u - "$tmp/$r.log" || { echo "$r: output differs"; fail=1; }
  tools/pngdiff "$tmp/$r-6-w1.png" tests/golden/multiwin/close-scene.png >"$tmp/d" 2>&1 || { echo "$r: scene window: $(head -1 "$tmp/d")"; fail=1; }
done
exit $fail
