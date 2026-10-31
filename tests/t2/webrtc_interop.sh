#!/bin/sh
# zinc:webrtc against headless Chrome (tools/webrtc-interop, tests/data/webrtc_interop.ts): audio and video both ways between a Zinc program
# and a page, with Zinc offering and with the page offering, VP8 first and H.264 first. Both sides use their fake camera and microphone (no
# device, no question); the page must decode Zinc's video and hear the fake microphone's 480 Hz, Zinc must decode the page's video and
# audio; and once with Zinc offering simulcast, which the page declines (VP8 in two temporal layers, our payload descriptor). Skipped
# without Chrome. Chrome and the Zinc program end with the run; nothing listens afterwards.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
fail=0
for role in offer answer; do
  for codec in video/VP8 video/H264; do
    out=$(timeout 120 python3 tools/webrtc-interop --zinc "$ZINC" --role $role --codec $codec 2>&1); rc=$?
    [ $rc -eq 77 ] && { echo "skipped: no Chrome"; exit 77; }
    [ $rc -eq 0 ] || { echo "interop, Zinc ${role}s, $codec first: $(echo "$out" | tr '\n' ' ' | head -c 400)"; fail=1; }
  done
done
out=$(timeout 120 python3 tools/webrtc-interop --zinc "$ZINC" --role offer --codec video/VP8 --simulcast 2>&1) ||
  { echo "interop, Zinc offers simulcast: $(echo "$out" | tr '\n' ' ' | head -c 400)"; fail=1; }
exit $fail
