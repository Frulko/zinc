#!/bin/sh
# Play the original game through its real entry: collect the shovel and reach the treasure.
cd "$(dirname "$0")/../.." || exit 2
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
if ! env ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_NATIVE=real ZINC_AUDIO_LOG=1 \
  ZINC_FRAMES=1000 ZINC_INPUT=tests/golden/just-go-straight/play.input ZINC_SHOT="$tmp/win.png" \
  "$ZINC" run examples/just-go-straight > "$tmp/out" 2> "$tmp/err"; then
  cat "$tmp/err"
  exit 1
fi
if grep -v '^zinc: Canvas 2D' "$tmp/err" | grep -q .; then
  cat "$tmp/err"
  exit 1
fi
tools/pngdiff "$tmp/win.png" tests/golden/just-go-straight/win.png --ssim 0.99
python3 - "$tmp/out" <<'PY'
import re, sys
lines = open(sys.argv[1]).read().splitlines()
played = {m.group(1) for line in lines if (m := re.match(r'audio element (data:audio/wav;base64,[^:]+): [0-9.]+ s from', line))}
assert len(played) >= 5, 'Steps, pickup, transitions, digging and victory must play'
assert any(line.startswith('audio out: sound from') for line in lines), 'The native mixer must produce sound'
PY
