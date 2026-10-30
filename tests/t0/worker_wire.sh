#!/bin/sh
# zinc:worker's typed wire (D173 bytes from and into the program's own objects): every type a message carries (number, i32, u32, boolean,
# string, u8[], arrays, nested arrays, T | null, records in records, optional fields) round-trips; a receiver with its own subset type skips
# the fields it lacks and gives defaults for the ones the sender lacks; a number is a whole message. The compiled build: tests/t1/worker_engines.sh.
cd "$(dirname "$0")/../.." || exit 2
ZINC_DETERMINISTIC=1 ZINC_HEADLESS=1 timeout 60 "$ZINC" run --interp tests/data/worker_wire/main.ts 2>/dev/null | diff -u tests/data/worker_wire/expected.out - || { echo "worker_wire output differs"; exit 1; }
