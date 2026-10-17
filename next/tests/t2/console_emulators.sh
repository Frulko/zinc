#!/bin/sh
# The console runners (ZN-457, tools/console-run): the pure console core with a one-line program, built with each pinned SDK
# (tools/build-console-core), prints its line through PPSSPPHeadless (psp), Vita3K (vita), PCSX2 or Play! (ps2) and Azahar (n3ds) within 60 s;
# a program that never ends is stopped by the timeout (124, and it says so); a missing emulator exits 77 and names it. T2: windowed emulators
# (started in the background, never in front) and up to four SDK builds; run alone, after integration. A console whose SDK or emulator is
# missing is skipped and named.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}; case $Z in /*) ;; *) Z=$PWD/$Z ;; esac
export ZINC="$Z"
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0; ran=0
printf "import { platform } from 'zinc:sys';\nconsole.log('hello from zinc on ' + platform());\n" > "$tmp/hello.ts"
printf "let n = 0;\nwhile (n >= 0) { n = (n + 1) %% 1000; }\nconsole.log('never');\n" > "$tmp/hang.ts"
"$Z" --emit=zbc-bin "$tmp/hello.ts" "$tmp/hello.zbc" >/dev/null 2>&1 && "$Z" --emit=zbc-bin "$tmp/hang.ts" "$tmp/hang.zbc" >/dev/null 2>&1 || { echo "console emulators: the programs do not compile"; exit 1; }
for c in psp vita ps2 n3ds; do
  out=$(tools/build-console-core "$c" --pure --embed "$tmp/hello.zbc" -B "build/console-test-$c" 2>&1) || { echo "console emulators: skip $c (no core: $(echo "$out" | tail -1))"; continue; }
  bin=$(echo "$out" | tail -1)
  got=$(tools/console-run "$c" "$bin" --timeout 60 2>&1); rc=$?
  [ $rc -eq 77 ] && { echo "console emulators: skip $c ($got)"; continue; }
  ran=$((ran + 1))
  [ $rc -eq 0 ] && [ "$got" = "hello from zinc on $c" ] || { echo "console emulators: $c exits $rc: $got"; fail=1; }
done
[ $ran -gt 0 ] || { echo "console emulators: no console could run"; exit 77; }
# a hung program on the PSP: stopped at the timeout, with a clear message
if out=$(tools/build-console-core psp --pure --embed "$tmp/hang.zbc" -B build/console-test-psp-hang 2>&1); then
  got=$(tools/console-run psp "$(echo "$out" | tail -1)" --timeout 5 2>&1); rc=$?
  [ $rc -eq 124 ] && echo "$got" | grep -q "did not finish in 5 s" || { echo "console emulators: a hung program exits $rc: $got"; fail=1; }
fi
got=$(tools/console-run ps2 "$tmp/hello.zbc" --emu nothing 2>&1); rc=$?
[ $rc -eq 77 ] && echo "$got" | grep -q "no nothing" || { echo "console emulators: a missing emulator exits $rc: $got"; fail=1; }
[ $fail -eq 0 ] && echo "console emulators: ok ($ran consoles)"
exit $fail
