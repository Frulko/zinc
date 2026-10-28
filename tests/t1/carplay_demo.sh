#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
Z=${ZINC:-build/zinc}
export ZINC_ROOT="$PWD"
"$Z" check examples/carplay
ZINC="$Z" ZINC_CARPLAY_URL=ws://127.0.0.1:9 ZINC_HEADLESS=1 ZINC_FRAMES=24 ZINC_SHOT="${TMPDIR:-/tmp}/zinc-carplay-live-disconnected.png" examples/carplay/run --live
ZINC="$Z" ZINC_HEADLESS=1 ZINC_FRAMES=120 ZINC_SHOT="${TMPDIR:-/tmp}/zinc-carplay-offline.png" examples/carplay/run --offline
ZINC_CARPLAY_MEDIA="$PWD/build/carplay/demo-media" ZINC_HEADLESS=1 "$Z" run -q tests/golden/carplay/offline.ts
# Live mode must fail usefully before opening a window when no URL is supplied.
if ZINC="$Z" ZINC_CARPLAY_URL='' examples/carplay/run --live >.logs/carplay-live-missing.log 2>&1; then
  echo 'live launch accepted an empty receiver URL' >&2; exit 1
fi
rg -q 'Set ZINC_CARPLAY_URL' .logs/carplay-live-missing.log
