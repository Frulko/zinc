#!/bin/sh
# zinc:video on phones (ZN-751, tests/data/mobile-video): the Android export compiles the MediaCodec backend (video.android.cpp) and links
# mediandk, the iOS export the AVFoundation one (video.ios.mm) with its frameworks; the program's clips travel in both. No Android or Apple
# tool runs for the exports; the backends compile warning-free for their SDKs when this machine has them (NDK arm64 and armv7a, the iOS
# simulator SDK).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
p=tests/data/mobile-video
unset ZINC_DETERMINISTIC   # tests/run sets it, and a deterministic build takes the plugin's fake player (video.next.ts) instead of its native code
# Android
"$Z" export $p --target android -o "$tmp/a" >/dev/null 2>"$tmp/err" || { echo "export --target android failed: $(tail -2 "$tmp/err")"; exit 1; }
cm="$tmp/a/app/jni/src/CMakeLists.txt"
grep -q 'add_library(zn_app_plugin_video STATIC ${ZINC_PLUGINS}/video/native/video.android.cpp ' "$cm" || { echo "the Android export does not compile video.android.cpp"; fail=1; }
grep -q 'target_link_libraries(zn_app_plugin_video PUBLIC mediandk android log)' "$cm" || { echo "the Android export does not link mediandk"; fail=1; }
[ -f "$tmp/a/app/src/main/assets/zinc/assets/a.mp4" ] && [ -f "$tmp/a/app/src/main/assets/zinc/assets/b.mp4" ] || { echo "the clips are not in the APK's assets"; fail=1; }
# iOS
"$Z" export $p --target ios -o "$tmp/i" >/dev/null 2>"$tmp/err" || { echo "export --target ios failed: $(tail -2 "$tmp/err")"; exit 1; }
cm="$tmp/i/CMakeLists.txt"
grep -q 'add_library(zn_app_plugin_video STATIC ${ZINC_PLUGINS}/video/native/video.ios.mm ' "$cm" || { echo "the iOS export does not compile video.ios.mm"; fail=1; }
grep -q '"-framework AVFoundation" "-framework CoreMedia" "-framework CoreVideo"' "$cm" || { echo "the iOS export does not link AVFoundation"; fail=1; }
[ -f "$tmp/i/assets/a.mp4" ] || { echo "the clips are not in the iOS bundle's assets"; fail=1; }
# the backends compile for their SDKs, when this machine has them
inc="-I src -I include -I ../runtime -I ../runtime/include -I third_party"
ndk=$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/ndk/*/toolchains/llvm/prebuilt/*/bin 2>/dev/null | tail -1)
if [ -n "$ndk" ]; then
  for t in aarch64-linux-android24 armv7a-linux-androideabi24; do
    "$ndk/clang++" --target=$t -std=c++17 -fno-exceptions -fno-rtti -fsyntax-only -Wall -Wextra -Werror -I "$tmp/a/app/jni/src/plugins/video" $inc ../plugins/video/native/video.android.cpp || { echo "video.android.cpp does not compile for $t"; fail=1; }
  done
fi
if command -v xcrun >/dev/null 2>&1 && sdk=$(xcrun --sdk iphonesimulator --show-sdk-path 2>/dev/null); then
  xcrun --sdk iphonesimulator clang++ -target arm64-apple-ios16.3-simulator -isysroot "$sdk" -std=c++17 -fno-exceptions -fno-rtti -fsyntax-only -Wall -Wextra -Werror -x objective-c++ -I "$tmp/i/src/plugins/video" $inc ../plugins/video/native/video.ios.mm || { echo "video.ios.mm does not compile for the iOS simulator"; fail=1; }
fi
[ $fail -eq 0 ] && echo "video phone: ok"
exit $fail
