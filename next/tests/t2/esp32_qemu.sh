#!/bin/sh
# M6 demo (ZN-030): `zinc run --target esp32 --qemu` runs programs on an emulated ESP32 (Espressif's QEMU, xtensa) that boots the core firmware of
# firmware/esp32/prebuilt. The emulator is downloaded and checked on first use (about 4 MB, kept in build/tc-home); nothing is installed by hand.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$PWD/build/tc-home"
printf "console.log('hello from an ESP32');\nlet s = 0;\nfor (let i = 0; i < 1000; i++) s += i;\nconsole.log(s);\n" > "$tmp/hello.ts"
[ "$("$ZINC" run "$tmp/hello.ts" --target esp32 --qemu 2>"$tmp/err")" = "hello from an ESP32
499500" ] || { echo "hello on the emulated ESP32 differs: $(tail -c 200 "$tmp/err")"; fail=1; }
"$ZINC" run tests/golden/run/library.ts --target esp32 --qemu 2>/dev/null | diff -q - tests/golden/run/library.out >/dev/null || { echo "library.ts differs on the emulated ESP32"; fail=1; }
printf "console.log('before');\nthrow new Error('boom');\n" > "$tmp/boom.ts"
"$ZINC" run "$tmp/boom.ts" --target esp32 --qemu >/dev/null 2>&1; [ $? -eq 101 ] || { echo "an uncaught exception does not end with 101 on the emulated ESP32"; fail=1; }
exit $fail
