#!/bin/sh
# Shared Spinner and the builder's real activity/progress UI; no process, Docker or network.
cd "$(dirname "$0")/../.." || exit 2
root=$(pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
out=$(ZINC_HEADLESS=1 ZINC_SIZE=420x780 ZINC_FRAMES=82 ZINC_PI_IMAGE_ROOT="$root" ZINC_PI_IMAGE_PROFILE="$tmp/profile.json" \
  "$ZINC" run tests/data/pi-image/builder-motion.tsx 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q '^builder motion: spinner, easing, cleanup and reduced motion OK' || { echo "$out"; exit 1; }
