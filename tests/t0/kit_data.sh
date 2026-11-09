#!/bin/sh
# Stable visible-order selection, virtual navigation, editor transactions and async folder ownership in both UI models.
set -eu
cd "$(dirname "$0")/../.."
for engine in interp native quickjs; do
  case "$engine" in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  for model in kit-data kit-data-react kit-data-metric kit-data-surfaces; do
    got=$(ZINC_HEADLESS=1 ZINC_FRAMES=26 ZINC_SIZE=700x650 timeout 45 "$ZINC" run "tests/golden/$model" "$@" 2>&1) || { echo "$got"; exit 1; }
    case "$model" in kit-data) expected='data: ok';; kit-data-react) expected='data react: ok';; kit-data-metric) expected='data metric: ok';; *) expected='data surfaces: ok';; esac
    echo "$got" | rg -q "^$expected$" || { echo "$got"; exit 1; }
  done
done
echo 'kit data: ok'
