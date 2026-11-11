#!/bin/sh
# POSIX process-family ownership, signals, leader exit, reap, shutdown and stale handles.
set -eu
cd "$(dirname "$0")/../.."
case $(uname -s) in Darwin|Linux) ;; *) exit 77 ;; esac
build=${BUILD:-$(dirname "${ZINC:-build/zinc}")}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
dl=
if [ "$(uname -s)" = Linux ]; then dl=-ldl; fi
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -pthread -Iinclude \
  tests/data/process_family/spawn.cpp $dl -o "$tmp/spawn"
timeout 10 "$tmp/spawn"
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -Wno-missing-field-initializers -pthread \
  -DZRT_HOSTED_CPP -DZN_NO_MIMALLOC -Iruntime -Iruntime/include -Iinclude -Ithird_party/libuv/include \
  tests/data/process_family/main.cpp src/host/loop.cpp src/host/osc.cpp \
  runtime/zrt.cpp runtime/host.cpp targets/null/hal_null.cpp targets/common/hal_posix.cpp \
  "$build/libzn_uv.a" $dl -o "$tmp/process-family"
timeout 15 "$tmp/process-family"
${CXX:-c++} -std=c++20 -Wall -Wextra -Werror -Iinclude -Isrc \
  tests/data/process_family/aot.cpp "$build/libzn_aot.a" "$build/libzn_zbc.a" \
  "$build/libzn_ir.a" "$build/libzn_frontend.a" "$build/libzn_native.a" \
  "$build/libzn_i18n.a" "$build/libzn_yyjson.a" "$build/libzn_regexp.a" -o "$tmp/aot"
timeout 3 "$tmp/aot"
