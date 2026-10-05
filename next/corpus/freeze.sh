#!/bin/sh
# Regenerate next/corpus from the current tree and record a sha256 manifest. Needs Node (bench kernels run on the sim
# oracle); checking the result does not (tests/t0/corpus.sh). Re-run only after an intended change to the old compiler.
set -e
cd "$(dirname "$0")/.."
root=$(cd .. && pwd)
rm -rf corpus/conformance corpus/bench corpus/ui
mkdir -p corpus/conformance corpus/bench corpus/ui
# default-profile expected outputs of the conformance programs (profile variants are excluded)
for f in "$root"/tests/conformance/*.out; do
  case $f in *.1280x720.out|*.1620x2160.out|*.f32.out|*.fx12.out) continue ;; esac
  cp "$f" corpus/conformance/
done
# bench kernels: stdout of the sim run
for k in "$root"/tests/bench/kernels/*.ts; do
  (cd "$root/tests/bench/kernels" && node ../../../compiler/bin/zinc.mjs run "$(basename "$k")" --target sim 2>/dev/null) \
    > "corpus/bench/$(basename "$k" .ts).out"
done
# one UI frame: the clock pixel golden
cp "$root/tests/visual/clock-20.png" corpus/ui/
(cd corpus && find conformance bench ui -type f | LC_ALL=C sort | xargs shasum -a 256 > MANIFEST.sha256)
echo "froze $(wc -l < corpus/MANIFEST.sha256) files"
