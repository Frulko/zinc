#!/bin/sh
# A display-style bare hw.h include must invalidate both the stat stamp and content-key cache.
set -eu
cd "$(dirname "$0")/../.."
case $(uname -s) in Darwin) gc=-Wl,-dead_strip; dl= ;; Linux) gc=-Wl,--gc-sections; dl=-ldl ;; *) exit 77 ;; esac
build=${BUILD:-$(dirname "${ZINC:-build/zinc}")}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
c++ -std=c++20 -O0 -Wall -Wextra -Werror -ffunction-sections -fdata-sections \
  -Isrc -Iinclude -Ithird_party/yyjson -Ithird_party/sha256 \
  tests/native/buses_cache.cpp src/tc/plugin_build.cpp \
  "$build/libzn_tc.a" "$build/libzn_frontend.a" "$build/libzn_native.a" \
  "$build/libzn_i18n.a" "$build/libzn_yyjson.a" "$build/libzn_platform.a" \
  "$build/libzn_sha256.a" $gc $dl -o "$tmp/cache-test"
mkdir -p "$tmp/fixture/home"
unset ZINC_PLUGIN_NO_STAMP
ZINC_HOME="$tmp/fixture/home" ZINC_PLUGIN_CC=system \
  timeout 10 "$tmp/cache-test" "$PWD" "$tmp/fixture"
