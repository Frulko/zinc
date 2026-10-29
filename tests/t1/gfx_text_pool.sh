#!/bin/sh
# A frame's text pool grows past its first 32 KB (tests/data/gfx_text_pool): no "text pool is full" warning, and the string drawn after
# 36 KB of text shows (its frame differs from a blank one), on the interpreter and the compiled program.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_DETERMINISTIC=1 ZINC_FRAMES=2 ZINC_HEADLESS=1 ZINC_SCALE=1 ZINC_SIZE=120x40 ZINC_FRAMEHASH=last
blank=$(printf 'zinc: framehash' ) fail=0
for run in interp native; do
  out=$(ZINC_RUN=$run "$ZINC" run tests/data/gfx_text_pool 2>&1)
  case $out in *"text pool is full"*) echo "$run: text dropped: $out"; fail=1 ;; esac
  echo "$out" | grep -q "^$blank" || { echo "$run: no frame hash: $(echo "$out" | tail -c 300)"; fail=1; }
  echo "$out" | grep framehash >"$tmp/$run"
done
cmp -s "$tmp/interp" "$tmp/native" || { echo "the engines differ: $(cat "$tmp/interp") / $(cat "$tmp/native")"; fail=1; }
exit $fail
