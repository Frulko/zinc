#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
for engine in interp native quickjs; do
 case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
 for fixture in nested_defaults defaults_pack; do
  "$ZINC" run "tests/golden/run/$fixture.ts" "$@" > "$t/out"
  diff "tests/golden/run/$fixture.out" "$t/out"
 done
done
echo 'nested defaults: closures, aliases, fresh arrays, prior parameters and explicit zero pass'
