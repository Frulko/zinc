#!/bin/sh
# The Zinc Go home screen's QR scanner (ZN-631, examples/zinc-go), headless: the fake camera holds up a QR code of a zinc:// link
# (ZINC_FAKE_CAMERA_IMAGE, a picture qr_test draws with Nayuki's encoder), zinc:camera's scanQr reads it with quirc, and the home screen hands the
# link to the system's opener (zinc:system's recording simulator here; on a phone the system gives it back to the player).
cd "$(dirname "$0")/../.." || exit 2
BUILD=${BUILD:-build}
Z="${ZINC:-$BUILD/zinc}"
[ -x "$BUILD/qr_test" ] || { echo "skipped: qr_test is not built (tools/build qr_test)"; exit 77; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
url="zinc://192.168.1.23:8090/3fa9c2d1"
"$BUILD/qr_test" --png "$url" "$t/qr.png" || { echo "qr_test could not draw the code"; exit 1; }
ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=120 ZINC_GO_SCAN=1 ZINC_FAKE_CAMERA_IMAGE="$t/qr.png" ZINC_SYSTEM_LOG=- "$Z" run ../examples/zinc-go > "$t/out.txt" 2>&1
grep -q "zinc go: scanned $url" "$t/out.txt" || { echo "the scanner did not read the code: $(grep -v '^  ' "$t/out.txt" | tail -3)"; exit 1; }
grep -q "\[system\] opener.open {\"target\":\"$url\"}" "$t/out.txt" || { echo "the link was not handed to the opener: $(tail -3 "$t/out.txt")"; exit 1; }
echo "zinc go home: the QR code read and opened"
