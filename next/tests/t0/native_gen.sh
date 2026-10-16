#!/bin/sh
# zinc native-gen (ZN-098): the header written from each of the 23 native specs of the repository equals the one the prototype's generator wrote
# (tests/golden/native_gen, whitespace normalised); the native-module example's sensor.host.cpp compiles against it unchanged; the C variant compiles as C99.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
while read -r hdr spec; do
  "$ZINC" native-gen "../$spec" "$tmp" >/dev/null 2>"$tmp/err" || { echo "native-gen fails on $spec: $(head -c 200 "$tmp/err")"; fail=1; continue; }
  diff -wB "$tmp/$hdr" "tests/golden/native_gen/$hdr" >/dev/null || { echo "$hdr differs from the prototype's header"; fail=1; }
done < tests/golden/native_gen/specs.lst
host=../examples/native-module/native/sensor.host.cpp
"${CXX:-c++}" -std=c++20 -fsyntax-only -w -I "$tmp" -I ../runtime -I ../runtime/include "$host" || { echo "sensor.host.cpp does not compile against the generated header"; fail=1; }
"$ZINC" native-gen --c ../examples/native-module/native/sensor.spec.ts "$tmp" >/dev/null 2>&1 || { echo "no C header for the sensor spec"; fail=1; }
printf '#include "zinc_native_sensor_abi.h"\n' > "$tmp/c.c"
cc -std=c99 -Wall -Wextra -Werror -pedantic -fsyntax-only -I include -I "$tmp" "$tmp/c.c" || { echo "the C header does not compile"; fail=1; }
"$ZINC" native-gen --c ../plugins/script/native/quickjs.spec.ts "$tmp" >/dev/null 2>&1 && { echo "a spec with callbacks got a C header"; fail=1; }
"$ZINC" native-gen --thunk ../plugins/sqlite/native/sqlite.spec.ts "$tmp" >/dev/null 2>&1 && grep -q "zn_module_Sqlite" "$tmp/zinc_native_sqlite_thunk.cpp" || { echo "no thunk for the sqlite spec"; fail=1; }
"$ZINC" native-gen --thunk ../plugins/script/native/quickjs.spec.ts "$tmp" >/dev/null 2>&1 && { echo "a spec with unknown members got a thunk"; fail=1; }
# the phone glue (ZN-628): the Java interface and JNI bridge, the Objective-C and Swift protocols and the Objective-C++ bridge of the fixture's spec
# equal tests/golden/native_gen/mobile (UPDATE=1 rewrites them); on macOS the bridge compiles against Foundation; a spec with arrays is refused
spec=tests/data/mobile-plugin/plugins/beep/native/beep.spec.ts
mkdir -p "$tmp/m"
"$ZINC" native-gen --android "$spec" "$tmp/m" >/dev/null && "$ZINC" native-gen --ios "$spec" "$tmp/m" >/dev/null || { echo "native-gen --android/--ios fails on the beep spec"; fail=1; }
for f in BeepSpec.java zinc_native_beep_android.cpp ZincBeepSpec.h ZincBeepSpec.swift zinc_native_beep_ios.mm; do
  [ -n "$UPDATE" ] && cp "$tmp/m/$f" tests/golden/native_gen/mobile/
  diff -q "$tmp/m/$f" "tests/golden/native_gen/mobile/$f" >/dev/null || { echo "$f differs from tests/golden/native_gen/mobile"; fail=1; }
done
if [ "$(uname)" = Darwin ]; then
  "$ZINC" native-gen "$spec" "$tmp/m" >/dev/null
  "${CXX:-c++}" -std=c++17 -fsyntax-only -fobjc-arc -x objective-c++ -w -I "$tmp/m" -I ../runtime -I ../runtime/include -I src -I include -DZN_NATIVE_CLASS='"BeepModule"' "$tmp/m/zinc_native_beep_ios.mm" || { echo "the Objective-C++ bridge does not compile"; fail=1; }
fi
"$ZINC" native-gen --android ../plugins/sqlite/native/sqlite.spec.ts "$tmp" 2>"$tmp/err" >/dev/null && { echo "a spec with arrays got phone glue"; fail=1; }
grep -q "member 'bindBlob'" "$tmp/err" || { echo "the refusal does not name the member: $(cat "$tmp/err")"; fail=1; }
exit $fail
