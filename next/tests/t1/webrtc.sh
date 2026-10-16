#!/bin/sh
# zinc:webrtc (plugins/webrtc, libdatachannel): the plugin builds with the pinned zig against the engine's mbedTLS; two peer connections in
# one process connect over their host candidates with no ICE server and no network (tests/golden/host/webrtc_loopback.ts: trickle and whole
# descriptions, ordered text and bytes both ways, an unordered channel, a channel the answerer opens, 200 KB in one message, close events on
# both sides, the errors) and print the frozen lines on the interpreter, on QuickJS and
# compiled ahead of time; the RTC names work as globals without an import. Each run is one process: nothing listens once it has ended.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1
unset ZINC_DETERMINISTIC   # the network takes real time
want=$(cat tests/golden/host/webrtc_loopback.out)
out=$("$ZINC" plugin-build webrtc 2>&1) && echo "$out" | grep -q "^webrtc \(built\|cached\) " || { echo "the webrtc plugin does not build: $(echo "$out" | grep -m3 error)"; exit 1; }
got=$(timeout 60 "$ZINC" run tests/golden/host/webrtc_loopback.ts 2>/dev/null)
[ "$got" = "$want" ] || { echo "the loopback differs on the interpreter: $(echo "$got" | diff tests/golden/host/webrtc_loopback.out - | head -6)"; fail=1; }
got=$(timeout 60 "$ZINC" run tests/golden/host/webrtc_loopback.ts --engine quickjs 2>/dev/null)
[ "$got" = "$want" ] || { echo "the loopback differs on QuickJS: $(echo "$got" | diff tests/golden/host/webrtc_loopback.out - | head -6)"; fail=1; }
"$ZINC" build tests/golden/host/webrtc_loopback.ts -o "$tmp/aot" >"$tmp/build.log" 2>&1 || { echo "the loopback does not build ahead of time: $(grep -m3 -i error "$tmp/build.log")"; fail=1; }
got=$(timeout 60 "$tmp/aot" 2>/dev/null)
[ "$got" = "$want" ] || { echo "the loopback differs compiled: $(echo "$got" | diff tests/golden/host/webrtc_loopback.out - | head -6)"; fail=1; }
got=$(timeout 30 "$ZINC" run tests/data/webrtc_globals.ts 2>/dev/null)
[ "$got" = "got global hello" ] || { echo "the RTC globals: $got"; fail=1; }
exit $fail
