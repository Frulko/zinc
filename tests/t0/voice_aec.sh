#!/bin/sh
# zinc:microphone's echo cancellation, noise suppression and gain control (plugins/microphone/native/voice.cpp over the vendored SpeexDSP):
# a recorded voice (examples/museum-table's welcome, MP3 through miniaudio) played into a simulated room is cancelled by at least 20 dB, and a near voice over it comes through
# (ERLE, tests/native/voice_aec_test.cpp). No engine: the processor and its libraries alone.
set -eu
cd "$(dirname "$0")/../.."
command -v c++ >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
S=plugins/microphone/vendor/speexdsp
def="-DFLOATING_POINT -DUSE_SMALLFT -DEXPORT= -I$S/include"
for f in mdf preprocess filterbank fftwrap smallft; do cc -O2 -w $def -c $S/libspeexdsp/$f.c -o "$tmp/$f.o" & done
cc -O2 -w -DMA_NO_ENCODING -DMA_NO_RESOURCE_MANAGER -DMA_NO_DEVICE_IO -c plugins/audio/vendor/miniaudio_impl.c -o "$tmp/ma.o" &
c++ -std=c++17 -O2 $def -c plugins/microphone/native/voice.cpp -o "$tmp/voice.o" &
c++ -std=c++17 -O2 -Iplugins/microphone/native -c tests/native/voice_aec_test.cpp -o "$tmp/test.o" &
wait
c++ -o "$tmp/voice_aec" "$tmp"/*.o -lm -lpthread
a=examples/museum-table/assets/audio
"$tmp/voice_aec" $a/welcome.en.mp3 $a/garden-voice.fr.mp3
