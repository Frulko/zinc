#!/bin/sh
# zinc:gphoto2 with the fake camera (ZN-110, ZINC_FAKE_CAMERA=1): a session through promises (detect, open, capture, download, live view frames settled by the plugin's worker), and the camera
# examples run headless. libgphoto2 and libturbojpeg are system libraries (pkg-config): without them the test skips and says so.
cd "$(dirname "$0")/../.." || exit 2
command -v pkg-config >/dev/null && pkg-config --exists libgphoto2 libturbojpeg && command -v c++ >/dev/null || { echo "skipped: libgphoto2, libturbojpeg or a compiler is missing"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home}
mkdir -p "$tmp/w"
want="cameras 1 Zinc Fake Camera
open Zinc Fake Camera
captured captures/IMG_0001.JPG
downloaded captures/IMG_0001.JPG
live view frames yes"
got=$(cd "$tmp/w" && env -u ZINC_DETERMINISTIC ZINC_FAKE_CAMERA=1 ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_FRAMES=2000000 timeout 120 "$ZINC" run "$OLDPWD/tests/golden/host/camera_session.ts" 2>&1)
[ "$got" = "$want" ] || { echo "the fake-camera session differs: $got"; fail=1; }
[ -s "$tmp/w/captures/IMG_0001.JPG" ] || { echo "no captured file"; fail=1; }
for e in cli bench remote; do
  out=$(env -u ZINC_DETERMINISTIC ZINC_FAKE_CAMERA=1 ZINC_NATIVE=real ZINC_HEADLESS=1 ZINC_FRAMES=900 timeout 120 "$ZINC" run "../examples/camera/$e" 2>&1 >/dev/null); rc=$?
  [ $rc -eq 0 ] || { echo "examples/camera/$e: exit $rc: $(echo "$out" | head -c 200)"; fail=1; }
done
exit $fail
