#!/bin/sh
# Pixel parity with the prototype (ZN-113): every example of tests/golden/examples/proto/manifest.json is rendered by this engine and compared with the
# prototype's frames. A failing entry prints its differing pixel count and the path of the diff image. Known differences may not grow.
cd "$(dirname "$0")/../.." || exit 2
command -v python3 >/dev/null || { echo "skipped: no python3"; exit 77; }
tools/proto-capture compare --jobs 2 --zinc "$ZINC" 2>&1 | grep -v '^ok' | tee /tmp/pixels.$$ | grep -q FAIL && { cat /tmp/pixels.$$; rm -f /tmp/pixels.$$; exit 1; }
rm -f /tmp/pixels.$$
