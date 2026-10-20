#!/bin/sh
BUILD=${BUILD:-build}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" assets cook examples/marble/assets/models/high/tree.glb psp30 -o "$tmp/a" >/dev/null 2>&1 || { echo "cook failed"; exit 1; }
"$ZINC" assets cook examples/marble/assets/models/high/tree.glb psp30 -o "$tmp/b" >/dev/null 2>&1 || { echo "cook2 failed"; exit 1; }
cmp -s "$tmp/a/psp30.zcook" "$tmp/b/psp30.zcook" || { echo "not byte-identical"; exit 1; }
cmp -s "$tmp/a/psp30.receipt.json" "$tmp/b/psp30.receipt.json" || { echo "receipt not identical"; exit 1; }
echo "PASS cook"