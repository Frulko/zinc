#!/bin/sh
# zinc export --target ios (ZN-623): the CMake project for CMake's Xcode generator made for examples/hello equals its golden (every file and its
# sha256, the engine's and the output's paths written as @ENGINE@ and @OUT@; the program's C++ by name only, it follows the compiler); --print
# lists the cmake, xcodebuild and simctl commands; no Apple tool runs (xcodebuild, xcrun, actool, codesign... are traps on the PATH).
# A second project checks what zinc.json gives: the icon in the asset catalog, an orientation, a usage string, targets.ios kiosk.
# UPDATE=1 rewrites the golden.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
golden=tests/golden/export-ios/hello.txt
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/bin"
for t in xcodebuild xcrun simctl actool ibtool codesign xcode-select; do printf '#!/bin/sh\necho "%s $*" >> %s/ran\n' "$t" "$tmp" > "$tmp/bin/$t"; chmod +x "$tmp/bin/$t"; done
out=$(PATH="$tmp/bin:$PATH" "$Z" export ../examples/hello --target ios -o "$tmp/hello" --print 2>/dev/null) || { echo "export --target ios failed"; exit 1; }
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
grep -A1 CFBundleIdentifier "$pl" | grep -q dev.zinc.hello && grep -q '<key>UILaunchScreen</key>' "$pl" || { echo "no bundle id or launch screen in Info.plist"; fail=1; }
grep -q "ZN_APP_HEAP_MB=256" "$cm" && grep -q "add_executable(hello MACOSX_BUNDLE src/program.cpp" "$cm" || { echo "CMakeLists.txt: no ios heap or bundle"; fail=1; }
grep -q "ZN_APP_ENV\|AppIcon\|UsageDescription" "$cm" "$pl" && { echo "hello has no icon, permission nor targets.ios, yet one is in the project"; fail=1; }
# zinc.json: app.icon, app.orientation, permissions, targets.ios
mkdir -p "$tmp/cam/assets"
echo 'console.log("cam");' > "$tmp/cam/main.ts"
echo 'data' > "$tmp/cam/assets/a.txt"
cp ../examples/flipctl/assets/icons/keyboard_lang-k.png "$tmp/cam/icon.png"
echo '{ "name": "cam", "entry": "main.ts", "app": { "id": "org.example.cam-app", "name": "Cam & Co", "version": "1.2.3", "icon": "icon.png", "orientation": "portrait" },
  "permissions": ["camera", "net"], "targets": { "ios": { "kiosk": true } } }' > "$tmp/cam/zinc.json"
PATH="$tmp/bin:$PATH" "$Z" export "$tmp/cam" --target ios -o "$tmp/cam-ios" >/dev/null 2>&1 || { echo "export of the cam project failed"; fail=1; }
pl="$tmp/cam-ios/Info.plist"; cm="$tmp/cam-ios/CMakeLists.txt"
grep -A1 CFBundleIdentifier "$pl" | grep -q 'org.example.cam-app' || { echo "the bundle id is not org.example.cam-app"; fail=1; }
grep -A1 CFBundleDisplayName "$pl" | grep -q 'Cam &amp; Co' || { echo "the display name is not escaped"; fail=1; }
grep -A1 CFBundleVersion "$pl" | grep -q '>10203<' || { echo "CFBundleVersion is not 10203"; fail=1; }
grep -q NSCameraUsageDescription "$pl" && grep -q NSLocalNetworkUsageDescription "$pl" || { echo "no usage strings for camera and net"; fail=1; }
sed -n '/<key>UISupportedInterfaceOrientations<\/key>/,/<\/array>/p' "$pl" | grep -c UIInterfaceOrientation | grep -q '^1$' || { echo "portrait gives more than one phone orientation"; fail=1; }
[ -f "$tmp/cam-ios/Assets.xcassets/AppIcon.appiconset/icon.png" ] && grep -q "ASSETCATALOG_COMPILER_APPICON_NAME AppIcon" "$cm" || { echo "the icon is not in the asset catalog"; fail=1; }
[ -f "$tmp/cam-ios/assets/a.txt" ] || { echo "assets/ is not copied"; fail=1; }
grep -q '"ZN_APP_ENV=\\"ZINC_KIOSK=1\\""' "$cm" || { echo "targets.ios kiosk is not baked as ZN_APP_ENV"; fail=1; }
[ -f "$tmp/ran" ] && { echo "an Apple tool ran: $(cat "$tmp/ran")"; fail=1; }
[ $fail -eq 0 ] && echo "export ios: ok"
exit $fail
