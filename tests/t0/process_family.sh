#!/bin/sh
# POSIX process-family ownership, signals, leader exit, reap, shutdown and stale handles.
set -eu
cd "$(dirname "$0")/../.."
case $(uname -s) in Darwin|Linux) ;; *) exit 77 ;; esac
build=${BUILD:-$(dirname "${ZINC:-build/zinc}")}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -Wno-missing-field-initializers -pthread \
  -DZRT_HOSTED_CPP -DZN_NO_MIMALLOC -Iruntime -Iruntime/include -Iinclude -Ithird_party/libuv/include \
  tests/data/process_family/main.cpp src/host/loop.cpp src/host/osc.cpp \
  runtime/zrt.cpp runtime/host.cpp targets/null/hal_null.cpp targets/common/hal_posix.cpp \
  "$build/libzn_uv.a" -o "$tmp/process-family"
timeout 15 "$tmp/process-family"
