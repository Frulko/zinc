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
exit $fail
