#!/bin/sh
# The process must leave normally with decoded media and unclosed WebRTC workers.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
timeout 12 env ZINC_HEADLESS=1 ZINC_BACKGROUND=1 ZINC_REALTIME=1 ZINC_FRAMES=600 \
  ZINC_FAKE_CAMERA=1 ZINC_FAKE_MICROPHONE=1 "$ZINC" run --interp tests/data/webrtc_shutdown.ts >"$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
grep -q 'live video and audio; leaving peers open' "$tmp/log" || { cat "$tmp/log"; exit 1; }
