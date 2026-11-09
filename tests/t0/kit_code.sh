#!/bin/sh
# Provider ownership, bounded diff reconstruction, JSON identity and actual keyboard/callbacks in both UI models.
set -eu
cd "$(dirname "$0")/../.."
for engine in interp native quickjs; do
  case "$engine" in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  for model in kit-code kit-code-react; do
    got=$(ZINC_HEADLESS=1 ZINC_FRAMES=17 ZINC_SIZE=700x1000 timeout 45 "$ZINC" run "tests/golden/$model" "$@" 2>&1) || { echo "$model ($engine)"; echo "$got"; exit 1; }
    case "$model" in kit-code) expected='code: ok';; *) expected='code react: ok';; esac
    echo "$got" | rg -q "^$expected$" || { echo "$model ($engine)"; echo "$got"; exit 1; }
    echo "$model ($engine): ok"
  done
done
echo 'kit code: ok'
