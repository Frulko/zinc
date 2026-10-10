#!/bin/sh
# Shared constants live only in include/zn: no kMax* limit, ZN_ macro or Op enum is defined under src/, and both stubs include zn/limits.h.
# A macro is a directive at the start of a line: `#define ZN_` inside a string is text the engine writes (the GLSL preamble of a shader), not a constant of ours.
cd "$(dirname "$0")/../.." || exit 2
bad=$(grep -rnE 'constexpr[^=;]*kMax|^[[:space:]]*#[[:space:]]*define +ZN_|enum +(class +)?Op\b' src)
[ -z "$bad" ] || { echo "constant defined outside include/zn:"; echo "$bad"; exit 1; }
grep -q 'zn/limits.h' src/zbc/zbc.h && grep -q 'zn/limits.h' src/vm/vm.h || { echo "stubs must include zn/limits.h"; exit 1; }
"$ZINC" --version >/dev/null
