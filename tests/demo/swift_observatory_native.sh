#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
app="$root/examples/swift-observatory/build/Native Observatory.app/Contents/MacOS/Observatory"
[ -x "$app" ] || { echo 'Build examples/swift-observatory/build.sh first'; exit 77; }
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
capture=${ZINC_CAPTURE:-$tmp/observatory.png}
ZINC_BACKGROUND=1 timeout 35 "$app" --smoke --capture "$capture"
[ -s "$capture" ]
