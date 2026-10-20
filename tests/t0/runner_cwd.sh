#!/bin/sh
# The runner resolves relative native test paths from next/, regardless of its caller's directory.
root=$(cd "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cd "$tmp" || exit 2
out=$("$root/tests/run" --only fixed 2>&1) || { echo "$out"; exit 1; }
echo "$out" | grep -q '^PASS fixed$' || { echo "$out"; exit 1; }
