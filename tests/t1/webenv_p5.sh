#!/bin/sh
# p5.js on the web environment (ZN-568; ZN-566 for the stack): the unmodified p5.min.js 1.11.13 and a sketch in global mode, loaded as the two
# script elements of a page, boot to their frames with no shim of the test's own: setup makes a WEBGL canvas (WebGL 2), draw runs on
# requestAnimationFrame, and the pixels read inside the box and in the corner are the sketch's colours at frames 1 and 5. p5 keeps the
# native Promise (PromiseRejectionEvent exists) and nothing is thrown. Its 2D mode is tests/t1/webenv_canvas2d_libs.sh (ZN-570).
# p5.js is LGPL-2.1, so the repository does not carry it (RULES.md 3): tools/test-lib takes the pinned file from p5's npm release into a cache
# outside the repository, once, and checks its sha256. Neither cached nor downloadable: the test is skipped.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
p5=$(tools/test-lib p5-1.11.13 2>"$tmp/fetch") || { echo "skipped: $(head -c 300 "$tmp/fetch")"; exit 77; }
env ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_FRAMES=8 WEBENV_P5="$p5" "$ZINC" run tests/golden/webenv/p5/page.js --engine quickjs > "$tmp/out" 2> "$tmp/err" \
  || { echo "webenv_p5: the page failed: $(head -c 300 "$tmp/err")"; fail=1; }
diff "$tmp/out" tests/golden/webenv/p5/page.out > "$tmp/diff" || { echo "webenv_p5: the page differs from tests/golden/webenv/p5/page.out:"; head -20 "$tmp/diff"; fail=1; }
grep -q "Uncaught" "$tmp/err" && { echo "webenv_p5: p5 threw: $(grep -m1 -A3 Uncaught "$tmp/err" | cut -c1-200)"; fail=1; }
exit $fail
