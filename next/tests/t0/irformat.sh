#!/bin/sh
# IR text and ZBC formats (ZN-052, docs/ir-format.md): every golden dump reads back and dumps to the same text (`zinc ir --check`); the files of
# tests/compat, written by earlier versions, load or fail with a clear message; a malformed dump names its line.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for f in tests/golden/ir/*.ir tests/compat/ir-v1-fib.ir; do
  "$ZINC" ir --check "$f" >/dev/null 2>"$tmp/err" || { echo "ir --check fails on $f: $(head -c 200 "$tmp/err")"; fail=1; }
done
# a program with reference counting inserted reads back too
"$ZINC" --emit=ir-rc tests/golden/run/records.ts > "$tmp/rc.ir" 2>/dev/null && { "$ZINC" ir --check "$tmp/rc.ir" >/dev/null 2>&1 || { echo "ir --check fails on an ir-rc dump"; fail=1; }; }
# text before version 1 has no version line: refused with the way out
"$ZINC" ir --check tests/compat/ir-v0-fib.ir 2>&1 | grep -q "no version line" || { echo "a version 0 dump is not refused with a clear message"; fail=1; }
printf 'zir 2\n' > "$tmp/v2.ir"
"$ZINC" ir --check "$tmp/v2.ir" 2>&1 | grep -q "version 2 is not supported" || { echo "a newer text version is not refused with a clear message"; fail=1; }
sed 's/%1: i32 = const 2/%1: i32 = frobnicate 2/' tests/compat/ir-v1-fib.ir > "$tmp/bad.ir"
"$ZINC" ir --check "$tmp/bad.ir" 2>&1 | grep -q "line [0-9]*: unknown instruction" || { echo "a malformed dump does not name its line"; fail=1; }
# ZBC: the version 5 file of tests/compat loads and runs; version 4 (no natives table) and every other version are refused with a message
[ "$("$ZINC" run tests/compat/fib-v5.zbc 2>&1)" = "$("$ZINC" run ../tests/bench/kernels/fib.ts 2>&1)" ] || { echo "tests/compat/fib-v5.zbc does not run like its source"; fail=1; }
"$ZINC" zbc --check tests/compat/fib-v4.zbc 2>&1 | grep -q "version 4 is older than the supported version 5: rebuild" || { echo "the version 4 file is not refused as older"; fail=1; }
python3 - "$tmp" <<'PY'
import struct, sys
b = open('tests/compat/fib-v5.zbc', 'rb').read()
for v in (3, 9):
    open(f'{sys.argv[1]}/v{v}.zbc', 'wb').write(b[:4] + struct.pack('<I', v) + b[8:])
PY
"$ZINC" zbc --check "$tmp/v3.zbc" 2>&1 | grep -q "version 3 is older than the supported version 5: rebuild" || { echo "an older ZBC is not refused with a clear message"; fail=1; }
"$ZINC" zbc --check "$tmp/v9.zbc" 2>&1 | grep -q "version 9 is newer than the supported version 5" || { echo "a newer ZBC is not refused with a clear message"; fail=1; }
exit $fail
