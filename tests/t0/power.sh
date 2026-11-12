#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"${CXX:-c++}" -std=c++20 -Wall -Wextra -Werror -I"$root/src" "$root/tests/data/power/probe.cpp" -o "$tmp/probe"
"$tmp/probe"
python3 "$root/tests/data/power/fixtures.py" "$tmp/probe"
