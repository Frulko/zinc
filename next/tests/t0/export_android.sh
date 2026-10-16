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
grep -q 'extends ZincActivity' "$tmp/hello/app/src/main/java/dev/zinc/hello/HelloActivity.java" && [ -f "$tmp/hello/app/src/main/java/org/libsdl/app/ZincEdit.java" ] || { echo "the activity is not Zinc's (src/app/android/java)"; fail=1; }
grep -q 'enableOnBackInvokedCallback="true"' "$tmp/hello/app/src/main/AndroidManifest.xml" || { echo "the back callbacks are off in the manifest"; fail=1; }
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
# a plugin's targets.android entry (ZN-628, tests/data/mobile-plugin): its Java in the directory of its package, its Gradle dependency, its manifest
# fragments and minSdk; the manifest lists exactly the declared permissions (zinc.json "net" and the plugin's), the template's comments aside
PATH="$tmp/bin:$PATH" ANDROID_HOME= ANDROID_SDK_ROOT= "$Z" export tests/data/mobile-plugin --target android -o "$tmp/beep" >/dev/null 2>"$tmp/beep.err" || { echo "export of the fixture plugin failed: $(tail -2 "$tmp/beep.err")"; fail=1; }
m="$tmp/beep/app/src/main/AndroidManifest.xml"
got=$(perl -0pe 's/<!--.*?-->//gs' "$m" | grep -o '<uses-permission android:name="[^"]*"' | sed 's/.*name="//; s/"$//' | sort | tr '\n' ' ')
[ "$got" = "android.permission.INTERNET android.permission.VIBRATE com.example.permission.BEEP " ] || { echo "the manifest's permissions are not exactly the declared ones: $got"; fail=1; }
grep -q '<queries><intent>' "$m" && grep -q '<meta-data android:name="org.example.beep"' "$m" || { echo "the plugin's manifest fragments are missing"; fail=1; }
perl -0ne 'exit(/<meta-data android:name="org.example.beep"[^\n]*\n\s*<\/application>/ ? 0 : 1)' "$m" || { echo "the application fragment is not inside <application>"; fail=1; }
grep -q "implementation 'androidx.core:core:1.13.1'" "$tmp/beep/app/build.gradle" && grep -q "minSdkVersion 26" "$tmp/beep/app/build.gradle" || { echo "the plugin's Gradle dependency or minSdk is missing"; fail=1; }
[ -f "$tmp/beep/app/src/main/java/org/example/beep/BeepHelper.java" ] || { echo "the plugin's Java source is not in its package's directory"; fail=1; }
grep -q "add_library(zn_app_plugin_beep STATIC" "$tmp/beep/app/jni/src/CMakeLists.txt" && grep -q "target_link_libraries(zn_app_plugin_beep PUBLIC log)" "$tmp/beep/app/jni/src/CMakeLists.txt" || { echo "the plugin's library is not in the CMake project"; fail=1; }
# targets.android.class: the generated interface beside the Kotlin class, the JNI bridge as the implementation; the Kotlin Gradle plugin; the lifecycle subscriber listed for ZincActivity
j="$tmp/beep/app/src/main/java"
[ -f "$j/dev/zinc/plugins/beep/BeepSpec.java" ] && [ -f "$j/org/example/beep/BeepModule.kt" ] && [ -f "$j/dev/zinc/app/ZincCallback.java" ] || { echo "the generated interface or the Kotlin class is missing"; fail=1; }
grep -q 'zinc_native_beep_android.cpp' "$tmp/beep/app/jni/src/CMakeLists.txt" && grep -q 'ZN_NATIVE_CLASS=\\"org.example.beep.BeepModule\\"' "$tmp/beep/app/jni/src/CMakeLists.txt" || { echo "the JNI bridge is not the plugin's implementation"; fail=1; }
grep -q "id 'org.jetbrains.kotlin.android'" "$tmp/beep/app/build.gradle" && grep -q "kotlin-gradle-plugin" "$tmp/beep/build.gradle" || { echo "Kotlin sources without the Kotlin Gradle plugin"; fail=1; }
grep -q "new org.example.beep.BeepLife()," "$j/dev/zinc/app/ZincPlugins.java" || { echo "the lifecycle subscriber is not in ZincPlugins.java"; fail=1; }
grep -q "new ZincLifecycle\[\] {" "$tmp/hello/app/src/main/java/dev/zinc/app/ZincPlugins.java" && ! grep -q "kotlin" "$tmp/hello/app/build.gradle" || { echo "hello's ZincPlugins.java or Gradle files are wrong"; fail=1; }
# a plugin without an entry for the target is refused, with a message that names it
cp -R tests/data/mobile-plugin "$tmp/noentry"
perl -0pi -e 's/"android": \{.*?\n    \},\n//s' "$tmp/noentry/plugins/beep/plugin.json"
PATH="$tmp/bin:$PATH" "$Z" export "$tmp/noentry" --target android -o "$tmp/noentry-android" >/dev/null 2>"$tmp/noentry.err" && { echo "a plugin without an android entry was exported"; fail=1; }
grep -q "plugin 'beep' is not made for android: its plugin.json has no \"targets\".\"android\" entry" "$tmp/noentry.err" || { echo "the refusal does not say why: $(tail -1 "$tmp/noentry.err")"; fail=1; }
[ -f "$tmp/ran" ] && { echo "an Android tool ran: $(cat "$tmp/ran")"; fail=1; }
[ $fail -eq 0 ] && echo "export android: ok"
exit $fail
