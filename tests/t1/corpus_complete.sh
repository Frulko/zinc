#!/bin/sh
# M0 demo: every frozen conformance output has its source program, and the bench set is complete. No Node needed.
cd "$(dirname "$0")/../.." || exit 2
for f in corpus/conformance/*.out; do
  n=$(basename "$f" .out)
  [ -e ../tests/conformance/"$n".ts ] || [ -e ../tests/conformance/"$n".tsx ] || [ -e ../tests/conformance/"$n".js ] || { echo "no source for $n"; exit 1; }
done
[ "$(ls corpus/bench/*.out | wc -l)" -eq "$(ls ../tests/bench/kernels/*.ts | wc -l)" ] || { echo "bench kernels missing"; exit 1; }
[ -s corpus/ui/clock-20.png ]
