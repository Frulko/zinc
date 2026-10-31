#!/bin/sh
# zinc:webrtc on bad networks (plugins/webrtc/native/impair.cpp): the echo call of examples/webrtc-call (tests/golden/host/webrtc_impair.ts)
# under six ZINC_WEBRTC_IMPAIR profiles, each printed as one JSON line (the measures of docs/reports/webrtc-selfhost-design.md §6.1):
#   clean  no impairment, audio and video;
#   thin   audio in the ultra low data mode on a 20 kbit/s link with 10% loss and a 100 ms round trip;
#   step   audio and video on a 2 Mbit/s link that drops to 300 kbit/s halfway;
#   burst  audio at its normal rate with 20% of packets lost in runs of 3 (Opus FEC and DRED between two Zinc peers);
#   jitter audio with a 100 ms round trip and 30 ms of jitter: the jitter buffer settles near 60 ms, no gap, mouth to ear under 250 ms;
#   calm   the same jitter for 6 s, then none: the buffer is back to 40 ms by the end.
# The profiles run at once, one process each (ZINC_IMPAIR_SECONDS long, 20 by default), and `thin` twice: the same seed loses the same
# packets (the digest of the harness's first 256 decisions). Interpreter only: the numbers are the plugin's, not the engine's.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_FAKE_CAMERA=1 ZINC_FAKE_MICROPHONE=1 ZINC_WEBRTC_IMPAIR_LOG=1
unset ZINC_DETERMINISTIC ZINC_WEBRTC_IMPAIR   # the network and the codecs take real time
secs=${ZINC_IMPAIR_SECONDS:-20}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
out=$("$ZINC" plugin-build webrtc 2>&1) && echo "$out" | grep -q "^webrtc \(built\|cached\) " || { echo "the webrtc plugin does not build: $(echo "$out" | grep -m3 error)"; exit 1; }
t=tests/golden/host/webrtc_impair.ts
lim=$((secs + 40))
timeout $lim "$ZINC" run $t -- "$secs" av normal clean >"$tmp/clean" 2>"$tmp/clean.err" &
ZINC_WEBRTC_IMPAIR=loss=10,rate=20k,delay=50,seed=1 timeout $lim "$ZINC" run $t -- "$secs" audio low thin >"$tmp/thin" 2>"$tmp/thin.err" &
ZINC_WEBRTC_IMPAIR=loss=10,rate=20k,delay=50,seed=1 timeout $lim "$ZINC" run $t -- "$secs" audio low thin >"$tmp/thin2" 2>"$tmp/thin2.err" &
ZINC_WEBRTC_IMPAIR=rate=2M,step=$((secs / 2 + 1)):300k,delay=20,seed=1 timeout $lim "$ZINC" run $t -- "$secs" av normal step >"$tmp/step" 2>"$tmp/step.err" &
ZINC_WEBRTC_IMPAIR=delay=50,jitter=30,seed=1 timeout $lim "$ZINC" run $t -- "$secs" audio normal jitter >"$tmp/jitter" 2>"$tmp/jitter.err" &
ZINC_WEBRTC_IMPAIR=delay=50,jitter=30,calm=6,seed=1 timeout $lim "$ZINC" run $t -- "$secs" audio normal calm >"$tmp/calm" 2>"$tmp/calm.err" &
ZINC_WEBRTC_IMPAIR=loss=20,burst=3,delay=50,seed=1 timeout $lim "$ZINC" run $t -- "$secs" audio normal burst >"$tmp/burst" 2>"$tmp/burst.err" &
wait
fail=0
for p in clean thin step burst jitter calm; do
  grep -q '^{"profile":"'$p'",.*"concealedPct":' "$tmp/$p" || { echo "$p: no stats line: $(head -c 300 "$tmp/$p.err")"; fail=1; continue; }
  cat "$tmp/$p"
done
[ $fail = 0 ] || exit 1
num() { sed -n 's/.*"'"$2"'":\([-0-9.]*\).*/\1/p' "$tmp/$1"; }
# clean: nothing lost; thin: about 10% lost on the way (more when the 20 kbit/s queue overflows); step: video went through the step
[ "$(num clean audioLossPct)" = 0 ] || { echo "clean: audio lost $(num clean audioLossPct)%"; fail=1; }
awk -v l="$(num thin audioLossPct)" 'BEGIN { exit !(l >= 5) }' || { echo "thin: audio lost $(num thin audioLossPct)%, not the 10% asked"; fail=1; }
awk -v r="$(num clean rttMs)" -v s="$(num thin rttMs)" 'BEGIN { exit !(s >= r + 90) }' || { echo "thin: round trip $(num thin rttMs) ms, not 100 ms over clean's $(num clean rttMs)"; fail=1; }
[ -n "$(num step videoKbps2)" ] || { echo "step: no video rate"; fail=1; }
# thin: 60 ms packets keep the low data mode under the 20 kbit/s link (no queue loss), and nothing goes silent for 120 ms
awk -v w="$(num thin audioWireKbps)" -v g="$(num thin maxGapMs)" 'BEGIN { exit !(w < 20 && g < 120) }' || { echo "thin: $(num thin audioWireKbps) kbit/s on the wire, longest gap $(num thin maxGapMs) ms"; fail=1; }
# burst: the losses are rebuilt from the FEC and the deep redundancy (DRED), not only concealed
awk -v f="$(num burst fecPct)" -v d="$(num burst dredPct)" -v c="$(num burst concealedPct)" 'BEGIN { exit !(f > 0 && d > 0 && c < f + d) }' || { echo "burst: FEC $(num burst fecPct)%, DRED $(num burst dredPct)%, concealed $(num burst concealedPct)%"; fail=1; }
# jitter: the target near 2 x the jitter, nothing concealed or silent while it resizes, mouth to ear within 250 ms; calm: back to 40 ms
awk -v t="$(num jitter jbTargetEndMs)" -v c="$(num jitter concealedPct)" -v g="$(num jitter maxGapMs)" -v m="$(num jitter mouthToEarMs)" 'BEGIN { exit !(t >= 50 && t <= 85 && c == 0 && g == 0 && m > 0 && m <= 250) }' ||
  { echo "jitter: target $(num jitter jbTargetEndMs) ms, concealed $(num jitter concealedPct)%, gap $(num jitter maxGapMs) ms, mouth to ear $(num jitter mouthToEarMs) ms"; fail=1; }
awk -v t="$(num calm jbTargetEndMs)" -v g="$(num calm maxGapMs)" 'BEGIN { exit !(t <= 45 && g == 0) }' || { echo "calm: target $(num calm jbTargetEndMs) ms at the end, gap $(num calm maxGapMs) ms"; fail=1; }
d1=$(grep -o 'digest [0-9a-f]*' "$tmp/thin.err" | sort | tr '\n' ' '); d2=$(grep -o 'digest [0-9a-f]*' "$tmp/thin2.err" | sort | tr '\n' ' ')
[ -n "$d1" ] && [ "$d1" = "$d2" ] || { echo "thin: the same seed lost other packets ($d1/ $d2)"; fail=1; }
exit $fail
