#!/bin/sh
# zinc:net (ZN-087): the server and the client of zinc:net talk on loopback inside one program: bodies of 1 MiB, chunked transfer, redirects, limits, errors.
cd "$(dirname "$0")/../.." || exit 2
timeout 60 "$ZINC" run tests/golden/host/net.ts 2>&1 | diff - tests/golden/host/net.out >/dev/null || { echo "zinc:net output differs from tests/golden/host/net.out"; exit 1; }
