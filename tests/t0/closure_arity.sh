#!/bin/sh
# Deferred callbacks retain their lexical bindings and array-helper arity.
set -eu
cd "$(dirname "$0")/../.."
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf 'found\n' > "$tmp/main.expected"
printf 'found\nfound\nfound\ncaught\nself\n' > "$tmp/local.expected"
for source in main local; do
  for engine in interp native quickjs; do
    case $engine in interp) set -- --interp;; native) set -- --native;; quickjs) set -- --engine quickjs;; esac
    timeout 20 env ZINC_HEADLESS=1 ZINC_STEPS=0 "$ZINC" run "tests/data/closure_arity/$source.ts" "$@" >"$tmp/out" 2>"$tmp/err" || { cat "$tmp/err"; exit 1; }
    diff "$tmp/$source.expected" "$tmp/out"
  done
done
