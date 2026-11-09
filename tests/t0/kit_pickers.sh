#!/bin/sh
# Civil-date boundaries and real picker keyboard paths in both UI models.
set -eu
cd "$(dirname "$0")/../.."
tools/gen-picker-emoji --check
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  for model in kit-pickers kit-pickers-react; do
    ZINC_HEADLESS=1 ZINC_SIZE=1400x1400 ZINC_FRAMES=17 timeout 30 "$ZINC" run "tests/golden/$model" "$@" > "$tmp/log" 2>&1 || { cat "$tmp/log"; exit 1; }
    rg -q '^pickers( react)?: ok$' "$tmp/log" || { cat "$tmp/log"; exit 1; }
  done
done
echo 'kit pickers: ok'
