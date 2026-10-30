#!/bin/sh
# zinc:webrtc's call quality and ultra low data mode (tests/golden/host/webrtc_quality.ts): the E-model score, CallQuality on hand-made
# reports, then two peer connections in one process with the fake camera and microphone: Opus at 6 to 12 kbit/s in the low data mode,
# almost nothing for silence (DTX), the video tiny then off, and the call back. Interpreter only: the numbers are the codecs' (the other
# engines run the same plugin code through tests/t1/webrtc_media.sh). The measured bit rates go to .logs through stderr.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_FAKE_CAMERA=1 ZINC_FAKE_MICROPHONE=1
unset ZINC_DETERMINISTIC   # the network and the codecs take real time
out=$("$ZINC" plugin-build webrtc 2>&1) && echo "$out" | grep -q "^webrtc \(built\|cached\) " || { echo "the webrtc plugin does not build: $(echo "$out" | grep -m3 error)"; exit 1; }
got=$(timeout 90 "$ZINC" run tests/golden/host/webrtc_quality.ts)
[ "$got" = "$(cat tests/golden/host/webrtc_quality.out)" ] || { echo "webrtc quality differs: $(echo "$got" | diff tests/golden/host/webrtc_quality.out - | head -8)"; exit 1; }
