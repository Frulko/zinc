#!/bin/sh
# ZN-1077: an object seen as unknown with a field or method result of two classes checks and prints the same on the
# interpreter, AOT and QuickJS (its view generated a JSON writer that refused the union, reported at a wrong place).
set -eu
cd "$(dirname "$0")/../.."
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for engine in interp native quickjs; do
  case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
  "$ZINC" run tests/golden/run/dyn_union_view.ts "$@" > "$t/out"
  diff tests/golden/run/dyn_union_view.out "$t/out"
done
echo 'dyn union view: an unknown holding a union of classes checks and prints on three engines'
