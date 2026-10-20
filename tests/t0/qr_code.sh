#!/bin/sh
# The QR codes of Zinc Go (ZN-631): zinc dev --lan's links encoded by Nayuki's encoder, drawn as a camera sees them, read back by quirc
# (tests/native/qr_test.cpp, the target qr_test).
cd "$(dirname "$0")/../.." || exit 2
BUILD=${BUILD:-build}
[ -x "$BUILD/qr_test" ] || { echo "skipped: qr_test is not built (tools/build qr_test)"; exit 77; }
"$BUILD/qr_test"
