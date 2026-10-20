#!/bin/sh
# The iOS Metal present (ZN-627): the window HAL and hal_metal.mm compile for the iOS simulator SDK (-fsyntax-only, -Wall -Wextra, no
# warning), with the Metal path in: the iOS code of hal_sdl.cpp is never compiled on the Mac otherwise. Seconds; skipped without Xcode's
# iOS SDK. The pixels and the timings are proven on a simulator by hand (docs/reports/zinc-next-ios.md "The present").
cd "$(dirname "$0")/../.." || exit 2
sdk=$(xcrun --sdk iphonesimulator --show-sdk-path 2>/dev/null) || { echo "skipped: no iOS SDK"; exit 77; }
[ -d "$sdk" ] || { echo "skipped: no iOS SDK"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
cxx="xcrun --sdk iphonesimulator clang++ -target arm64-apple-ios16.3-simulator -isysroot $sdk -std=c++17 -fsyntax-only -Wall -Wextra -Werror"
inc="-Iruntime -Iruntime/include -Iinclude -Isrc -Ithird_party/SDL3/include"
fail=0
$cxx $inc -c targets/macos/hal_sdl.cpp > "$tmp/sdl.log" 2>&1 || { echo "hal_sdl.cpp for iOS:"; head -20 "$tmp/sdl.log"; fail=1; }
grep -q "hal_mtl_present" targets/macos/hal_sdl.cpp || { echo "hal_sdl.cpp does not present through Metal on iOS"; fail=1; }
$cxx -x objective-c++ -fobjc-arc -Ithird_party/SDL3/include -c targets/macos/hal_metal.mm > "$tmp/mtl.log" 2>&1 || { echo "hal_metal.mm for iOS:"; head -20 "$tmp/mtl.log"; fail=1; }
[ $fail -eq 0 ] && echo "ios present: hal_sdl.cpp and hal_metal.mm compile for the iOS simulator"
exit $fail
