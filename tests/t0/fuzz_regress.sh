#!/bin/sh
# Fuzzing (ZN-147): every input libFuzzer once found a failure for (tests/fuzz/regress) is refused or accepted cleanly: no crash, no signal, no hang. A program is checked and compiled,
# a ZBC file is decoded and verified. The file name says which way: zbc-*.zbc, check-*.ts, parse-*.ts.
cd "$(dirname "$0")/../.." || exit 2
fail=0
for f in tests/fuzz/regress/*; do
  case "$f" in
    *.zbc) timeout 20 "$ZINC" zbc --check "$f" >/dev/null 2>&1 ;;
    *.ts) timeout 20 "$ZINC" --emit=zbc "$f" >/dev/null 2>&1 ;;
    *) continue ;;
  esac
  rc=$?
  [ $rc -ge 124 ] && { echo "$f: exit $rc (a crash, a signal or a hang)"; fail=1; }
done
# the files that must be refused, not just survived
"$ZINC" zbc --check tests/fuzz/regress/zbc-class-flags.zbc >/dev/null 2>&1 && { echo "zbc-class-flags.zbc is accepted: a class flag the encoder never writes"; fail=1; }
exit $fail
