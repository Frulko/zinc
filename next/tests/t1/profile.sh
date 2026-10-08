#!/bin/sh
# Target profiles (ZN-120): `--profile esp32` makes `number` an f32 on the host interpreter, so the conformance programs print the .f32.out of the target; a program that holds
# more than the profile's heap stops with the target's "out of memory (heap budget N bytes)"; zinc.json "profile" does the same without the flag.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
# the conformance programs of the profile that run on the host alone (the others need the network, plugins or the old simulator's file-system messages)
for n in tour clock array_search async string_number_edges conversions literal_member_arrays features generic_static regressions regressions2 dyn dyn_literals clock_frames hardening canvas2d scene3d ink lottie fetch_web three; do
  [ -f ../tests/conformance/$n.f32.out ] || continue
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run --profile esp32 ../tests/conformance/$n.ts 2>&1 | diff -q - ../tests/conformance/$n.f32.out >/dev/null || { echo "$n: --profile esp32 does not print $n.f32.out"; fail=1; }
done
# fixed point (ZN-121): the fx12 corpus type-checks under --profile ps1 and prints the .fx12.out goldens (the programs that need the network, a plugin or the old simulator's wording excepted)
for f in ../tests/conformance/*.fx12.out; do
  n=$(basename "$f" .fx12.out)
  [ -f ../tests/conformance/$n.ts ] || continue
  [ "$n" = string_number_edges ] && continue   # its Math.max() is the Z4001 case (tests/golden/checker/errors/fixed_max_empty.ts)
  ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run --profile ps1 ../tests/conformance/$n.ts 2>&1 | grep -q "error Z" && { echo "$n: --profile ps1 does not type-check"; fail=1; }
done
for n in tour clock async array_search conversions literal_member_arrays features generic_static regressions regressions2 dyn dyn_literals hardening canvas2d scene3d ink lottie errors path pinball_physics shapes signals clock_frames dyn_unknown; do
  [ -f ../tests/conformance/$n.fx12.out ] || continue
  out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 "$ZINC" run --profile ps1 ../tests/conformance/$n.ts 2>"$tmp/err"); code=$?
  { [ -n "$out" ] && printf '%s\n' "$out"; if [ $code -ne 0 ]; then printf '[exit %s] %s\n' "$code" "$(cat "$tmp/err")"; else cat "$tmp/err"; fi; } | diff -q - ../tests/conformance/$n.fx12.out >/dev/null || { echo "$n: --profile ps1 does not print $n.fx12.out"; fail=1; }
done
cat > "$tmp/oom.ts" <<'T'
const keep: number[][] = [];
for (let i = 0; i < 100000; i++) { const a: number[] = []; for (let j = 0; j < 100; j++) a.push(j); keep.push(a); }
console.log('survived', keep.length);
T
out=$("$ZINC" run --profile esp32 "$tmp/oom.ts" 2>&1); code=$?
case "$out" in *"out of memory (heap budget 163840 bytes"*) ;; *) echo "no heap overflow under --profile esp32: $out"; fail=1 ;; esac
[ "$code" -ne 0 ] || { echo "the heap overflow exits with 0"; fail=1; }
# ZN-229: the profile and its heap budget travel in the ZBC header and an AOT program enforces them
"$ZINC" --profile esp32 --emit=zbc "$tmp/oom.ts" 2>&1 | head -1 | grep -q "^profile esp32 heap 163840$" || { echo "the ZBC header does not carry the profile and its heap"; fail=1; }
if command -v c++ >/dev/null; then
  "$ZINC" build --profile esp32 "$tmp/oom.ts" -o "$tmp/oom_aot" >/dev/null 2>&1 || "$ZINC" build "$tmp/oom.ts" -o "$tmp/oom_aot" --profile esp32 >/dev/null 2>&1
  out=$("$tmp/oom_aot" 2>&1); code=$?
  case "$out" in *"out of memory (heap budget 163840 bytes"*) ;; *) echo "an AOT program built with --profile esp32 does not enforce the heap: $out"; fail=1 ;; esac
  [ "$code" -ne 0 ] || { echo "the AOT heap overflow exits with 0"; fail=1; }
fi
[ "$("$ZINC" run "$tmp/oom.ts" 2>&1)" = "survived 100000" ] || { echo "the host's own profile limits the heap"; fail=1; }
# zinc.json "profile"
mkdir -p "$tmp/p"
printf '{ "name": "p", "entry": "main.ts", "profile": "esp32" }\n' > "$tmp/p/zinc.json"
printf 'console.log(0.1 + 0.2);\n' > "$tmp/p/main.ts"
[ "$("$ZINC" run "$tmp/p" 2>&1)" = "0.30000001192092896" ] || { echo "zinc.json profile esp32 does not make number an f32"; fail=1; }
printf 'console.log(0.1 + 0.2);\n' > "$tmp/h.ts"
[ "$("$ZINC" run "$tmp/h.ts" 2>&1)" = "0.30000000000000004" ] || { echo "the default number is no longer f64"; fail=1; }
"$ZINC" run --profile nope "$tmp/h.ts" 2>&1 | grep -q "unknown profile 'nope'" || { echo "an unknown profile is not reported"; fail=1; }
exit $fail
