#!/bin/sh
# T2: the whole corpus (tests/golden/run, the M3 conformance set, the bench kernels) interpreted and compiled, compared with the frozen output.
cd "$(dirname "$0")/../.." || exit 2
tools/diff-matrix
