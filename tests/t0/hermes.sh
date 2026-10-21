#!/bin/sh
# The Hermes engine (ZN-773.07): the checks of tests/t0/jsc.sh on `--engine hermes`. Skipped when this build has no libzn_engine_hermes (no
# Hermes SDK in ~/.zinc/sdk/hermes: tools/hermes-pack).
[ -f "$(dirname "$ZINC")/libzn_engine_hermes.dylib" ] || { echo "skip: no libzn_engine_hermes beside zinc (tools/hermes-pack, then build)"; exit 0; }
exec sh "$(dirname "$0")/jsc.sh" hermes
