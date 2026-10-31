#!/bin/sh
# Our H.264 SPS passes libwebrtc's receive-side SpsVuiRewriter unchanged, the VideoToolbox original would not (tests/golden/host/discord_voice_sps.cpp).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
c++ -std=c++20 -Wall -Iplugins/discord-voice/native -o "$tmp/sps" tests/golden/host/discord_voice_sps.cpp 2>&1 | head -20
[ -x "$tmp/sps" ] || { echo "discord_voice_sps: does not build"; exit 1; }
out=$("$tmp/sps" 2>&1 | tail -1)
[ "$out" = ok ] || { echo "discord_voice_sps: $("$tmp/sps" 2>&1 | head -5)"; exit 1; }
