#!/bin/sh
# The Mac half of Sidecar: app/sidecar/mac/build.sh [out] (default app/sidecar/mac/build/sidecar). Needs the Xcode command-line tools.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=${1:-$here/build/sidecar}
mkdir -p "$(dirname "$out")"
swiftc -O -import-objc-header "$here/CGVirtualDisplay.h" "$here/main.swift" -framework ScreenCaptureKit -framework CoreMedia -o "$out"
echo "built $out"
