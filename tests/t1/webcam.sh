#!/bin/sh
# zinc:camera (plugins/camera) on the fake camera: the plugin builds; a session (list, open, frames with their index, snapshot hashes, options,
# close) prints the frozen lines on the interpreter, on QuickJS and outside a deterministic run with ZINC_FAKE_CAMERA=1; ZINC_FAKE_CAMERA=0
# lists no fake camera; the image drawn by zinc:gfx shows the pattern; navigator.mediaDevices opens it as a MediaStream; a project whose
# permissions lack "camera" is refused when enforced. No real camera is opened.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME=${ZINC_HOME:-$tmp/home} ZINC_HEADLESS=1 ZINC_BACKGROUND=1
want=$(cat tests/golden/host/webcam_session.out)
out=$("$ZINC" plugin-build camera 2>&1) && echo "$out" | grep -q "^camera \(built\|cached\) " || { echo "the camera plugin does not build: $out"; exit 1; }
got=$(ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run tests/golden/host/webcam_session.ts 2>/dev/null)
[ "$got" = "$want" ] || { echo "the session differs on the interpreter: $(echo "$got" | diff tests/golden/host/webcam_session.out - | head -6)"; fail=1; }
got=$(ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run tests/golden/host/webcam_session.ts --engine quickjs 2>/dev/null)
[ "$got" = "$want" ] || { echo "the session differs on QuickJS: $(echo "$got" | diff tests/golden/host/webcam_session.out - | head -6)"; fail=1; }
got=$(env -u ZINC_DETERMINISTIC ZINC_FAKE_CAMERA=1 timeout 60 "$ZINC" run tests/golden/host/webcam_session.ts 2>/dev/null)
[ "$got" = "$want" ] || { echo "ZINC_FAKE_CAMERA=1 outside a deterministic run is not the same fake camera: $(echo "$got" | head -3)"; fail=1; }
# ZINC_FAKE_CAMERA=0: the machine's cameras only (listed, never opened), [] on one without
printf "import { devices } from 'zinc:camera';\ndevices().then((l) => console.log('fake ' + l.filter((d) => d.name === 'Zinc Fake Camera').length));\n" > "$tmp/none.ts"
got=$(ZINC_DETERMINISTIC=1 ZINC_FAKE_CAMERA=0 timeout 60 "$ZINC" run "$tmp/none.ts" 2>/dev/null)
[ "$got" = "fake 0" ] || { echo "ZINC_FAKE_CAMERA=0 still lists the fake camera: $got"; fail=1; }
# the runtime image on screen (80x60 drawn at 320x240): bar 0 white, bar 2 cyan; then getUserMedia's stream
got=$(ZINC_DETERMINISTIC=1 ZINC_FRAMES=30 ZINC_SHOT="$tmp/draw.bmp" timeout 60 "$ZINC" run tests/golden/host/webcam_draw.ts 2>/dev/null)
[ "$got" = "enumerate videoinput:Zinc Fake Camera
stream true video Zinc Fake Camera 32x24 30 image audio 0
stopped false ended
audio NotFoundError
deviceId NotFoundError" ] || { echo "navigator.mediaDevices over zinc:camera differs: $got"; fail=1; }
px=$(python3 tests/data/bmp_pixel.py "$tmp/draw.bmp" 10,100 100,100 2>&1 | tr '\n' ' ')
[ "$px" = "255,255,255 0,255,255 " ] || { echo "the camera image is not on screen (pixels $px)"; fail=1; }
# zinc.json permissions: without "camera", devices() and open() are refused when enforced
mkdir -p "$tmp/denied" && printf '{ "name": "denied", "entry": "main.ts", "permissions": ["fs"] }\n' > "$tmp/denied/zinc.json"
printf "import { devices, Camera } from 'zinc:camera';\ndevices().then(() => console.log('listed')).catch((e: Error) => console.log(e.message));\nCamera.open('').then(() => console.log('opened')).catch((e: Error) => console.log(e.message));\n" > "$tmp/denied/main.ts"
out=$(cd "$tmp/denied" && ZINC_PERMISSIONS=enforce ZINC_DETERMINISTIC=1 timeout 60 "$ZINC" run . 2>&1)
[ "$(echo "$out" | grep -c 'needs the permission "camera"')" = 2 ] || { echo "an undeclared camera is not refused: $out"; fail=1; }
exit $fail
