#!/bin/sh
# Every example entry runs headless and its status is the one tests/examples.lst records (ZN-079): an entry that was OK and is not any more, or one that
# was listed as failing and now passes, fails this test, so progress and regressions both have to go into the list (tools/examples-status --write-list).
cd "$(dirname "$0")/../.." || exit 2
ZINC_BIN="${ZINC:-build/zinc}"
case "$ZINC_BIN" in /*) ;; *) ZINC_BIN="$PWD/$ZINC_BIN" ;; esac
out=$(tools/examples-status --check --zinc "$ZINC_BIN" 2>&1); rc=$?
[ $rc -eq 0 ] || { echo "$out" | grep -E "^(NEW|REGRESSED|UNEXPECTED|CHANGED|MISSING|INCOMPLETE)"; exit 1; }
