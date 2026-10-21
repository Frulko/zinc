#!/bin/sh
# Node-API on QuickJS-ng (ZN-773): the native check of third_party/node-api's patch (a callback's values freed on return, numbers read as Node does).
BUILD=${BUILD:-build}
cd "$(dirname "$0")/../.." || exit 2
[ -x "$BUILD/napi_test" ] || tools/build napi_test >/dev/null 2>&1 || { echo "napi_test does not build"; exit 1; }
"$BUILD/napi_test"
