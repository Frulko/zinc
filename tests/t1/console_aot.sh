#!/bin/sh
# A program compiled into the console core (ZN-480, tools/build-console-core --aot): the core built with this machine's compiler and the headless
# HAL, its program the C++ of `ZN_AOT_CPP_ONLY=1 zinc build` linked in place of the interpreter (targets/console/CMakeLists.txt ZN_CONSOLE_AOT).
# fib prints what `zinc run --interp` prints; bouncing-ball for 60 frames gives its output and last frame hash. The consoles' own builds (PSP,
# Vita, 3DS in their emulators) are in the task's notes: they need the SDKs and the emulators.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
command -v cmake >/dev/null 2>&1 || { echo "console aot: no cmake"; exit 77; }
B=${ZN_CONSOLE_BUILD:-build/console-core-aot}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$B/aot"
same() {   # same <name> <entry> <env>: the compiled program in the core prints what the interpreter prints
  rm -f "$B"/aot/program*
  [ ! -d "$B/CMakeFiles" ] || find "$B/CMakeFiles" -name 'program*.cpp.o' -delete   # make's one-second clock would keep the last program's object
  ZN_AOT_CPP_ONLY=1 "$Z" build "$2" -o "$B/aot/program" >"$tmp/$1.log" 2>&1 || { echo "console aot: zinc build $2 failed"; tail -5 "$tmp/$1.log"; fail=1; return; }
  { [ -f "$B/CMakeCache.txt" ] || cmake -S targets/console -B "$B" -DZN_CONSOLE_AOT="$PWD/$B/aot"; } >>"$tmp/$1.log" 2>&1 &&
    cmake --build "$B" -j 4 >>"$tmp/$1.log" 2>&1 || { echo "console aot: the core with $1 does not build"; grep -m 10 "error" "$tmp/$1.log"; fail=1; return; }
  want=$(env $3 ZINC_HEADLESS=1 "$Z" run --interp "$2" 2>&1 | grep -v "^  \|^zinc run")
  got=$(env $3 ZINC_HEADLESS=1 "$PWD/$B/zinc-core" 2>&1); rc=$?
  [ $rc -eq 0 ] && [ "$(echo "$got" | head -1)" = "zinc:start" ] && [ "$(echo "$got" | tail -1)" = "zinc:exit 0" ] || { echo "console aot: $1 exits $rc: $got" | head -5; fail=1; }
  [ "$(echo "$got" | sed '1d;$d')" = "$want" ] || { echo "console aot: $1 differs from zinc run --interp:"; echo "$got" | sed '1d;$d' | diff - "$(echo "$want" >"$tmp/want"; echo "$tmp/want")" | head -8; fail=1; }
}
same fib tests/bench/kernels/fib.ts ""
same bouncing-ball examples/bouncing-ball "ZINC_FRAMES=60 ZINC_FRAMEHASH=last"
[ $fail -eq 0 ] && echo "console aot: ok"
exit $fail
