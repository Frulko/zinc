#!/bin/sh
# The console SDK pins (ZN-456, src/tc/consoles.cpp): zinc toolchain targets names psp, vita, ps2, n3ds and ios-legacy with what each needs; an SDK
# archive from a local mirror that does not match its pin is refused before anything is unpacked; zinc doctor explains a missing armv7 iPhone SDK.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:-build/zinc}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
t=$("$Z" toolchain targets)
for row in "psp .*pspdev v20261001" "vita .*VitaSDK" "ps2 .*ps2dev v2.0.0.*Play!" "n3ds .*devkitARM.*docker" "ios-legacy .*armv7.*Xcode 13.4.1"; do
  echo "$t" | grep -q "^$row" || { echo "console sdks: toolchain targets has no line '$row'"; fail=1; }
done
"$Z" toolchain install gameboy 2>&1 | grep -q "no console target .gameboy." || { echo "console sdks: an unknown target is not refused"; fail=1; }
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) f=pspdev-macos-latest-arm64.tar.gz ;; Darwin-x86_64) f=pspdev-macos-15-intel-x86_64.tar.gz ;;
  Linux-aarch64) f=pspdev-ubuntu-24.04-arm-arm64.tar.gz ;; Linux-x86_64) f=pspdev-ubuntu-latest-x86_64.tar.gz ;;
  *) f= ;;
esac
if [ -n "$f" ]; then
  mkdir "$tmp/mirror"; head -c 4096 /dev/zero | tr '\0' 'x' > "$tmp/mirror/$f"
  out=$(env -u PSPDEV ZINC_HOME="$tmp/home" ZINC_TC_MIRROR="file://$tmp/mirror" ZINC_OFFLINE=1 "$Z" toolchain install psp 2>&1); rc=$?
  [ $rc -ne 0 ] && echo "$out" | grep -q "SHA-256" || { echo "console sdks: a tampered pspdev archive was not refused: $out"; fail=1; }
  ls -d "$tmp/home/toolchains/pspdev-"* >/dev/null 2>&1 && { echo "console sdks: a tampered archive was unpacked"; fail=1; }
fi
# the iPhone 4S: without an armv7 SDK, doctor names Xcode 13.4.1 (here: a directory that is not an SDK)
mkdir -p "$tmp/NotAnSdk.sdk"
d=$(ZINC_IOS_LEGACY_SDK="$tmp/NotAnSdk.sdk" "$Z" doctor --details 2>&1)
echo "$d" | grep "^  ios-legacy" | grep -q "Xcode 13.4.1" || { echo "console sdks: doctor does not explain the missing iOS SDK: $(echo "$d" | grep ios-legacy)"; fail=1; }
echo "$d" | grep -q "^  psp .*pspdev" || { echo "console sdks: doctor --details has no psp line"; fail=1; }
[ $fail -eq 0 ] && echo "console sdks: ok"
exit $fail
