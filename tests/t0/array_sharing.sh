#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
d=tests/data/array_sharing
libs=$(cd "$(dirname "$ZINC")" && pwd)
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT HUP INT TERM
export ZINC_HEADLESS=1
timeout 10 "$ZINC" check "$d/main.ts" >/dev/null
timeout 10 "$ZINC" check "$d/refusal.ts" >/dev/null
for engine in interp native quickjs; do
  case $engine in interp) opts=--interp;; native) opts=--native;; quickjs) opts='--engine quickjs';; esac
  timeout 40 "$ZINC" run "$d/main.ts" $opts > "$tmp/$engine"
  diff -u "$d/expected.out" "$tmp/$engine"
done
for engine in interp native; do
  timeout 40 "$ZINC" run "$d/refusal.ts" --"$engine" > "$tmp/refusal"
  diff -u "$d/refusal.out" "$tmp/refusal"
done
timeout 10 "$ZINC" --emit=ir "$d/roundtrip.ts" > "$tmp/main.ir"
timeout 10 "$ZINC" ir --check "$tmp/main.ir" >/dev/null
# Malformed text is refused before declaration indices can overrun their tables.
printf 'zir 1\nclass A {}\nclass A {}\n' > "$tmp/duplicate.ir"
if timeout 10 "$ZINC" ir --check "$tmp/duplicate.ir" > "$tmp/bad" 2>&1; then echo 'duplicate IR declaration accepted'; exit 1; fi
grep -q 'duplicate class' "$tmp/bad"
cat > "$tmp/cast.ir" <<'IR'
zir 1
class Dog {}
func @main() -> void {
bb0:
  %0: ref Dog[] = arrnew ref Dog[]
  %1: i32[] = refcast %0
  ret
}
IR
if timeout 10 "$ZINC" ir --check "$tmp/cast.ir" > "$tmp/bad" 2>&1; then echo 'bad IR array cast accepted'; exit 1; fi
grep -q 'refcast needs' "$tmp/bad"
# A mixed numeric/reference or nested-array cast must not enter the IR.
for types in 'Dog[], i32[]' 'Dog[], Animal[][]'; do
  printf 'class Animal {} class Dog extends Animal {}\nconst a: %s = []; const b = a as %s;\n' "${types%,*}" "${types#*, }" > "$tmp/bad.ts"
  if timeout 10 "$ZINC" --emit=ir "$tmp/bad.ts" > "$tmp/bad" 2>&1; then echo 'unsafe array cast accepted'; exit 1; fi
  grep -q 'Z0103' "$tmp/bad"
done
# Handwritten, verified bytecode bypasses the source preflight helpers.
"${CXX:-c++}" -std=c++20 -I src -I include "$d/raw.cpp" "$libs/libzn_aot.a" "$libs/libzn_zbc.a" "$libs/libzn_codec.a" "$libs/libzn_webp_dec.a" "$libs/libzn_zstd.a" -o "$tmp/generate"
for kind in push set fill setRange badCast exact plain; do
  "$tmp/generate" "$kind" "$tmp/raw"
  timeout 10 "$ZINC" zbc --check "$tmp/raw.zbc" >/dev/null
  case $kind in badCast) error='invalid cast';; *) error='invalid array store';; esac
  if [ "$kind" = exact ] || [ "$kind" = plain ]; then
    timeout 10 "$ZINC" run "$tmp/raw.zbc" > "$tmp/out" 2> "$tmp/err"
    if [ "$kind" = exact ]; then printf 'false\ntrue\n'; else printf '1\n'; fi | diff -u - "$tmp/out"
  else
    if timeout 10 "$ZINC" run "$tmp/raw.zbc" > "$tmp/out" 2>&1; then echo 'raw VM unsafe store accepted'; exit 1; fi
    grep -q "$error" "$tmp/out"
  fi
  "${CXX:-c++}" -std=c++20 -O1 -I include -I src -I third_party/mimalloc/include "$tmp/raw.cpp" "$libs/libzn_rt.a" "$libs/libzn_zbc.a" "$libs/libzn_ir.a" "$libs/libzn_frontend.a" "$libs/libzn_regexp.a" "$libs/libzn_native.a" "$libs/libzn_mimalloc.a" -o "$tmp/raw"
  if [ "$kind" = exact ] || [ "$kind" = plain ]; then
    timeout 10 "$tmp/raw" > "$tmp/out" 2> "$tmp/err"
    if [ "$kind" = exact ]; then printf 'false\ntrue\n'; else printf '1\n'; fi | diff -u - "$tmp/out"
  else
    if timeout 10 "$tmp/raw" > "$tmp/out" 2>&1; then echo 'raw AOT unsafe store accepted'; exit 1; fi
    grep -q "$error" "$tmp/out"
  fi
done
