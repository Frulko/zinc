#!/bin/sh
# Exact narrow tabs regression: both UI models, immediate and animated reveal, all engines.
set -eu
cd "$(dirname "$0")/../.."
for model in kit-tabs-reveal kit-tabs-reveal-react; do
  for engine in interp native quickjs; do
    case "$engine" in interp) set -- --interp;; native) set --;; quickjs) set -- --engine quickjs;; esac
    got=$(ZINC_HEADLESS=1 ZINC_SIZE=360x240 ZINC_FRAMES=70 timeout 30 "$ZINC" run "tests/golden/$model" "$@" 2>&1) || { echo "$model / $engine"; echo "$got"; exit 1; }
    echo "$got" | rg -q '^tabs reveal: ok$' || { echo "$model / $engine"; echo "$got"; exit 1; }
  done
done
echo 'kit tabs reveal: ok'
