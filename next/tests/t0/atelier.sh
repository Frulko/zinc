#!/bin/sh
# Zinc Atelier model (ZN-050): diagnostics parsing, the hottest functions of a folded profile, the phases of a ZINC_TRACE file, the project file list.
cd "$(dirname "$0")/../.." || exit 2
"$ZINC" run tests/golden/atelier/model.ts 2>&1 | diff -q - tests/golden/atelier/model.out >/dev/null || { echo "atelier model output differs from tests/golden/atelier/model.out"; exit 1; }
