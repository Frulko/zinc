#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
case $(uname) in Darwin) link=-Wl,-dead_strip ;; *) link=-Wl,--gc-sections ;; esac
"${CXX:-c++}" -std=c++20 -O2 -Wall -Wextra -Wno-missing-field-initializers -DZRT_HOSTED_CPP -ffunction-sections -fdata-sections \
  -I include -I runtime -I runtime/include "$link" tests/native/raster_scratch.cpp -o "$tmp/test"
"$tmp/test"
