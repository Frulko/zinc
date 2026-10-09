#!/bin/sh
# zinc export --target esp32 (ZN-326.02): the hello exported as core.bin + app.bin + flash.sh boots in Espressif's QEMU with no host attached: the core runs the program stored
# at 0x300000 and prints the same bytes as the native run. Skipped (77) when the pinned emulator is not downloaded yet (zinc run --target esp32 --qemu fetches it).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
Q=${ZINC_QEMU:-$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/qemu-xtensa-*/bin/qemu-system-xtensa 2>/dev/null | head -1)}
[ -n "$Q" ] && [ -x "$Q" ] || { echo "export_esp32: no pinned qemu-xtensa downloaded"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
"$Z" export ../examples/hello --target esp32 -o "$tmp/hello" >/dev/null || { echo "export_esp32: the export failed"; exit 1; }
for f in core.bin app.bin flash.sh README.txt; do [ -s "$tmp/hello/$f" ] || { echo "export_esp32: $f is missing"; fail=1; }; done
grep -q 'write-flash 0x0 core.bin 0x300000 app.bin' "$tmp/hello/flash.sh" || { echo "export_esp32: flash.sh does not write both images"; fail=1; }
"$Z" run ../examples/hello > "$tmp/native.out"
python3 tools/esp32-export-test "$Q" "$tmp/hello" "$tmp/native.out" || fail=1
python3 -c "print(\"console.log('\" + 'x' * 60000 + \"');\")" > "$tmp/big.ts"   # a 60 KB literal
"$Z" export "$tmp/big.ts" --target esp32 -o "$tmp/big" >/dev/null 2>&1 && { echo "export_esp32: a program over the core's 48 KB was exported"; fail=1; }
exit $fail
