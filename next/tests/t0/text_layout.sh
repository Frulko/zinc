#!/bin/sh
# The text-shaping tier (ZN-114): fixtures for kerning, Arabic and Hebrew bidi, Devanagari, a ZWJ emoji and CJK line breaking equal their stored images; the zinc binary itself does not link the tier.
BUILD=${BUILD:-build}
[ -x "$BUILD/layout_test" ] || { echo "skipped: layout_test is not built"; exit 77; }
"$BUILD/layout_test" tests/data tests/golden/text | grep -q 'all checks passed' || { "$BUILD/layout_test" tests/data tests/golden/text; exit 1; }
if nm "$BUILD/zinc" 2>/dev/null | grep -q 'hb_shape\|SBAlgorithmCreate'; then echo "zinc links the shaping tier although no program asked for it"; exit 1; fi
