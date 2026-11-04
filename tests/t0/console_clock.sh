#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
case $(uname -s) in Darwin) strip=-Wl,-dead_strip ;; *) strip=-Wl,--gc-sections ;; esac
"${CXX:-c++}" -std=c++20 -DZN_NO_MIMALLOC -Iinclude -Isrc -Iruntime/include \
  -ffunction-sections -fdata-sections tests/native/console_clock.cpp "$strip" -o "$tmp/clock"
"$tmp/clock"
