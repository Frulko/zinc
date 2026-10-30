#!/bin/sh
# The video call demo (examples/webrtc-call), on the fake camera and the fake microphone: its screen before a call renders to the recorded
# frame hashes (tests/golden/webrtc-call/hashes.txt: mode, scheme, size, hash; deterministic, no call), a compiled run gives the
# interpreter's hash of the first (QuickJS runs no JSX: tests/t1/webrtc_media.sh covers the tracks there); the scripted session in real time
# (a call through the echo peer, the picture back, the stats, mute and video off, the camera picked again, the fake screen shared and back,
# the speaker, hang up) prints the
# lines of session.out (sorted: the two peers race). No real device is opened, no system question asked, nothing listens once it has ended.
# ZN_UPDATE_GOLDEN=1 records again.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
app=$PWD/examples/webrtc-call; golden=$PWD/tests/golden/webrtc-call
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_FAKE_CAMERA=1 ZINC_FAKE_MICROPHONE=1 ZINC_FAKE_SCREEN=1
fail=0
hash() { echo "$1" | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p'; }
shot() {   # shot <mode> <scheme> <size> [flags]: the frame hash of the screen before a call, deterministic
  hash "$(cd "$app" && env ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_SIZE=$3 ZINC_FRAMES=20 ZINC_FRAMEHASH=last CALL_MODE=$1 ZINC_SCHEME=$2 timeout 120 "$ZINC" $4 run . 2>&1)"
}
: > "$tmp/hashes"
while read -r mode scheme size want; do
  got=$(shot "$mode" "$scheme" "$size")
  echo "$mode $scheme $size $got" >> "$tmp/hashes"
  [ "$got" = "$want" ] || { [ -n "$ZN_UPDATE_GOLDEN" ] || echo "webrtc-call $mode $scheme $size: $got, recorded $want"; fail=1; }
done < "$golden/hashes.txt"
read -r mode scheme size want < "$golden/hashes.txt"
got=$(shot "$mode" "$scheme" "$size" --native)
[ "$got" = "$want" ] || { echo "webrtc-call compiled: $got, interpreter recorded $want"; fail=1; }

# the scripted session, in real time
(cd "$app" && env -u ZINC_DETERMINISTIC ZINC_FRAMES=1000000 CALL_DEMO=1 CALL_LOG=1 timeout 90 "$ZINC" run . 2>/dev/null) | grep -v '^zinc' | sort > "$tmp/session"

if [ -n "$ZN_UPDATE_GOLDEN" ]; then cp "$tmp/hashes" "$golden/hashes.txt"; cp "$tmp/session" "$golden/session.out"; echo "webrtc-call: goldens recorded"; exit 0; fi
cmp -s "$tmp/session" "$golden/session.out" || { echo "webrtc-call session differs:"; diff "$golden/session.out" "$tmp/session" | head -12; fail=1; }
exit $fail
