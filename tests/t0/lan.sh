#!/bin/sh
# zinc:lan (ZN-791, plugins/lan): polled UDP (with broadcast) and TCP on loopback, the same output from the plugin's library on this machine
# (native engine and interpreter) and from the console core built here with the headless HAL, which links lan.abi.cpp as the PSP, Vita and
# 3DS cores do (targets/console/stubs.cpp): the export table and the calls with no host API are the consoles'.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
want=tests/golden/host/lan.out
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
unset ZINC_DETERMINISTIC   # tests/run's virtual clock stands still in the program's busy waits for the network: the real one
timeout 60 "$Z" run -q tests/golden/host/lan.ts > "$tmp/native" 2>&1; diff -q "$tmp/native" $want >/dev/null || { echo "zinc:lan: the native engine differs"; diff "$tmp/native" $want | head; fail=1; }
timeout 60 "$Z" run -q --interp tests/golden/host/lan.ts > "$tmp/interp" 2>&1; diff -q "$tmp/interp" $want >/dev/null || { echo "zinc:lan: the interpreter differs"; diff "$tmp/interp" $want | head; fail=1; }
command -v cmake >/dev/null 2>&1 || { [ $fail -eq 0 ] && echo "zinc:lan: ok (no cmake: the console core is not tried)"; exit $fail; }
B=${ZN_CONSOLE_BUILD:-build/console-pure}
{ [ -f "$B/CMakeCache.txt" ] || cmake -S targets/console -B "$B" -DZN_CONSOLE_GFX=OFF; } >"$tmp/build.log" 2>&1 && cmake --build "$B" -j 4 >>"$tmp/build.log" 2>&1 || { echo "zinc:lan: the console core does not build"; tail -20 "$tmp/build.log"; exit 1; }
"$Z" --emit=zbc-bin tests/golden/host/lan.ts "$tmp/lan.zbc" >"$tmp/compile.log" 2>&1 || { echo "zinc:lan: no ZBC"; head "$tmp/compile.log"; exit 1; }
(cd "$tmp" && timeout 60 "$OLDPWD/$B/zinc-core" lan.zbc 2>&1 | sed '1d;$d') > "$tmp/core"
diff -q "$tmp/core" $want >/dev/null || { echo "zinc:lan: the console core differs"; diff "$tmp/core" $want | head; fail=1; }
[ $fail -eq 0 ] && echo "zinc:lan: ok"
exit $fail
