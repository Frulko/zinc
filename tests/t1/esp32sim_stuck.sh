#!/bin/sh
# A loop that never ends (firmware/esp32-mquickjs/main/main.c stuck_check, third_party/mquickjs/mqjs.c's zinc patch): in the ESP32 emulator
# a timer that loops forever at 6 s, past the 4.8 s the check simulates on the computer, is stopped by the firmware 10 s later with the
# program's file and line, and zinc run fails; on the computer, the same loop at the start of a program stops the check, which names it.
# Skipped without cargo (or ZINC_ESP32SIM) or zinc-mqjs. About 35 s: the board's 16 s and the check's 10 s.
cd "$(dirname "$0")/../.." || exit 2
[ -x "$(dirname "$ZINC")/zinc-mqjs" ] || { echo "needs zinc-mqjs beside zinc (tools/build zinc-mqjs)"; exit 77; }
[ -n "$ZINC_ESP32SIM" ] || command -v cargo >/dev/null || [ -x "$HOME/.cargo/bin/cargo" ] || { echo "needs cargo to build esp32sim (or ZINC_ESP32SIM)"; exit 77; }
T=$(mktemp -d) && trap 'rm -rf "$T"' EXIT
fail=0
printf 'let n = 0;\nsetTimeout(() => {\n  for (;;) n++;\n}, 6000);\n' > "$T/late.ts"
"$ZINC" run "$T/late.ts" --target esp32 --engine mquickjs --emulator --run-ms 22000 >"$T/out" 2>"$T/err" && { echo "zinc run did not fail on a stuck program"; fail=1; }
grep -q "mqjs: Error: the program kept the board 10 s" "$T/err" || { echo "the firmware did not stop the loop"; tail -5 "$T/err"; fail=1; }
grep -q "late.ts:3" "$T/out" "$T/err" || { echo "the stuck loop is not named by its file and line"; tail -8 "$T/err"; fail=1; }
printf 'let n = 0;\nfor (;;) n++;\n' > "$T/start.ts"
"$ZINC" check "$T/start.ts" --target esp32 --engine mquickjs >"$T/out" 2>&1 && { echo "the check did not fail on a stuck program"; fail=1; }
grep -q "kept the engine 10 s" "$T/out" && grep -q "start.ts:2" "$T/out" || { echo "the check did not name the stuck loop"; tail -8 "$T/out"; fail=1; }
exit $fail
