#!/bin/sh
# Validated layout persistence/moves/reopen, caller-owned tab select/close/reorder and keyboard menu traversal.
set -eu
cd "$(dirname "$0")/../.."
for engine in interp quickjs; do
  case "$engine" in interp) set -- --interp;; quickjs) set -- --engine quickjs;; esac
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=12 timeout 20 "$ZINC" run tests/golden/kit-chrome "$@" 2>&1) || { echo "$got"; exit 1; }
  echo "$got" | rg -q '^chrome: ok$' || { echo "$got"; exit 1; }
done
echo 'kit chrome: ok'
