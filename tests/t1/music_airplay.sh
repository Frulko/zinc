#!/bin/sh
# examples/music-tree with the AirPlay bridge: recognising its stream, its status, the commands' token, the phone's setup page
# (one-time code, lockout, Last.fm's redirect, private files, the secret never sent back), scrobbling from the bridge's durations.
cd "$(dirname "$0")/../.." || exit 2
set -eu
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export ZINC_HEADLESS=1
unset ZINC_DETERMINISTIC   # the delivery's retry and the bridge run on the real clock
for mode in --interp --native; do
  export TEST_DATA="$tmp/data$mode"
  mkdir -p "$TEST_DATA"
  "$Z" run "$mode" tests/data/music-tree/airplay_check.ts >"$tmp/check.log" 2>&1 || { cat "$tmp/check.log"; exit 1; }
  grep -q 'music airplay checks passed' "$tmp/check.log" || { cat "$tmp/check.log"; exit 1; }
done
echo "music_airplay: ok"
