#!/bin/sh
# The text-shaping tier (ZN-114): fixtures for kerning, Arabic and Hebrew bidi, Devanagari, a ZWJ emoji and CJK line breaking equal their stored images; the tier is linked by programs that ask for it (tests/t1/text_shaped.sh).
BUILD=${BUILD:-build}
[ -x "$BUILD/layout_test" ] || { echo "skipped: layout_test is not built"; exit 77; }
"$BUILD/layout_test" tests/data tests/golden/text | grep -q 'all checks passed' || { "$BUILD/layout_test" tests/data tests/golden/text; exit 1; }
