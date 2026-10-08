#!/bin/sh
# Standards conformance gate (ZN-139): tests/compat/run.mjs runs the pinned test262 / WPT / quickjs / Node API sets on the new engine (typed `next` and plain-JS `next-qjs`)
# and fails when a test of tests/compat/baseline.json stops passing. Needs node and the pinned sources (fetched into tests/compat/cache on first use, about 400 MB).
cd "$(dirname "$0")/../.." || exit 2
command -v node >/dev/null || { echo "compat: node is needed for the harness"; exit 1; }
out=$(node ../tests/compat/run.mjs --engines next,next-qjs --jobs 8 --check --zinc-next "$ZINC" 2>&1) ; rc=$?
echo "$out" | grep -E 'REGRESSION|compat check' | head -20
exit $rc
