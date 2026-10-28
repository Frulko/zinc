#!/bin/sh
# Native records (ZN-850, include/zn/rec.h): the plugin of tests/data/records-plugin returns a record, a list of records with a nested and an optional
# record, a promise of records (encoded on a worker thread with the generated structs), and takes records; Old and New are one record before and after
# a trailing field, written by one side and read by the other (the engines' decoders and the generated C++ structs). The interpreter, the compiled
# program and QuickJS print the same lines; the strict profile refuses a record with a diagnostic that says why.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null || { echo "skipped: no C++ compiler for the plugin"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
p=tests/data/records-plugin
cat > "$tmp/want" <<'OUT'
track 0 0 4000000000 false 64x48 a0+b 2 -
track 0 0 4000000000 false 64x48 a0+b 2 -
track 1 1000.5 4000000001 true no art a1+b 2 é ok
track 2 2001 4000000002 false 192x48 a2+b 2 -
given 12 3 fav art 9 tags 1 cover 3 note hi
track 2 2001 4000000002 - art 192 tags 2 cover 2 no-note
3 track 0! 0 4000000000 false 64x48 a0+b 2 - track 1! 1000.5 4000000001 true no art a1+b 2 é ok
evolution 7 8 [] 5 6 []
later 2 track 1 1000.5 4000000001 true no art a1+b 2 é ok
OUT
ZINC_NATIVE=real "$ZINC" run --interp "$p" 2>"$tmp/err" | diff - "$tmp/want" >"$tmp/d" || { echo "native_records: the interpreter differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
ZINC_NATIVE=real "$ZINC" run "$p" --engine quickjs 2>"$tmp/err" | diff - "$tmp/want" >"$tmp/d" || { echo "native_records: QuickJS differs: $(head -c 400 "$tmp/d") $(tail -c 300 "$tmp/err")"; fail=1; }
if ZINC_NATIVE=real "$ZINC" build "$p" -o "$tmp/prog" >"$tmp/build.log" 2>&1; then
  "$tmp/prog" 2>&1 | diff - "$tmp/want" >"$tmp/d" || { echo "native_records: the compiled program differs: $(head -c 400 "$tmp/d")"; fail=1; }
else echo "native_records: the program does not build: $(tail -c 400 "$tmp/build.log")"; fail=1; fi
ZINC_NATIVE=real "$ZINC" check "$p" --profile esp32 2>&1 | grep -q "the result of 'first' is a record: records cross as Dyn values, which the strict profile 'esp32' has not" \
  || { echo "native_records: the strict profile does not refuse a record clearly"; fail=1; }
exit $fail
