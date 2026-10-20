#!/bin/sh
# zinc:system on phones (ZN-628, tests/data/mobile-services): on the desktop the simulator answers the phone ops (share.share, a picker that is
# cancelled); the Android export carries the Java backend, its lifecycle subscriber, POST_NOTIFICATIONS and the app's URL scheme; the iOS export
# the Objective-C backend, its frameworks and CFBundleURLTypes. The backends compile for their SDKs when this machine has them (NDK, Xcode).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
p=tests/data/mobile-services
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=200 SERVICES_DO=share "$Z" run $p 2>&1)
echo "$out" | grep -q '^\[system\] share.share {"text":"Made with Zinc","url":"https://zinc.dev","title":"Zinc"}' && echo "$out" | grep -q '^share true' || { echo "share.share is not answered by the simulator: $(echo "$out" | tail -3)"; fail=1; }
out=$(ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_FRAMES=200 SERVICES_DO=pick "$Z" run $p 2>&1)
echo "$out" | grep -q '^picked nothing' || { echo "the simulator's picker does not answer as cancelled: $(echo "$out" | tail -2)"; fail=1; }
# Android
"$Z" export $p --target android -o "$tmp/a" >/dev/null 2>"$tmp/err" || { echo "export --target android failed: $(tail -2 "$tmp/err")"; exit 1; }
m=$(perl -0pe 's/<!--.*?-->//gs' "$tmp/a/app/src/main/AndroidManifest.xml")
echo "$m" | grep -q '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />' || { echo "no POST_NOTIFICATIONS in the manifest"; fail=1; }
echo "$m" | grep -q 'android.permission.INTERNET' && { echo "INTERNET without \"net\" in zinc.json permissions"; fail=1; }
echo "$m" | perl -0ne 'exit(/<action android:name="android.intent.action.VIEW" \/>\s*<category android:name="android.intent.category.DEFAULT" \/>\s*<category android:name="android.intent.category.BROWSABLE" \/>\s*<data android:scheme="zincdemo" \/>/ ? 0 : 1)' || { echo "no intent filter for app.urlSchemes"; fail=1; }
[ -f "$tmp/a/app/src/main/java/dev/zinc/system/SystemBackend.java" ] && grep -q "new dev.zinc.system.SystemBackend()," "$tmp/a/app/src/main/java/dev/zinc/app/ZincPlugins.java" || { echo "the Java backend or its lifecycle subscriber is missing"; fail=1; }
grep -q 'system/native/system.host.cpp ${ZINC_PLUGINS}/system/native/system.android.cpp' "$tmp/a/app/jni/src/CMakeLists.txt" && grep -q '"ZN_SYSTEM_LIVE"' "$tmp/a/app/jni/src/CMakeLists.txt" || { echo "the Android backend is not compiled in"; fail=1; }
# iOS
"$Z" export $p --target ios -o "$tmp/i" >/dev/null 2>"$tmp/err" || { echo "export --target ios failed: $(tail -2 "$tmp/err")"; exit 1; }
pl="$tmp/i/Info.plist"; cm="$tmp/i/CMakeLists.txt"
command -v plutil >/dev/null 2>&1 && { plutil -lint "$pl" >/dev/null || { echo "Info.plist is not a valid plist"; fail=1; }; }
grep -A8 CFBundleURLTypes "$pl" | grep -q '<string>zincdemo</string>' || { echo "no CFBundleURLTypes for app.urlSchemes"; fail=1; }
grep -q 'system/native/system.host.cpp ${ZINC_PLUGINS}/system/native/system.ios.mm' "$cm" && grep -q '"-framework PhotosUI"' "$cm" && grep -q '"ZN_SYSTEM_URL_DROPS"' "$cm" || { echo "the iOS backend is not compiled in"; fail=1; }
# the backends compile for their SDKs, when this machine has them
ndk=$(ls -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}"/ndk/*/toolchains/llvm/prebuilt/*/bin 2>/dev/null | tail -1)
if [ -n "$ndk" ]; then
  "$ndk/clang++" --target=aarch64-linux-android24 -std=c++17 -fsyntax-only -Wall -Wextra -Werror -I src plugins/system/native/system.android.cpp || { echo "system.android.cpp does not compile with the NDK"; fail=1; }
fi
if command -v xcrun >/dev/null 2>&1 && sdk=$(xcrun --sdk iphonesimulator --show-sdk-path 2>/dev/null); then
  xcrun --sdk iphonesimulator clang++ -target arm64-apple-ios16.3-simulator -isysroot "$sdk" -std=c++17 -fobjc-arc -fsyntax-only -Wall -Wextra -Werror -x objective-c++ plugins/system/native/system.ios.mm || { echo "system.ios.mm does not compile for the iOS simulator"; fail=1; }
fi
[ $fail -eq 0 ] && echo "system phone: ok"
exit $fail
