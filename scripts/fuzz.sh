#!/usr/bin/env bash
# Fuzzes the parsers of untrusted input (tests/fuzz/*.cpp) with libFuzzer + ASan + UBSan, N seconds each.
#   scripts/fuzz.sh [seconds=60] [harness...]   fuzz (all harnesses by default); new inputs go to tests/fuzz/build
#   scripts/fuzz.sh --replay [harness...]       run the checked-in corpora once (regressions; no libFuzzer needed)
# A crash leaves tests/fuzz/build/crash-<harness>-*: reproduce with tests/fuzz/build/<harness> <file>, fix, and add the
# file to tests/fuzz/corpus/<harness>/ so --replay keeps it fixed. CXX picks the compiler (a clang with libFuzzer).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
F=$ROOT/tests/fuzz
OUT=$F/build
CXX=${CXX:-clang++}
replay=0 secs=60
if [[ ${1:-} == --replay ]]; then replay=1; shift; elif [[ ${1:-} =~ ^[0-9]+$ ]]; then secs=$1; shift; fi
if [[ $# -gt 0 ]]; then names=("$@"); else names=($(cd "$F" && ls *.cpp | grep -v '^main\.cpp$' | sed 's/\.cpp$//')); fi
mkdir -p "$OUT"

# plugin interfaces (zinc_native_*.h) and baked fonts (zinc_resources.cpp) for the harnesses
node "$ROOT/compiler/bin/zinc.mjs" build "$F/natives.ts" --target macos --emit=cpp >/dev/null
GEN=$F/build/natives-macos

fuzzer=-fsanitize=fuzzer
echo 'extern "C" int LLVMFuzzerTestOneInput(const unsigned char*, unsigned long) { return 0; }' > "$OUT/probe.cpp"
if ! "$CXX" -fsanitize=fuzzer "$OUT/probe.cpp" -o "$OUT/probe" 2>/dev/null; then
  [[ $replay == 1 ]] || { echo "fuzz: $CXX has no libFuzzer (set CXX to an LLVM clang); use --replay for the corpora"; exit 2; }
  fuzzer=""
fi
FLAGS=(-std=c++17 -g -O1 -fno-exceptions -fno-rtti -fwrapv -fno-omit-frame-pointer -fsanitize=address,undefined -fno-sanitize-recover=undefined
  -DZRT_DEBUG -DZRT_HEAP_BYTES=67108864u -DZRT_PLATFORM=\"fuzz\" -DZRT_POINT_POOL=262144
  -I"$ROOT/runtime" -I"$ROOT/runtime/include" -I"$GEN" -w)

# the runtime once, as a library (a harness that #includes one of these files overrides it: ttf)
lib=$OUT/libzrt-fuzz.a
if [[ ! -f $lib || -n $(find "$ROOT/runtime" "$ROOT/targets/null" "$ROOT/targets/common" "$GEN/zinc_resources.cpp" -newer "$lib" -name '*.[ch]*' | head -1) ]]; then
  objs=()
  for s in runtime/zrt.cpp runtime/host.cpp runtime/gfx.cpp runtime/raster.cpp runtime/ttf.cpp targets/null/hal_null.cpp targets/common/hal_posix.cpp; do
    o=$OUT/$(basename "$s" .cpp).o; "$CXX" "${FLAGS[@]}" -c "$ROOT/$s" -o "$o"; objs+=("$o")
  done
  "$CXX" "${FLAGS[@]}" -c "$GEN/zinc_resources.cpp" -o "$OUT/zinc_resources.o"; objs+=("$OUT/zinc_resources.o")
  rm -f "$lib"; ar rcs "$lib" "${objs[@]}"
fi

status=0
printf '%-10s %12s %10s  %s\n' harness execs seconds result
for n in "${names[@]}"; do
  libs=() max=4096
  case $n in
    http) libs=(-lcurl) ;;
    svg|lottie|gltf|map|image|ttf) max=65536 ;;
  esac
  exe=$OUT/$n
  if ! "$CXX" "${FLAGS[@]}" ${fuzzer:-"$F/main.cpp"} "$F/$n.cpp" "$lib" ${libs[@]+"${libs[@]}"} -o "$exe" 2>"$OUT/$n.build.log"; then
    status=1; printf '%-10s %12s %10s  %s\n' "$n" - - "BUILD FAILED (see $OUT/$n.build.log)"; continue
  fi
  seeds=$F/corpus/$n; mkdir -p "$seeds"
  log=$OUT/$n.log
  if [[ $replay == 1 ]]; then
    if [[ -n $fuzzer ]]; then "$exe" -runs=0 "$seeds" >"$log" 2>&1 || true; else "$exe" "$seeds" >"$log" 2>&1 || true; fi
  else
    work=$OUT/corpus/$n; mkdir -p "$work"
    "$exe" "$work" "$seeds" -max_total_time="$secs" -timeout=10 -rss_limit_mb=2048 -max_len=$max \
      -artifact_prefix="$OUT/crash-$n-" -print_final_stats=1 >"$log" 2>&1 || true
  fi
  execs=$(grep -o 'stat::number_of_executed_units: *[0-9]*' "$log" | grep -o '[0-9]*$' || true)
  [[ -n $execs ]] || execs=$(grep -Eo 'replayed [0-9]+|INITED|Done [0-9]+ runs' "$log" | tail -1 | grep -Eo '[0-9]+' || echo 0)
  took=$(grep -o 'Done [0-9]* runs in [0-9]* second' "$log" | grep -Eo 'in [0-9]+' | grep -Eo '[0-9]+' || echo -)
  if grep -qE 'ERROR: (AddressSanitizer|UndefinedBehaviorSanitizer|libFuzzer)|runtime error:|SUMMARY: ' "$log"; then
    status=1; printf '%-10s %12s %10s  %s\n' "$n" "$execs" "$took" "CRASH (see $log)"
  else printf '%-10s %12s %10s  %s\n' "$n" "$execs" "$took" ok; fi
done
exit $status
