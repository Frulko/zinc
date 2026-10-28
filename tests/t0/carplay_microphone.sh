#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
Z=${ZINC:-build/zinc}
export ZINC_ROOT="$PWD"
ZINC_BACKGROUND=1 ZINC_HEADLESS=1 ZINC_FAKE_MICROPHONE=1 "$Z" run -q tests/golden/carplay/microphone.ts
ZINC_BACKGROUND=1 ZINC_HEADLESS=1 ZINC_FAKE_MICROPHONE=1 ZINC_PERMISSIONS=enforce "$Z" run -q tests/golden/carplay/microphone-refused
ZINC_BACKGROUND=1 ZINC_HEADLESS=1 ZINC_FAKE_MICROPHONE=2 ZINC_PERMISSIONS=off "$Z" run -q tests/golden/carplay/microphone-refused
