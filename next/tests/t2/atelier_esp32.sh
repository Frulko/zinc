#!/bin/sh
# Zinc Atelier (ZN-050, ZN-728): with "ESP32 emulator" chosen, Run goes through `zinc run --target esp32 --qemu` and the console shows the program's output.
# Needs the emulator, downloaded and checked on first use (see esp32_qemu.sh).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="${ZINC_TEST_HOME:-$PWD/build/tc-home}"
g=tests/golden/atelier
# Provision the pinned emulator before its first-download diagnostics can enter the UI's output pane.
out=$("$ZINC" run "$g/proj/good.ts" --target esp32 --qemu 2>"$tmp/err"); rc=$?
[ "$rc" -eq 0 ] && [ "$out" = "hello from atelier" ] || { echo "atelier emulator setup failed: $out $(head -c 300 "$tmp/err")"; exit 1; }
# The session: choose the emulator in the Sketch menu, run; the program's line is in Atelier's console (echoed on its output).
printf '3 engine-esp32\n4 run\n' > "$tmp/session"
mkdir -p "$tmp/sketch"; cp "$g/proj/good.ts" "$tmp/sketch/main.ts"
out=$(ZINC_ATELIER_SYNC=1 ZINC_ATELIER_ECHO=1 ZINC_ATELIER_HOME="$tmp/home" ZINC_ATELIER_SCRIPT="$tmp/session" ZINC_SYSTEM_LOG=/dev/null ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=8 \
  "$ZINC" run app/atelier -- "$tmp/sketch" 2>"$tmp/err") || { echo "atelier esp32 failed: $(head -c 300 "$tmp/err")"; exit 1; }
echo "$out" | grep -q '^\[console\] hello from atelier' || { echo "atelier esp32: the program's output is not in the console: $(echo "$out" | tail -5)"; exit 1; }
