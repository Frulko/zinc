#!/bin/sh
# The V8 engine (ZN-773.05): the checks of tests/t0/jsc.sh on `--engine v8`. Skipped when this build has no libzn_engine_v8 (no V8 pack in
# ~/.zinc/sdk/v8: tools/v8-pack).
[ -f "$(dirname "$ZINC")/libzn_engine_v8.dylib" ] || [ -f "$(dirname "$ZINC")/libzn_engine_v8.so" ] || { echo "skip: no libzn_engine_v8 beside zinc (tools/v8-pack, then build)"; exit 0; }
exec sh "$(dirname "$0")/jsc.sh" v8
