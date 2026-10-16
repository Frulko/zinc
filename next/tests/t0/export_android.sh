#!/bin/sh
# zinc export --target android (ZN-621): the Gradle project made from SDL's template (third_party/SDL3/android-project) for examples/hello equals
# its golden (every file and its sha256, the engine's and the output's paths written as @ENGINE@ and @OUT@; the program's C++ by name only,
# it follows the compiler); --print lists the Gradle commands; no Android tool runs (gradle, adb, java, sdkmanager are traps on the PATH).
# UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
golden=tests/golden/export-android/hello.txt
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/bin"
for t in gradle gradlew adb java javac sdkmanager aapt2 ndk-build; do printf '#!/bin/sh\necho "%s $*" >> %s/ran\n' "$t" "$tmp" > "$tmp/bin/$t"; chmod +x "$tmp/bin/$t"; done
out=$(PATH="$tmp/bin:$PATH" ANDROID_HOME= ANDROID_SDK_ROOT= "$Z" export ../examples/hello --target android -o "$tmp/hello" --print 2>/dev/null) || { echo "export --target android failed"; exit 1; }
[ -f "$tmp/ran" ] && { echo "an Android tool ran: $(cat "$tmp/ran")"; fail=1; }
echo "$out" | grep -q '\./gradlew assembleDebug' && echo "$out" | grep -q '\./gradlew bundleRelease' || { echo "--print does not list the Gradle commands: $out"; fail=1; }
engine=$(cd . && pwd -P)
(cd "$tmp/hello" && find . -type f | LC_ALL=C sort | while read -r f; do
  case "$f" in ./app/jni/src/program*.cpp) echo "$f (the program's C++)"; continue ;; esac
  printf '%s %s\n' "$f" "$(LC_ALL=C sed -e "s|$engine|@ENGINE@|g" -e "s|$tmp/hello|@OUT@|g" "$f" | shasum -a 256 | cut -c1-16)"
done) > "$tmp/tree.txt"
if [ -n "$UPDATE" ]; then mkdir -p "$(dirname "$golden")"; cp "$tmp/tree.txt" "$golden"; echo "updated $golden"; fi
diff "$golden" "$tmp/tree.txt" > "$tmp/diff.txt" || { echo "the exported tree differs from $golden:"; head -20 "$tmp/diff.txt"; fail=1; }
# the template's changes are where they belong (the list in src/cli_core.cpp, exportAndroid)
grep -q "applicationId 'dev.zinc.hello'\|namespace = \"dev.zinc.hello\"" "$tmp/hello/app/build.gradle" || { echo "no package id in app/build.gradle"; fail=1; }
grep -q "zinc.abis=armeabi-v7a,arm64-v8a,x86_64" "$tmp/hello/gradle.properties" || { echo "the ABIs are not armeabi-v7a, arm64-v8a, x86_64"; fail=1; }
grep -q 'name="HelloActivity"' "$tmp/hello/app/src/main/AndroidManifest.xml" || { echo "the manifest does not name HelloActivity"; fail=1; }
grep -q "minSdkVersion 24" "$tmp/hello/app/build.gradle" && grep -q "targetSdkVersion 36" "$tmp/hello/app/build.gradle" || { echo "min 24 / target 36 not set"; fail=1; }
grep -q "max-page-size=16384" "$tmp/hello/app/jni/src/CMakeLists.txt" || { echo "no 16 KB page alignment"; fail=1; }
grep -q "ZN_APP_ENV" "$tmp/hello/app/jni/src/CMakeLists.txt" && { echo "hello has no targets.android, yet ZN_APP_ENV is defined"; fail=1; }
# zinc.json targets.android fullscreen and kiosk are baked for every build (ZN_APP_ENV, read by src/app/shell_sdl.cpp)
mkdir -p "$tmp/kiosk"
echo 'console.log("kiosk");' > "$tmp/kiosk/main.ts"
echo '{ "name": "kiosk", "entry": "main.ts", "permissions": ["camera"], "targets": { "android": { "fullscreen": true, "kiosk": true } } }' > "$tmp/kiosk/zinc.json"
PATH="$tmp/bin:$PATH" ANDROID_HOME= ANDROID_SDK_ROOT= "$Z" export "$tmp/kiosk" --target android -o "$tmp/kiosk-android" >/dev/null 2>&1 || { echo "export of a kiosk project failed"; fail=1; }
grep -q '"ZN_APP_ENV=\\"ZINC_FULLSCREEN=1 ZINC_KIOSK=1\\""' "$tmp/kiosk-android/app/jni/src/CMakeLists.txt" || { echo "targets.android fullscreen and kiosk are not baked as ZN_APP_ENV"; fail=1; }
# zinc.json "permissions": ["camera"] asks for CAMERA and keeps the app installable on devices without a camera
m="$tmp/kiosk-android/app/src/main/AndroidManifest.xml"
[ "$(grep -c '<uses-permission android:name="android.permission.CAMERA" />' "$m")" = 2 ] &&   # the template has a commented one
  grep -q '<uses-feature android:name="android.hardware.camera" android:required="false" />' "$m" || { echo "the camera permission is not in the manifest as zinc.json declares it"; fail=1; }
[ $fail -eq 0 ] && echo "export android: ok"
exit $fail
