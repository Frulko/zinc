#!/bin/sh
# A function that keeps more than 256 values alive fails with a message that names the function and the limit (not "@f: function needs more than 256 registers").
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
{
  echo "let k = 1;"
  echo "function bigOne(): number {"
  i=0; while [ $i -lt 300 ]; do echo "  const v$i: number = Math.sqrt($i.5 + k);"; i=$((i + 1)); done
  printf "  return v0"; i=1; while [ $i -lt 300 ]; do printf " + v$i"; i=$((i + 1)); done; echo ";"
  echo "}"
  echo "console.log(bigOne());"
} > "$t/big.ts"
out=$(ZINC_HEADLESS=1 "$ZINC" run --interp "$t/big.ts" 2>&1); rc=$?
[ $rc -ne 0 ] || { echo "register_limit: a 300-value function ran"; exit 1; }
case "$out" in *"function 'bigOne' keeps more than 256 values alive"*) ;; *) echo "register_limit: message: $out"; exit 1 ;; esac
echo "register_limit: ok"
