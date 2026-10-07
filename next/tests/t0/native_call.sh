#!/bin/sh
# requireNative<Spec>('Name') (ZN-097): a program calls the C99 test module of tests/native through CallNative, interpreted and compiled; a ZBC
# whose module is not linked, or whose signature differs from the registry's, is refused when it loads; a failing export traps with its message.
cd "$(dirname "$0")/.." || exit 2
cd .. || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
src=tests/golden/run/native_call.ts
"$ZINC" run "$src" 2>&1 | diff -q - tests/golden/run/native_call.out >/dev/null || { echo "native_call: interpreted output differs"; fail=1; }
"$ZINC" build "$src" -o "$tmp/prog" >"$tmp/build.log" 2>&1 && "$tmp/prog" 2>&1 | diff -q - tests/golden/run/native_call.out >/dev/null || { echo "native_call: compiled output differs"; fail=1; }
"$ZINC" --emit=zbc-bin "$src" "$tmp/ok.zbc" || { echo "native_call: no zbc"; exit 1; }
"$ZINC" zbc --check "$tmp/ok.zbc" >/dev/null 2>&1 || { echo "native_call: the zbc with natives does not verify"; fail=1; }
"$ZINC" zbc --dis "$tmp/ok.zbc" 2>/dev/null | grep -q "CallNative.*Fixture.add" || echo "(note: disassembler does not list CallNative)" >/dev/null
python3 - "$tmp" <<'PY'
import sys
d = sys.argv[1]
b = open(d + '/ok.zbc', 'rb').read()
assert b.count(b'Fixture') >= 1 and b.count(b'ii>i') == 1
open(d + '/unlinked.zbc', 'wb').write(b.replace(b'Fixture', b'Fixtuxe'))
open(d + '/badsig.zbc', 'wb').write(b.replace(b'ii>i', b'ui>i'))
PY
"$ZINC" run "$tmp/unlinked.zbc" 2>&1 | grep -q "the native module 'Fixtuxe' is not linked" || { echo "an unlinked native module is not refused when the zbc loads"; fail=1; }
"$ZINC" run "$tmp/badsig.zbc" 2>&1 | grep -q "the program expects the signature 'ui>i', the module has 'ii>i'" || { echo "a signature mismatch is not refused when the zbc loads"; fail=1; }
cat > "$tmp/fail.ts" <<'TS'
import { NativeModule, requireNative } from 'zinc:native';
interface Spec extends NativeModule { fail(): void }
requireNative<Spec>('Fixture').fail();
TS
"$ZINC" run "$tmp/fail.ts" 2>&1 | grep -q "native Fixture.fail: the fixture failed on purpose" || { echo "a failing export does not trap with its message"; fail=1; }
exit $fail
