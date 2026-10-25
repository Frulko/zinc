#!/bin/sh
cd "$(dirname "$0")/../.." || exit 2
ZINC=${ZINC:-build/zinc}
export ZINC
[ "$(uname)" = Darwin ] || { echo 'skipped: macOS Swift host'; exit 77; }
[ -f "${BUILD:-build}/zn_app.link" ] || { echo 'skipped: tools/build zn_app first'; exit 77; }
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
"$ZINC" check examples/swift-observatory || exit 1
ZN_AOT_CPP_ONLY=1 "$ZINC" build examples/swift-observatory -o "$t/scene" >"$t/build.log" 2>&1 || { tail -8 "$t/build.log"; exit 1; }
tools/link-embedded "$t/scene" "$t/smoke" examples/swift-observatory/native/Observatory.cpp examples/swift-observatory/native/Smoke.cpp || exit 1
ZINC_BACKGROUND=1 "$t/smoke"
