#!/bin/sh
# zinc export --target ios (ZN-623): the CMake project for CMake's Xcode generator made for examples/hello equals its golden (every file and its
# sha256, the engine's and the output's paths written as @ENGINE@ and @OUT@; the program's C++ by name only, it follows the compiler); --print
# lists the cmake, xcodebuild and simctl commands; no Apple tool runs (xcodebuild, xcrun, actool, codesign... are traps on the PATH).
# A second project checks what zinc.json gives: the icon in the asset catalog, an orientation, a usage string, targets.ios kiosk.
# UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
golden=tests/golden/export-ios/hello.txt
unset ZINC_IOS_TEAM   # it would write a teamID into ExportOptions.plist
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/bin"
for t in xcodebuild xcrun simctl actool ibtool codesign xcode-select; do printf '#!/bin/sh\necho "%s $*" >> %s/ran\n' "$t" "$tmp" > "$tmp/bin/$t"; chmod +x "$tmp/bin/$t"; done
out=$(PATH="$tmp/bin:$PATH" "$Z" export examples/hello --target ios -o "$tmp/hello" --print 2>/dev/null) || { echo "export --target ios failed"; exit 1; }
[ -f "$tmp/ran" ] && { echo "an Apple tool ran: $(cat "$tmp/ran")"; fail=1; }
for c in 'cmake -S . -B build -G Xcode -DCMAKE_SYSTEM_NAME=iOS' 'xcodebuild -project build/hello.xcodeproj -scheme hello -configuration Debug -sdk iphonesimulator' \
         'xcrun simctl install booted build/Debug-iphonesimulator/hello.app' 'xcrun simctl launch --console-pty booted dev.zinc.hello' '-sdk iphoneos .* archive'; do
  echo "$out" | grep -q -- "$c" || { echo "--print does not list: $c"; fail=1; }
done
engine=$(cd . && pwd -P)
(cd "$tmp/hello" && find . -type f | LC_ALL=C sort | while read -r f; do
  case "$f" in ./src/program*.cpp) echo "$f (the program's C++)"; continue ;; esac
  printf '%s %s\n' "$f" "$(LC_ALL=C sed -e "s|$engine|@ENGINE@|g" -e "s|$tmp/hello|@OUT@|g" "$f" | shasum -a 256 | cut -c1-16)"
done) > "$tmp/tree.txt"
if [ -n "$UPDATE" ]; then mkdir -p "$(dirname "$golden")"; cp "$tmp/tree.txt" "$golden"; echo "updated $golden"; fi
diff "$golden" "$tmp/tree.txt" > "$tmp/diff.txt" || { echo "the exported tree differs from $golden:"; head -20 "$tmp/diff.txt"; fail=1; }
pl="$tmp/hello/Info.plist"; cm="$tmp/hello/CMakeLists.txt"
command -v plutil >/dev/null 2>&1 && { plutil -lint "$pl" >/dev/null || { echo "Info.plist is not a valid plist"; fail=1; }; }
grep -A1 CFBundleIdentifier "$pl" | grep -q '$(PRODUCT_BUNDLE_IDENTIFIER)' && grep -q 'set(ZINC_BUNDLE_ID "dev.zinc.hello"' "$cm" && grep -q '<key>UILaunchScreen</key>' "$pl" || { echo "no bundle id (ZINC_BUNDLE_ID, PRODUCT_BUNDLE_IDENTIFIER in Info.plist) or launch screen"; fail=1; }
grep -q "ZN_APP_HEAP_MB=256" "$cm" && grep -q "add_executable(hello MACOSX_BUNDLE src/program.cpp" "$cm" || { echo "CMakeLists.txt: no ios heap or bundle"; fail=1; }
grep -q "ZN_APP_ENV\|AppIcon\|UsageDescription" "$cm" "$pl" && { echo "hello has no icon, permission nor targets.ios, yet one is in the project"; fail=1; }
# zinc.json: app.icon, app.orientation, permissions, targets.ios
mkdir -p "$tmp/cam/assets"
echo 'console.log("cam");' > "$tmp/cam/main.ts"
echo 'data' > "$tmp/cam/assets/a.txt"
cp examples/flipctl/assets/icons/keyboard_lang-k.png "$tmp/cam/icon.png"
echo '{ "name": "cam", "entry": "main.ts", "app": { "id": "org.example.cam-app", "name": "Cam & Co", "version": "1.2.3", "icon": "icon.png", "orientation": "portrait" },
  "permissions": ["camera", "net"], "targets": { "ios": { "kiosk": true } } }' > "$tmp/cam/zinc.json"
PATH="$tmp/bin:$PATH" "$Z" export "$tmp/cam" --target ios -o "$tmp/cam-ios" >/dev/null 2>&1 || { echo "export of the cam project failed"; fail=1; }
pl="$tmp/cam-ios/Info.plist"; cm="$tmp/cam-ios/CMakeLists.txt"
grep -q 'set(ZINC_BUNDLE_ID "org.example.cam-app"' "$cm" || { echo "the bundle id is not org.example.cam-app"; fail=1; }
grep -A1 CFBundleDisplayName "$pl" | grep -q 'Cam &amp; Co' || { echo "the display name is not escaped"; fail=1; }
grep -A1 CFBundleVersion "$pl" | grep -q '>10203<' || { echo "CFBundleVersion is not 10203"; fail=1; }
grep -q NSCameraUsageDescription "$pl" && grep -q NSLocalNetworkUsageDescription "$pl" || { echo "no usage strings for camera and net"; fail=1; }
sed -n '/<key>UISupportedInterfaceOrientations<\/key>/,/<\/array>/p' "$pl" | grep -c UIInterfaceOrientation | grep -q '^1$' || { echo "portrait gives more than one phone orientation"; fail=1; }
[ -f "$tmp/cam-ios/Assets.xcassets/AppIcon.appiconset/icon.png" ] && grep -q "ASSETCATALOG_COMPILER_APPICON_NAME AppIcon" "$cm" || { echo "the icon is not in the asset catalog"; fail=1; }
[ -f "$tmp/cam-ios/assets/a.txt" ] || { echo "assets/ is not copied"; fail=1; }
grep -q '"ZN_APP_ENV=\\"ZINC_KIOSK=1\\""' "$cm" || { echo "targets.ios kiosk is not baked as ZN_APP_ENV"; fail=1; }
# a plugin's targets.ios entry (ZN-628, tests/data/mobile-plugin): its framework, its Info.plist keys (Zinc's own keys win), its entitlements
PATH="$tmp/bin:$PATH" "$Z" export tests/data/mobile-plugin --target ios -o "$tmp/beep" >/dev/null 2>"$tmp/beep.err" || { echo "export of the fixture plugin failed: $(tail -2 "$tmp/beep.err")"; fail=1; }
pl="$tmp/beep/Info.plist"; cm="$tmp/beep/CMakeLists.txt"; en="$tmp/beep/beepapp.entitlements"
command -v plutil >/dev/null 2>&1 && { plutil -lint "$pl" "$en" >/dev/null || { echo "the merged Info.plist or the entitlements are not valid plists"; fail=1; }; }
grep -A1 NSBluetoothAlwaysUsageDescription "$pl" | grep -q 'Beeps over Bluetooth.' && grep -A2 UIBackgroundModes "$pl" | grep -q '<string>audio</string>' || { echo "the plugin's Info.plist keys are missing"; fail=1; }
[ "$(grep -c CFBundleIdentifier "$pl")" = 1 ] && grep -A1 CFBundleIdentifier "$pl" | grep -q '$(PRODUCT_BUNDLE_IDENTIFIER)' || { echo "a plugin's key replaced Zinc's CFBundleIdentifier"; fail=1; }
grep -q 'applinks:example.org' "$en" && grep -q 'CODE_SIGN_ENTITLEMENTS ${CMAKE_CURRENT_SOURCE_DIR}/beepapp.entitlements' "$cm" || { echo "the entitlements are not written or not signed in"; fail=1; }
grep -q 'target_link_libraries(zn_app_plugin_beep PUBLIC "-framework AudioToolbox")' "$cm" || { echo "the plugin's framework is not linked"; fail=1; }
# targets.ios.class: the Swift class and the generated Swift protocol in a library of their own, the Objective-C++ bridge as the implementation,
# -ObjC for the classes only NSClassFromString names, the lifecycle subscriber for the shell, Swift enabled
grep -q "add_library(zn_app_plugin_beep_swift STATIC src/plugins/beep/ZincBeepSpec.swift $engine/tests/data/mobile-plugin/plugins/beep/native/ios/BeepModule.swift)" "$cm" && grep -q 'zinc_native_beep_ios.mm' "$cm" || { echo "the Swift library or the bridge is missing (a project's plugin by its absolute path)"; fail=1; }
grep -q 'project(beepapp C CXX OBJC OBJCXX Swift)' "$cm" && grep -q -- '-dead_strip -ObjC' "$cm" && grep -q 'ZN_APP_LIFECYCLE=\\"BeepLife\\"' "$cm" && [ -f "$tmp/beep/src/zinc_swift.swift" ] || { echo "Swift, -ObjC or the lifecycle define is missing"; fail=1; }
grep -q -- '-ObjC\|OBJCXX Swift' "$tmp/hello/CMakeLists.txt" && { echo "hello has no plugin, yet Swift or -ObjC is in its project"; fail=1; }
# a plugin without an entry for the target is refused, with a message that names it
cp -R tests/data/mobile-plugin "$tmp/noentry"
perl -0pi -e 's/,\n    "ios": \{.*?\n    \}\n/\n/s' "$tmp/noentry/plugins/beep/plugin.json"
PATH="$tmp/bin:$PATH" "$Z" export "$tmp/noentry" --target ios -o "$tmp/noentry-ios" >/dev/null 2>"$tmp/noentry.err" && { echo "a plugin without an ios entry was exported"; fail=1; }
grep -q "plugin 'beep' is not made for ios" "$tmp/noentry.err" || { echo "the refusal does not say why: $(tail -1 "$tmp/noentry.err")"; fail=1; }
# a call (webrtc, microphone): libdatachannel's vendorFlags reach its C++ sources only, after the plugin's -fno-exceptions -fno-rtti
PATH="$tmp/bin:$PATH" "$Z" export examples/webrtc-call --target ios -o "$tmp/call" >/dev/null 2>&1 || { echo "webrtc-call does not export for ios"; fail=1; }
grep -q 'set_source_files_properties(${ZINC_PLUGINS}/webrtc/vendor/libdatachannel/src/candidate.cpp .* PROPERTIES COMPILE_OPTIONS "-fexceptions;-frtti;-fthreadsafe-statics")' "$tmp/call/CMakeLists.txt" &&
  ! grep 'COMPILE_OPTIONS' "$tmp/call/CMakeLists.txt" | grep -q 'usrsctp' && grep -q 'add_library(zn_app_plugin_microphone ' "$tmp/call/CMakeLists.txt" || { echo "webrtc's vendorFlags or the microphone are missing from the ios project"; fail=1; }
[ -f "$tmp/ran" ] && { echo "an Apple tool ran: $(cat "$tmp/ran")"; fail=1; }
[ $fail -eq 0 ] && echo "export ios: ok"
exit $fail
