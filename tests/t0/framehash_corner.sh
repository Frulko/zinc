#!/bin/sh
# A frame that does not cover the surface (ZN-675): the capture is read from zeroed memory, as the displays' surfaces are, so a program that
# paints only a corner gets the same frame hash at every run, on the interpreter and QuickJS, and the hash of the same corner on a cleared frame.
cd "$(dirname "$0")/../.." || exit 2
export ZINC_HEADLESS=1 ZINC_SIZE=64x48 ZINC_SCALE=1 ZINC_FRAMEHASH=last
hash() { timeout 30 "$ZINC" run "$@" 2>&1 | sed -n 's/^zinc: framehash [0-9]* [0-9x]* //p' | tail -1; }
d=tests/data/framehash_corner
want=$(hash --interp $d/cleared.ts)
[ -n "$want" ] || { echo "framehash_corner: no frame"; exit 1; }
for run in 1 2; do
  got=$(hash --interp $d/corner.ts)
  [ "$got" = "$want" ] || { echo "framehash_corner: run $run hashes $got, the cleared frame $want"; exit 1; }
done
got=$(hash $d/corner.ts --engine quickjs)
[ "$got" = "$want" ] || { echo "framehash_corner: QuickJS hashes $got, the cleared frame $want"; exit 1; }
exit 0
