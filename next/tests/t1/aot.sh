#!/bin/sh
# AOT (ZN-022): fib, nbody, binarytrees and sort build to native programs whose output is the frozen one, and the programs of
# tests/golden/run behave the same compiled as interpreted (output and exit code).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for k in fib nbody binarytrees sort; do
  "$ZINC" build ../tests/bench/kernels/$k.ts -o "$tmp/$k" 2>"$tmp/err" || { echo "aot build failed: $k: $(head -c 200 "$tmp/err")"; fail=1; continue; }
  "$tmp/$k" 2>&1 | diff -q - corpus/bench/$k.out >/dev/null || { echo "aot output differs: $k"; fail=1; }
done
for f in tests/golden/run/library.ts tests/golden/run/exceptions.ts tests/golden/run/async.ts tests/golden/run/dyn_values.ts tests/golden/run/records.ts tests/golden/run/const_globals.ts; do
  k=$(basename "$f" .ts)
  "$ZINC" build "$f" -o "$tmp/$k" 2>"$tmp/err" || { echo "aot build failed: $k: $(head -c 200 "$tmp/err")"; fail=1; continue; }
  "$tmp/$k" 2>&1 | diff -q - "tests/golden/run/$k.out" >/dev/null || { echo "aot output differs: $k"; fail=1; }
done
# ZN-144: numeric functions compile to C functions with typed parameters (no register window, a stack-pointer check instead of a depth counter): fib is typed, and a typed
# recursion without end stops with the same message as the interpreter's
"$ZINC" --emit=cpp ../tests/bench/kernels/fib.ts | grep -q "^ZFN Slot t1(Machine& m, Slot a0)" || { echo "fib is not compiled with typed parameters"; fail=1; }
printf 'function f(n: i32): i32 { return f(n + 1) + 1; }\nconsole.log("start");\nconsole.log(f(0));\n' > "$tmp/so.ts"
"$ZINC" build "$tmp/so.ts" -o "$tmp/so" 2>/dev/null; "$tmp/so" > "$tmp/so.a" 2>&1; ca=$?
"$ZINC" run "$tmp/so.ts" > "$tmp/so.i" 2>&1; ci=$?
[ $ca -eq $ci ] && cmp -s "$tmp/so.a" "$tmp/so.i" && grep -q "stack overflow" "$tmp/so.a" || { echo "typed recursion without end: AOT (exit $ca) and interpreter (exit $ci) disagree"; fail=1; }
# ZN-604: a large program is compiled as several units at once (ZN_AOT_PART_BYTES splits small ones): calls, virtual calls and handlers across units
for k in exceptions library; do
  ZN_AOT_PART_BYTES=3000 ZN_KEEP_CPP=1 "$ZINC" build tests/golden/run/$k.ts -o "$tmp/u$k" 2>"$tmp/err" || { echo "split aot build failed: $k: $(head -c 200 "$tmp/err")"; fail=1; continue; }
  [ -f "$tmp/u$k.part2.cpp" ] || { echo "$k was not split into units"; fail=1; }
  "$tmp/u$k" 2>&1 | diff -q - "tests/golden/run/$k.out" >/dev/null || { echo "split aot output differs: $k"; fail=1; }
done
# ZN-146: a compiled program does not replace the global operator new (dyld would bind it across libc++ at every launch: 3 ms and 8 MB for a program that prints one line); the heap budget of a profile needs it
echo 'console.log(1);' > "$tmp/one.ts"
"$ZINC" build "$tmp/one.ts" -o "$tmp/one" 2>/dev/null; nm "$tmp/one" 2>/dev/null | grep -q " T __Znwm" && { echo "a compiled program replaces the global operator new"; fail=1; }
"$ZINC" build --profile esp32 "$tmp/one.ts" -o "$tmp/one_esp" 2>/dev/null; nm "$tmp/one_esp" 2>/dev/null | grep -q " T __Znwm" || { echo "a program built for a profile with a heap budget does not count the global allocations"; fail=1; }
exit $fail
