#!/bin/sh
# The portable core entry (ZN-455, targets/console/core_main.cpp) with the graphics host and the headless HAL, built with this machine's compiler: the
# program.zbc and resources.bin of `zinc pack` (examples/hello, examples/bouncing-ball for 60 frames) give the output and the frame hashes of
# `zinc run --interp`; a missing, invalid or truncated program.zbc says so and exits 2.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
command -v cmake >/dev/null 2>&1 || { echo "console core: no cmake"; exit 77; }
B=${ZN_CONSOLE_BUILD:-build/console-core}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
{ [ -f "$B/CMakeCache.txt" ] || cmake -S targets/console -B "$B"; } >"$tmp/build.log" 2>&1 && cmake --build "$B" -j 4 >>"$tmp/build.log" 2>&1 || { echo "console core: the core does not build"; tail -20 "$tmp/build.log"; exit 1; }
core=$PWD/$B/zinc-core
same() {   # same <example>: the packed program on the core prints what zinc run prints, frame hashes included
  mkdir -p "$tmp/$1"
  "$Z" pack "../examples/$1" -o "$tmp/$1.zapp" >/dev/null 2>&1 && tar -xf "$tmp/$1.zapp" -C "$tmp/$1" program.zbc || { echo "console core: zinc pack $1 failed"; fail=1; return; }
  tar -xf "$tmp/$1.zapp" -C "$tmp/$1" resources.bin 2>/dev/null
  want=$(cd "../examples/$1" && ZINC_HEADLESS=1 ZINC_FRAMES=60 ZINC_FRAMEHASH=last "$Z" run --interp . 2>&1 | grep -v "^  \|^zinc run")
  got=$(ZINC_HEADLESS=1 ZINC_FRAMES=60 ZINC_FRAMEHASH=last "$core" "$tmp/$1/program.zbc" 2>&1); rc=$?
  [ $rc -eq 0 ] || { echo "console core: $1 exits $rc: $got"; fail=1; }
  [ "$(echo "$got" | head -1)" = "zinc:start" ] && [ "$(echo "$got" | tail -1)" = "zinc:exit 0" ] || { echo "console core: $1 is not framed by zinc:start / zinc:exit 0"; fail=1; }
  [ "$(echo "$got" | sed '1d;$d')" = "$want" ] || { echo "console core: $1 differs from zinc run:"; echo "$got" | sed '1d;$d' | diff - "$(echo "$want" >"$tmp/want"; echo "$tmp/want")" | head -8; fail=1; }
}
same hello
same bouncing-ball
refused() {   # refused <file> <what the message says>
  out=$("$core" "$1" 2>&1); rc=$?
  [ $rc -eq 2 ] || { echo "console core: $1 exits $rc, wanted 2"; fail=1; }
  echo "$out" | grep -q "$2" || { echo "console core: $1: no '$2' in: $out"; fail=1; }
  [ "$(echo "$out" | tail -1)" = "zinc:exit 2" ] || { echo "console core: $1 does not end with zinc:exit 2"; fail=1; }
}
refused "$tmp/none.zbc" "cannot read $tmp/none.zbc"
printf 'this is not bytecode' > "$tmp/junk.zbc"
refused "$tmp/junk.zbc" "zinc: $tmp/junk.zbc: "
head -c 200 "$tmp/bouncing-ball/program.zbc" > "$tmp/cut.zbc"
refused "$tmp/cut.zbc" "zinc: $tmp/cut.zbc: "
[ $fail -eq 0 ] && echo "console core: ok"
exit $fail
