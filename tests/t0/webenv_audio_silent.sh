#!/bin/sh
# ZN-1043: the web environment loads zinc:audio's native code at its first sound, and builds it at a first run. When it cannot be built (here a
# compiler that does not exist), the page says so in one line and goes on in silence, instead of stopping on an uncaught error.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_NATIVE=real ZINC_PLUGIN_NO_STAMP=1 ZINC_PLUGIN_CC=system CXX=/nonexistent/c++ CC=/nonexistent/cc ZINC_FRAMES=5 \
  timeout 60 "$ZINC" run tests/data/webenv-audio-silent/main.js --engine quickjs > "$tmp/out" 2> "$tmp/err" || { echo "webenv_audio_silent: the page stopped: $(grep -v '^  ' "$tmp/err" | head -c 300)"; exit 1; }
[ "$(cat "$tmp/out")" = "after the sound running" ] || { echo "webenv_audio_silent: the page did not go on: $(cat "$tmp/out" | head -c 200)"; exit 1; }
[ "$(grep -c '^zinc: the web environment has no sound' "$tmp/err")" = 1 ] || { echo "webenv_audio_silent: not one line about the sound: $(grep -v '^  ' "$tmp/err" | head -c 300)"; exit 1; }
grep -q Uncaught "$tmp/err" && { echo "webenv_audio_silent: an uncaught error: $(grep -A2 Uncaught "$tmp/err" | head -c 300)"; exit 1; }
echo 'webenv_audio_silent: no audio plugin, one line, the page goes on PASS'
