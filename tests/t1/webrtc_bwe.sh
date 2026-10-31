#!/bin/sh
# zinc:webrtc's video on bad links (plugins/webrtc/native/bwe.cpp: NACKs, the receive estimate it sends as REMB, the sender's rate and
# ladder): the fake camera with grain to a peer in this process (tests/golden/host/webrtc_bwe.ts) under three ZINC_WEBRTC_IMPAIR profiles,
# at once, each printed as one JSON line:
#   nack    640x360 with 5% of packets lost and a 60 ms round trip: no freeze over 500 ms, at most one PLI a second (NACKs repair the rest);
#   step    640x480 on a 2 Mbit/s link that drops to 300 kbit/s from 8 s to 18 s: the sender under 300 kbit/s within 2 s of the drop, back at
#           90% of its full rate (and full size) within 10 s of the lift;
#   ladder  1280x720 on a link of 4 Mbit/s, then 900, 400, 160 and 50 kbit/s every 6 s: the pictures sent go down the ladder, 720p30,
#           360p30, 180p15 and 90p7 in that order (360p15 between them when the rate stops there).
# VP8 (the codec every peer has); interpreter only: the numbers are the plugin's, not the engine's. It measures time: run it alone.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_FAKE_CAMERA=1 ZINC_FAKE_CAMERA_NOISE=24
unset ZINC_DETERMINISTIC ZINC_WEBRTC_IMPAIR   # the network and the codecs take real time
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for p in webrtc camera; do
  out=$("$ZINC" plugin-build $p 2>&1) && echo "$out" | grep -q "^$p \(built\|cached\) " || { echo "the $p plugin does not build: $(echo "$out" | grep -m3 error)"; exit 1; }
done
t=tests/golden/host/webrtc_bwe.ts
ZINC_WEBRTC_IMPAIR=loss=5,delay=30,seed=1 timeout 70 "$ZINC" run $t -- 20 nack VP8 640 360 >"$tmp/nack" 2>"$tmp/nack.err" &
ZINC_WEBRTC_IMPAIR=rate=2M,step=8:300k:18:2M,seed=1 timeout 80 "$ZINC" run $t -- 30 step VP8 640 480 8:300k:18:2M >"$tmp/step" 2>"$tmp/step.err" &
ZINC_WEBRTC_IMPAIR=rate=4M,step=6:900k:12:400k:18:160k:24:50k,seed=1 timeout 80 "$ZINC" run $t -- 30 ladder VP8 1280 720 6:900k:12:400k:18:160k:24:50k >"$tmp/ladder" 2>"$tmp/ladder.err" &
wait
fail=0
for p in nack step ladder; do
  grep -q '^{"profile"' "$tmp/$p" || { echo "$p: no result"; tail -5 "$tmp/$p.err"; fail=1; continue; }
  cat "$tmp/$p"
done
[ $fail = 0 ] || exit 1
num() { sed -n 's/.*"'"$2"'":\([-0-9.]*\).*/\1/p' "$tmp/$1"; }
awk -v f="$(num nack maxFreezeMs)" -v p="$(num nack plisPerSecond)" 'BEGIN { exit !(f <= 500 && p <= 1) }' ||
  { echo "nack: longest freeze $(num nack maxFreezeMs) ms, $(num nack plisPerSecond) PLIs a second"; fail=1; }
awk -v c="$(num step capMs1)" -v r="$(num step recoverMs2)" 'BEGIN { exit !(c >= 0 && c <= 2000 && r >= 0 && r <= 10000) }' ||
  { echo "step: under the cap after $(num step capMs1) ms, back to full rate after $(num step recoverMs2) ms"; fail=1; }
rungs=$(sed -n 's/.*"rungs":"\([^"]*\)".*/\1/p' "$tmp/ladder")
echo ",$rungs," | grep -q ',720p30,\(.*,\)\{0,1\}360p30,\(.*,\)\{0,1\}180p15,\(.*,\)\{0,1\}90p7,' ||
  { echo "ladder: the pictures went $rungs, not 720p30, 360p30, 180p15, 90p7"; fail=1; }
exit $fail
