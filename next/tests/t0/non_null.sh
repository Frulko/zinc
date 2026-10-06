#!/bin/sh
# x! (ZN-061): the non-null type of x; a null reference traps with 'null reference'; accepted on non-null types like tsc.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf "class A { n: number = 4 }\nfunction f(a: A | null): number { return a!.n }\nconsole.log(f(null))\n" > "$tmp/t.ts"
out=$("$ZINC" run "$tmp/t.ts" 2>&1); rc=$?
[ $rc -ne 0 ] && echo "$out" | grep -q "null reference" || { echo "x! on null does not trap (rc=$rc): $out"; exit 1; }
