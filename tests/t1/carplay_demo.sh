#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
Z=${ZINC:-build/zinc}
"$Z" check examples/carplay
ZINC_CARPLAY_URL='' ZINC_HEADLESS=1 ZINC_FRAMES=24 "$Z" run -q examples/carplay
