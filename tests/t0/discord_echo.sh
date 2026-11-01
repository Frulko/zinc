#!/bin/sh
# The echo cancellation of a Discord call (plugins/discord-voice/native/echo.h, over zinc:microphone's SpeexDSP processor): frames played to the
# speakers are the reference, the microphone frames of a simulated room come out with the echo at least 15 dB lower than without it
# (tests/native/discord_echo_test.cpp). No engine and no device: the path and its libraries alone.
set -eu
cd "$(dirname "$0")/../.."
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
S=plugins/microphone/vendor/speexdsp
def="-DFLOATING_POINT -DUSE_SMALLFT -DEXPORT= -I$S/include"
for f in mdf preprocess filterbank fftwrap smallft; do cc -O2 -w $def -c $S/libspeexdsp/$f.c -o "$tmp/$f.o" & done
cc -O2 -w -DMA_NO_ENCODING -DMA_NO_RESOURCE_MANAGER -DMA_NO_DEVICE_IO -c plugins/audio/vendor/miniaudio_impl.c -o "$tmp/ma.o" &
c++ -std=c++17 -O2 $def -c plugins/microphone/native/voice.cpp -o "$tmp/voice.o" &
c++ -std=c++17 -O2 -c tests/native/discord_echo_test.cpp -o "$tmp/test.o" &
wait
c++ -o "$tmp/discord_echo" "$tmp"/*.o -lm -lpthread
"$tmp/discord_echo"
