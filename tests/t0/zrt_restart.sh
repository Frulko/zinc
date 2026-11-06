#!/bin/sh
# The runtime after a crash-restart (ZRT_CRASH=2): redraws and job results work again in the restarted program (ZN-994,
# tests/native/zrt_restart.cpp). Built from runtime/zrt.cpp and the null HAL, no engine needed.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"${CXX:-c++}" -std=c++20 -DZRT_CRASH=2 -DZRT_HOSTED_CPP -DZN_NO_MIMALLOC -Iruntime -Iruntime/include -Iinclude \
  tests/native/zrt_restart.cpp runtime/zrt.cpp runtime/host.cpp targets/null/hal_null.cpp targets/common/hal_posix.cpp -o "$tmp/restart"
unset ZINC_DETERMINISTIC ZINC_RECORD ZINC_REPLAY   # a deterministic run draws no extra frames (zrt_redraw)
timeout 20 "$tmp/restart" 2>/dev/null
