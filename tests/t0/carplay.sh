#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
Z=${ZINC:-build/zinc}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
ffmpeg -loglevel error -f lavfi -i color=c=blue:s=64x32:r=1 -frames:v 1 -c:v libx264 -tune zerolatency -f h264 "$tmp/frame.h264"
ffmpeg -loglevel error -f lavfi -i sine=frequency=440:sample_rate=48000 -frames:a 1 -c:a aac -f adts "$tmp/audio.aac"
ffmpeg -loglevel error -f lavfi -i color=c=blue:s=64x32:r=1 -frames:v 1 -c:v libx265 -tune zerolatency -x265-params log-level=error:pools=1 -f hevc "$tmp/frame.hevc" 2>"$tmp/hevc.log"
ffmpeg -loglevel error -f lavfi -i sine=frequency=440:sample_rate=48000 -frames:a 1 -c:a libopus -map 0:a -f data "$tmp/audio.opus"
unset ZINC_DETERMINISTIC
CARPLAY_TEST_HEVC="$tmp/frame.hevc" CARPLAY_TEST_OPUS="$tmp/audio.opus" CARPLAY_TEST_AUDIO="$tmp/audio.aac" CARPLAY_TEST_FRAME="$tmp/frame.h264" ZINC_HEADLESS=1 "$Z" run -q tests/golden/carplay/decoder.ts
CARPLAY_TEST_HEVC="$tmp/frame.hevc" CARPLAY_TEST_OPUS="$tmp/audio.opus" CARPLAY_TEST_AUDIO="$tmp/audio.aac" CARPLAY_TEST_FRAME="$tmp/frame.h264" ZINC_HEADLESS=1 "$Z" run -q --interp tests/golden/carplay/decoder.ts
