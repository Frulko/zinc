#!/bin/sh
# Cross-built graphics host (ZN-132): `zinc build --target aarch64-linux` (and armhf-linux) links a program that draws, with its fonts and the native code of its plugins (Lottie), using the pinned
# zig and CMake only: no Docker, no sysroot. The result is checked as an ELF of the right machine; running it needs qemu-user (ZN-133).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
machine() { od -An -tx1 -j18 -N2 "$1" | tr -d ' \n'; }   # e_machine, little endian
for t in aarch64-linux:b700 armhf-linux:2800; do
  name=${t%%:*}; want=${t##*:}
  "$ZINC" build --target "$name" ../examples/hero/src/main.tsx -o "$tmp/hero-$name" >"$tmp/log" 2>&1 || { echo "$name: build fails: $(tail -c 500 "$tmp/log")"; fail=1; continue; }
  [ "$(od -An -c -N4 "$tmp/hero-$name" | tr -d ' \n')" = '177ELF' ] || { echo "$name: not an ELF"; fail=1; continue; }
  [ "$(machine "$tmp/hero-$name")" = "$want" ] || { echo "$name: e_machine $(machine "$tmp/hero-$name"), expected $want"; fail=1; }
  strings "$tmp/hero-$name" | grep -q "Lottie" || { echo "$name: the Lottie plugin is not linked"; fail=1; }
done
[ $fail -eq 0 ] && echo "cross linux: ok"
exit $fail
