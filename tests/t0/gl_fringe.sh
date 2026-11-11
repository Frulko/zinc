#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
${CXX:-c++} -std=c++17 -Wall -Wextra -Werror -Iruntime tests/native/gl_fringe.cpp -o "$tmp/gl_fringe"
"$tmp/gl_fringe"
