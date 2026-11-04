#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
ZINC_HEADLESS=1 ZINC_WEB=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=11 \
ZINC_INPUT=tests/data/webenv-touch/session.input \
"$ZINC" run tests/data/webenv-touch/session.js --engine quickjs > "$tmp/out" 2> "$tmp/err"
[ ! -s "$tmp/err" ] || { cat "$tmp/err"; exit 1; }
grep -q 'webenv_touch:.*PASS' "$tmp/out"
