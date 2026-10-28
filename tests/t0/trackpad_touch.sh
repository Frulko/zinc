#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
${CXX:-c++} -std=c++17 -Wall -Wextra -Werror -I. tests/native/trackpad_touch.cpp -o "$tmp/trackpad"
"$tmp/trackpad"
