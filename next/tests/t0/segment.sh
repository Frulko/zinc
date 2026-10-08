#!/bin/sh
# Segmentation (ZN-165): the C++ checks (line breaks, grapheme cursor steps) and Intl.Segmenter in the QuickJS engine equal the stored Node/ICU output (tests/golden/segment).
BUILD=${BUILD:-build}
cd "$(dirname "$0")/../.." || exit 2
fail=0
[ -x "$BUILD/segment_test" ] && { "$BUILD/segment_test" | grep -q "segment_test ok" || { "$BUILD/segment_test"; fail=1; }; }
"$ZINC" run tests/golden/segment/segments.js --engine quickjs 2>&1 | diff -q - tests/golden/segment/segments.out >/dev/null || { echo "Intl.Segmenter output differs from tests/golden/segment/segments.out"; fail=1; }
if command -v node >/dev/null; then node tests/golden/segment/segments.js | diff -q - tests/golden/segment/segments.out >/dev/null || { echo "the stored output no longer equals Node's"; fail=1; }; fi
exit $fail
