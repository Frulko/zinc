#!/bin/sh
# Toolchain manager (ZN-029): SHA-256 against the standard test vector, the list of targets, an unknown target is refused, and a download
# that does not match its pin is discarded before anything is unpacked (a tampered archive from a local mirror).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
printf abc > "$tmp/abc"
[ "$("$ZINC" toolchain sha256 "$tmp/abc" | cut -d' ' -f1)" = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad ] || { echo "sha256 differs from the test vector of 'abc'"; fail=1; }
"$ZINC" toolchain targets | grep -q "^aarch64-linux " || { echo "aarch64-linux is not a target"; fail=1; }
"$ZINC" build --target nowhere-os ../tests/bench/kernels/fib.ts -o "$tmp/x" 2>&1 | grep -q "unknown target" || { echo "an unknown target is not refused"; fail=1; }
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) f=zig-aarch64-macos-0.15.2.tar.xz ;; Darwin-x86_64) f=zig-x86_64-macos-0.15.2.tar.xz ;;
  Linux-aarch64) f=zig-aarch64-linux-0.15.2.tar.xz ;; Linux-x86_64) f=zig-x86_64-linux-0.15.2.tar.xz ;;
  *) f= ;;
esac
if [ -n "$f" ]; then
  mkdir "$tmp/mirror"; head -c 4096 /dev/zero | tr '\0' 'x' > "$tmp/mirror/$f"
  out=$(env -u ZINC_ZIG ZINC_HOME="$tmp/home" ZINC_TC_MIRROR="file://$tmp/mirror" "$ZINC" toolchain install 2>&1); rc=$?
  [ $rc -ne 0 ] && echo "$out" | grep -q "does not verify (SHA-256" || { echo "a tampered toolchain archive was not refused: $out"; fail=1; }
  [ -d "$tmp/home/toolchains/zig-"*"-0.15.2" ] 2>/dev/null && { echo "a tampered archive was unpacked"; fail=1; }
fi
exit $fail
