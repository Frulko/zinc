#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
"${CXX:-c++}" -std=c++20 -Wall -Wextra -Werror -I"$root/src" "$root/tests/data/board/probe.cpp" -o "$tmp/probe"
"$tmp/probe" < "$root/tests/data/board/revisions.txt"
python3 "$root/tests/data/board/fixtures.py" "$tmp/probe"
if [ -n "${ZINC:-}" ]; then
  mkdir "$tmp/empty"
  out=$(ZINC_ROOT="$root" ZINC_HEADLESS=1 ZINC_BOARD_ROOT="$tmp/empty" "$ZINC" run "$root/tests/data/board/missing.ts" --interp 2>&1)
  echo "$out" | grep -Fx 'true true true true false false false false false false false false' >/dev/null || {
    echo "$out"
    exit 1
  }
fi
