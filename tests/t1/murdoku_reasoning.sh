#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for engine in interp native quickjs; do
 case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
 ZINC_HEADLESS=1 "$ZINC" run tests/data/murdoku/reasoning.ts "$@" > "$t/out" 2>&1 || { cat "$t/out"; exit 1; }
 grep -q '^reasoning ok$' "$t/out"
done
echo 'murdoku reasoning: pairs/triples, rectangles, contradictions and contextual hints pass on all engines'
