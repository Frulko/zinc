#!/bin/sh
# Native SDK protocol regression; HERMES_CDP_LIBRARY can select an isolated patched SDK.
cd "$(dirname "$0")/../.." || exit 2
library=${HERMES_CDP_LIBRARY:-${HERMES:-$HOME/.zinc/sdk/hermes/current}/lib/libhermesvm.dylib}
[ -f "$library" ] || { echo "skip: no Hermes SDK (tools/hermes-pack)"; exit 77; }
exec timeout 15 python3 tests/hermes_cdp_check.py "$library"
