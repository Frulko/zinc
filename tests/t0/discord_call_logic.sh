#!/bin/sh
# examples/discord and zinc:discord-voice: the voice gateway close codes, the simulcast layer picked for a tile and the order of the
# stream events (examples/discord/tests/call-logic.ts), then the native rules (key frame cadence, the DAVE member list across epochs;
# plugins/discord-voice/native/video_policy.h) compiled on their own. No network.
cd "$(dirname "$0")/../.." || exit 2
out=$("$ZINC" run --interp examples/discord/tests/call-logic.ts 2>&1 | grep -v '^zinc')
[ "$out" = ok ] || { echo "discord_call_logic: $out"; exit 1; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
c++ -std=c++20 -Wall -Wextra -Werror -Iplugins/discord-voice/native -o "$tmp/policy" tests/golden/host/discord_voice_policy.cpp || { echo "discord_call_logic: the native rules do not compile"; exit 1; }
out=$("$tmp/policy" 2>&1)
[ "$out" = ok ] || { echo "discord_call_logic: $out"; exit 1; }
