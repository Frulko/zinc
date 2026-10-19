#!/bin/sh
# iOS on the simulator (ZN-624): examples/hello exported for iOS (zinc export --target ios), its Xcode project made by CMake and built by
# xcodebuild for the simulator, run with `simctl launch --console-pty`: its output equals `zinc run`'s. Needs Xcode and an iOS runtime
# (else skipped, 77); uses the booted simulator or boots the first available iPhone and shuts it down after. About 5 minutes, most of it the
# first configure of CMake's Xcode generator. KEEP=dir keeps the project.
cd "$(dirname "$0")/../.." || exit 2
[ -z "$ZINC_CI" ] || { echo "skipped: CMake's Xcode generator does not finish its first configure on a hosted runner (killed after 970 s, v0.2.1 CI)"; exit 77; }
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
command -v xcodebuild >/dev/null 2>&1 && xcrun simctl help >/dev/null 2>&1 || { echo "skipped: no Xcode"; exit 77; }
tmp=${KEEP:-$(mktemp -d)}; [ -n "$KEEP" ] || trap 'rm -rf "$tmp"' EXIT
dev=$(xcrun simctl list devices booted | grep -o '[0-9A-F-]\{36\}' | head -1)
booted=
if [ -z "$dev" ]; then
  dev=$(xcrun simctl list devices available | grep 'iPhone' | grep -o '[0-9A-F-]\{36\}' | head -1)
  [ -n "$dev" ] || { echo "skipped: no iPhone simulator"; exit 77; }
  xcrun simctl boot "$dev" && xcrun simctl bootstatus "$dev" -b >/dev/null || { echo "could not boot $dev"; exit 1; }
  booted=1
fi
fail=0
"$Z" export ../examples/hello --target ios -o "$tmp/hello" >/dev/null 2>&1 || { echo "export --target ios failed"; exit 1; }
(cd "$tmp/hello" && cmake -S . -B build -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_ARCHITECTURES="$(uname -m)" > "$tmp/configure.log" 2>&1) || { echo "cmake -G Xcode failed: $(grep -m3 'Error' "$tmp/configure.log")"; fail=1; }
[ $fail -eq 0 ] && { (cd "$tmp/hello" && xcodebuild -project build/hello.xcodeproj -scheme hello -configuration Debug -sdk iphonesimulator -arch "$(uname -m)" -derivedDataPath build/dd CODE_SIGNING_ALLOWED=NO build > "$tmp/build.log" 2>&1) || { echo "xcodebuild failed: $(grep -m3 'error:' "$tmp/build.log")"; fail=1; }; }
if [ $fail -eq 0 ]; then
  xcrun simctl install "$dev" "$tmp/hello/build/Debug-iphonesimulator/hello.app" || fail=1
  timeout 60 xcrun simctl launch --console-pty --terminate-running-process "$dev" dev.zinc.hello 2>&1 | tr -d '\r' | grep -v '^dev.zinc.hello: [0-9]*$' > "$tmp/got.txt"
  "$Z" run ../examples/hello > "$tmp/want.txt" 2>/dev/null
  diff "$tmp/want.txt" "$tmp/got.txt" > "$tmp/diff.txt" || { echo "hello on the simulator prints differently:"; head -10 "$tmp/diff.txt"; fail=1; }
  xcrun simctl uninstall "$dev" dev.zinc.hello
fi
[ -n "$booted" ] && xcrun simctl shutdown "$dev"
[ $fail -eq 0 ] && echo "ios simulator: hello ok"
exit $fail
