#!/bin/sh
# zinc:webrtc audio and video tracks (plugins/webrtc: libdatachannel's RTP, libsrtp, Opus, VP8, H.264 through VideoToolbox on macOS): two
# peer connections in one process send the fake camera and the fake microphone to each other, no network, no device, no permission
# question (tests/golden/host/webrtc_media.ts: the picture by PSNR, the rate, a PLI, the tone by Goertzel, disabled tracks, replaceTrack,
# setParameters, the stats, removeTrack and directions renegotiated, setCodecPreferences, an edited SDP, close). The same lines on the
# interpreter (the hardware codec first where there is one), with VP8 only (ZINC_WEBRTC_H264=0: what Linux negotiates), on QuickJS and
# compiled ahead of time. Each run is one process: nothing listens once it has ended.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_FAKE_CAMERA=1 ZINC_FAKE_MICROPHONE=1
unset ZINC_DETERMINISTIC   # the network and the codecs take real time
want=$(cat tests/golden/host/webrtc_media.out)
t=tests/golden/host/webrtc_media.ts
out=$("$ZINC" plugin-build webrtc 2>&1) && echo "$out" | grep -q "^webrtc \(built\|cached\) " || { echo "the webrtc plugin does not build: $(echo "$out" | grep -m3 error)"; exit 1; }
got=$(timeout 90 "$ZINC" run $t 2>/dev/null)
[ "$got" = "$want" ] || { echo "the media loopback differs on the interpreter: $(echo "$got" | diff tests/golden/host/webrtc_media.out - | head -8)"; fail=1; }
got=$(ZINC_WEBRTC_H264=0 timeout 90 "$ZINC" run $t 2>/dev/null)
[ "$got" = "$want" ] || { echo "the media loopback differs with VP8 only: $(echo "$got" | diff tests/golden/host/webrtc_media.out - | head -8)"; fail=1; }
got=$(timeout 90 "$ZINC" run $t --engine quickjs 2>/dev/null)
[ "$got" = "$want" ] || { echo "the media loopback differs on QuickJS: $(echo "$got" | diff tests/golden/host/webrtc_media.out - | head -8)"; fail=1; }
"$ZINC" build $t -o "$tmp/aot" >"$tmp/build.log" 2>&1 || { echo "the media loopback does not build ahead of time: $(grep -m3 -i error "$tmp/build.log")"; fail=1; }
got=$(timeout 90 "$tmp/aot" 2>/dev/null)
[ "$got" = "$want" ] || { echo "the media loopback differs compiled: $(echo "$got" | diff tests/golden/host/webrtc_media.out - | head -8)"; fail=1; }
exit $fail
