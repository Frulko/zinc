#!/bin/sh
# zinc:microphone's voice processing through the plugin (tests/golden/host/microphone_voice.ts): on the fake microphone, the echo
# canceller with a reference takes the "echo" away, leaves the sound alone without one, and noise suppression and gain control change it;
# the same line on the interpreter and on QuickJS. The canceller's own measure on a recorded voice is tests/t0/voice_aec.sh.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
export ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_DETERMINISTIC=1
want='echo cancelled: true; untouched without a reference: true; noise and gain applied: true'
fail=0
got=$(timeout 60 "$ZINC" run tests/golden/host/microphone_voice.ts 2>/dev/null)
[ "$got" = "$want" ] || { echo "interpreter: $got"; fail=1; }
got=$(timeout 60 "$ZINC" run tests/golden/host/microphone_voice.ts --engine quickjs 2>/dev/null)
[ "$got" = "$want" ] || { echo "QuickJS: $got"; fail=1; }
exit $fail
