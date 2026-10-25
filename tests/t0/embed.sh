#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
BUILD=${BUILD:-build}
Z=${ZINC:-$BUILD/zinc}
[ -f "$BUILD/zn_app.link" ] || { echo 'skipped: tools/build zn_app first'; exit 77; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
ZN_AOT_CPP_ONLY=1 "$Z" build tests/data/embed/scene.ts -o "$t/scene" >"$t/build.log" 2>&1 || { tail -8 "$t/build.log"; exit 1; }
tools/link-embedded "$t/scene" "$t/host" tests/data/embed/host.cpp || exit 1
ZINC_BACKGROUND=1 "$t/host"
