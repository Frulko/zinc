#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
for mode in native pthread; do
  flags=
  [ "$mode" != pthread ] || flags="-DZN_PTHREAD_TLS -fno-threadsafe-statics"
  "${CXX:-c++}" -std=c++20 -Wall -Wextra -Werror -pthread $flags -I"$root/include" "$root/tests/unit/thread_local_test.cpp" -o "$tmp/$mode"
  "$tmp/$mode"
done
