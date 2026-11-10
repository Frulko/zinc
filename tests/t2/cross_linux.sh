#!/bin/sh
# Cross-built graphics host (ZN-132): the Linux ARM targets link a program that draws, with its fonts and the native code of its plugins (Lottie), using the pinned
# zig and CMake only. The result is checked as an ELF of the right machine; execution belongs to the cross-platform pass.
cd "$(dirname "$0")/../.." || exit 2
readelf=${READELF:-readelf}
command -v "$readelf" >/dev/null 2>&1 || { echo "skipped: GNU readelf is needed (set READELF)"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
machine() { od -An -tx1 -j18 -N2 "$1" | tr -d ' \n'; }   # e_machine, little endian
for t in aarch64-linux:b700 armhf-linux:2800 armv7-linux:2800; do
  name=${t%%:*}; want=${t##*:}
  "$ZINC" build --target "$name" examples/hero/src/main.tsx -o "$tmp/hero-$name" >"$tmp/log" 2>&1 || { echo "$name: build fails:"; cat "$tmp/log"; fail=1; continue; }
  [ "$(od -An -c -N4 "$tmp/hero-$name" | tr -d ' \n')" = '177ELF' ] || { echo "$name: not an ELF"; fail=1; continue; }
  [ "$(machine "$tmp/hero-$name")" = "$want" ] || { echo "$name: e_machine $(machine "$tmp/hero-$name"), expected $want"; fail=1; }
  if [ "$name" = armv7-linux ]; then
    "$readelf" -A "$tmp/hero-$name" >"$tmp/attributes" || { echo "$name: readelf failed"; fail=1; continue; }
    for attr in 'Tag_CPU_arch: v7' 'Tag_FP_arch: VFPv3' 'Tag_Advanced_SIMD_arch: NEONv1'; do
      grep -Eq "^[[:space:]]*$attr[[:space:]]*$" "$tmp/attributes" || { echo "$name: missing $attr"; cat "$tmp/attributes"; fail=1; }
    done
    # LLD can omit Tag_ABI_VFP_args from linked output; e_flags carries the executable's ABI.
    "$readelf" -h "$tmp/hero-$name" >"$tmp/header" || { echo "$name: ELF header read failed"; fail=1; continue; }
    grep -Eq 'Flags:.*Version5 EABI, hard-float ABI' "$tmp/header" || { echo "$name: not EABI5 hard-float"; cat "$tmp/header"; fail=1; }
  fi
  strings "$tmp/hero-$name" | grep -q "Lottie" || { echo "$name: the Lottie plugin is not linked"; fail=1; }
done
[ $fail -eq 0 ] && echo "cross linux: ok"
exit $fail
