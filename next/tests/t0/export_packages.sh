#!/bin/sh
# zinc export --aab, --apk and --ipa (ZN-629) with --dry-run: every command is printed and none runs (the Android and Apple tools are traps on
# the PATH, no build directory appears); the upload key is named by the environment or zinc.json and its passwords never reach the project nor
# the output; zinc.json refuses a password; ExportOptions.plist follows signing.ios (team, method, manual profile); PrivacyInfo.xcprivacy holds
# the engine's required-reason APIs and a plugin's; a device IPA without a team stops before any tool.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "${ZINC:-build/zinc}")" && pwd)/$(basename "${ZINC:-build/zinc}")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/bin"
for t in gradle adb java javac sdkmanager zipalign apksigner bundletool keytool jarsigner unzip xcodebuild xcrun simctl actool codesign ditto cmake; do
  printf '#!/bin/sh\necho "%s $*" >> %s/ran\n' "$t" "$tmp" > "$tmp/bin/$t"; chmod +x "$tmp/bin/$t"
done
run() { PATH="$tmp/bin:$PATH" JAVA_HOME=/nonexistent ANDROID_HOME= ANDROID_SDK_ROOT= ZINC_IOS_TEAM= ZINC_ANDROID_KEYSTORE= ZINC_ANDROID_KEY_ALIAS= "$Z" export "$@" 2>&1; }
want() { echo "$1" | grep -q -- "$2" || { echo "$3: no \"$2\" in: $(echo "$1" | grep '^+' | head -5)"; fail=1; }; }

# android --aab without a key: the debug keystore, said so
out=$(run ../examples/hello --target android -o "$tmp/a1" --aab --dry-run) || { echo "--aab --dry-run failed: $out"; fail=1; }
want "$out" '^+ ./gradlew bundleRelease$' "--aab"
want "$out" "^+ unzip -qq -o '$tmp/a1/app/build/outputs/bundle/release/app-release.aab' 'base/lib/\*.so'" "--aab"
want "$out" 'signed with the debug keystore' "--aab without a key"
want "$out" 'bundletool build-apks' "--aab"
[ -d "$tmp/a1/app/build" ] && { echo "--dry-run built something: $tmp/a1/app/build"; fail=1; }
g="$tmp/a1/app/build.gradle"
grep -q "signingConfig signingConfigs.upload.storeFile ? signingConfigs.upload : signingConfigs.debug" "$g" && grep -q "storePassword System.getenv('ZINC_ANDROID_STORE_PASSWORD')" "$g" || { echo "app/build.gradle has no upload signing config"; fail=1; }

# the key from the environment: path and alias on the Gradle line, the passwords nowhere
out=$(ZINC_ANDROID_STORE_PASSWORD=s3cret-zn629 ZINC_ANDROID_KEY_PASSWORD=k3y-zn629 PATH="$tmp/bin:$PATH" JAVA_HOME=/nonexistent ZINC_ANDROID_KEYSTORE="$tmp/keys/upload.jks" ZINC_ANDROID_KEY_ALIAS=up "$Z" export ../examples/hello --target android -o "$tmp/a2" --aab --dry-run 2>&1)
want "$out" "^+ ./gradlew bundleRelease -Pzinc.keystore='$tmp/keys/upload.jks' -Pzinc.keyAlias='up'$" "--aab with ZINC_ANDROID_KEYSTORE"
want "$out" "--ks='$tmp/keys/upload.jks' --ks-key-alias='up' --ks-pass=pass:\"\$ZINC_ANDROID_STORE_PASSWORD\"" "--aab with a key"
echo "$out" | grep -q 's3cret-zn629\|k3y-zn629' && { echo "a password is in the output"; fail=1; }
grep -rq "s3cret-zn629\|k3y-zn629\|$tmp/keys" "$tmp/a2" && { echo "the key or a password is written in the project"; fail=1; }

# zinc.json signing.android: a path relative to the project, an alias; a password there is refused
mkdir -p "$tmp/signed"
echo 'console.log("signed");' > "$tmp/signed/main.ts"
echo '{ "name": "signed", "entry": "main.ts", "signing": { "android": { "keystore": "../keys/release.jks", "alias": "rel" } } }' > "$tmp/signed/zinc.json"
out=$(run "$tmp/signed" --target android -o "$tmp/a3" --aab --dry-run)
want "$out" "^+ ./gradlew bundleRelease -Pzinc.keystore='$tmp/keys/release.jks' -Pzinc.keyAlias='rel'$" "zinc.json signing.android"
echo '{ "name": "signed", "entry": "main.ts", "signing": { "android": { "keystore": "k.jks", "storePassword": "x" } } }' > "$tmp/signed/zinc.json"
out=$(run "$tmp/signed" --target android -o "$tmp/a4" --aab --dry-run) && { echo "a password in zinc.json was accepted"; fail=1; }
want "$out" 'a password is not kept in zinc.json; set ZINC_ANDROID_STORE_PASSWORD' "a password in zinc.json"

# --apk: the debug APK of chosen ABIs, zipalign -c -P 16 then the ELF check
out=$(run ../examples/hello --target android -o "$tmp/a5" --apk --abis arm64-v8a --dry-run)
want "$out" "^+ ./gradlew assembleDebug -Pzinc.abis='arm64-v8a'$" "--apk"
want "$out" "^+ 'zipalign' -c -P 16 4 '$tmp/a5/app/build/outputs/apk/debug/app-debug.apk'$" "--apk"
want "$out" "'lib/\*.so'" "--apk"
want "$out" 'every LOAD segment of a 64-bit library must be aligned to 16 KB' "--apk"
# --apk --release: assembleRelease, the release APK; without an upload key the debug keystore signs it (adb installs it)
out=$(run ../examples/hello --target android -o "$tmp/a6" --apk --release --abis armeabi-v7a --dry-run)
want "$out" "^+ ./gradlew assembleRelease -Pzinc.abis='armeabi-v7a'$" "--apk --release"
want "$out" "^+ 'zipalign' -c -P 16 4 '$tmp/a6/app/build/outputs/apk/release/app-release.apk'$" "--apk --release"
want "$out" 'the release APK is signed with the debug keystore, for an install with adb' "--apk --release"
out=$(run ../examples/hello --target android -o "$tmp/a7" --release --dry-run) && { echo "--release without --apk was accepted"; fail=1; }
want "$out" '--release goes with --apk' "--release alone"

# ios --ipa: archive and export; without a team the placeholder, and a real run stops before any tool
out=$(run ../examples/hello --target ios -o "$tmp/i1" --ipa --dry-run)
want "$out" "^+ cmake -S . -B build-device -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DZINC_TEAM='<team id>'$" "--ipa"
want "$out" '^+ xcodebuild -quiet -project build-device/hello.xcodeproj -scheme hello -configuration Release -sdk iphoneos .* archive -archivePath build-device/hello.xcarchive$' "--ipa"
want "$out" '^+ xcodebuild -quiet -exportArchive -archivePath build-device/hello.xcarchive -exportPath build-device/ipa -exportOptionsPlist ExportOptions.plist -allowProvisioningUpdates$' "--ipa"
want "$out" 'xcrun altool --upload-app -f' "--ipa"
out=$(run ../examples/hello --target ios -o "$tmp/i2" --ipa) && { echo "a device IPA without a team went on"; fail=1; }
want "$out" 'a device build is signed by your Apple team: set zinc.json signing.ios.team or ZINC_IOS_TEAM' "--ipa without a team"
pl="$tmp/i1/ExportOptions.plist"
command -v plutil >/dev/null 2>&1 && { plutil -lint "$pl" "$tmp/i1/PrivacyInfo.xcprivacy" >/dev/null || { echo "ExportOptions.plist or PrivacyInfo.xcprivacy is not a valid plist"; fail=1; }; }
grep -A1 '<key>method</key>' "$pl" | grep -q app-store-connect && grep -A1 '<key>signingStyle</key>' "$pl" | grep -q automatic && ! grep -q teamID "$pl" || { echo "hello's ExportOptions.plist is not app-store-connect, automatic, no team"; fail=1; }
grep -q 'PrivacyInfo.xcprivacy PROPERTIES MACOSX_PACKAGE_LOCATION Resources' "$tmp/i1/CMakeLists.txt" || { echo "PrivacyInfo.xcprivacy is not in the bundle"; fail=1; }

# zinc.json signing.ios: the team, an old method name mapped to the new one, a profile for manual signing
mkdir -p "$tmp/pad"
echo 'console.log("pad");' > "$tmp/pad/main.ts"
echo '{ "name": "pad", "entry": "main.ts", "app": { "id": "org.example.pad" }, "signing": { "ios": { "team": "ABCDE12345", "method": "ad-hoc", "profile": "Pad Ad Hoc" } } }' > "$tmp/pad/zinc.json"
out=$(run "$tmp/pad" --target ios -o "$tmp/i3" --ipa --dry-run)
want "$out" "^+ cmake -S . -B build-device -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DZINC_TEAM='ABCDE12345' -DZINC_PROFILE='Pad Ad Hoc'$" "signing.ios"
pl="$tmp/i3/ExportOptions.plist"
grep -A1 '<key>method</key>' "$pl" | grep -q release-testing && grep -A1 '<key>teamID</key>' "$pl" | grep -q ABCDE12345 && grep -A1 '<key>signingStyle</key>' "$pl" | grep -q manual &&
  grep -A3 '<key>provisioningProfiles</key>' "$pl" | grep -q '<key>org.example.pad</key>' && grep -A4 '<key>provisioningProfiles</key>' "$pl" | grep -q 'Pad Ad Hoc' || { echo "ExportOptions.plist does not follow signing.ios: $(cat "$pl")"; fail=1; }
grep -q 'XCODE_ATTRIBUTE_PROVISIONING_PROFILE_SPECIFIER "${ZINC_PROFILE}" XCODE_ATTRIBUTE_CODE_SIGN_IDENTITY "Apple Distribution"' "$tmp/i3/CMakeLists.txt" || { echo "the manual signing of ZINC_PROFILE is not in CMakeLists.txt"; fail=1; }
echo '{ "name": "pad", "entry": "main.ts", "signing": { "ios": { "method": "store" } } }' > "$tmp/pad/zinc.json"
out=$(run "$tmp/pad" --target ios -o "$tmp/i4" --ipa --dry-run) && { echo "an unknown export method was accepted"; fail=1; }
want "$out" 'one of app-store-connect (app-store), release-testing (ad-hoc), debugging (development), enterprise' "an unknown method"

# --ipa --simulator: the Debug .app for the simulator, zipped
out=$(run ../examples/hello --target ios -o "$tmp/i5" --ipa --simulator --dry-run)
want "$out" '^+ cmake -S . -B build -G Xcode -DCMAKE_SYSTEM_NAME=iOS -DCMAKE_OSX_ARCHITECTURES=[a-z0-9_]* -DCMAKE_OSX_SYSROOT=iphonesimulator$' "--simulator"
want "$out" '^+ xcodebuild -quiet -project build/hello.xcodeproj -scheme hello -configuration Debug -sdk iphonesimulator .* CODE_SIGNING_ALLOWED=NO build$' "--simulator"
want "$out" '^+ ditto -c -k --keepParent build/Debug-iphonesimulator/hello.app hello-simulator.zip$' "--simulator"
[ -d "$tmp/i5/build" ] || [ -d "$tmp/i1/build-device" ] && { echo "--dry-run built something"; fail=1; }

# PrivacyInfo.xcprivacy: the engine's categories, and a plugin's (plugin.json targets.ios.privacy) merged with them
p="$tmp/i1/PrivacyInfo.xcprivacy"
for c in FileTimestamp:C617.1 SystemBootTime:35F9.1 DiskSpace:E174.1; do
  grep -A4 "NSPrivacyAccessedAPICategory${c%%:*}<" "$p" | grep -q "<string>${c#*:}</string>" || { echo "PrivacyInfo.xcprivacy lacks ${c%%:*} ${c#*:}"; fail=1; }
done
grep -q UserDefaults "$p" && { echo "hello declares user defaults, which the engine does not call"; fail=1; }
cp -R tests/data/mobile-plugin "$tmp/priv"
perl -0pi -e 's/("entitlements": \{ "com.apple.developer.associated-domains": \["applinks:example.org"\] \})/$1,\n      "privacy": { "NSPrivacyAccessedAPICategoryUserDefaults": ["CA92.1"], "NSPrivacyAccessedAPICategoryFileTimestamp": ["3B52.1"] }/' "$tmp/priv/plugins/beep/plugin.json"
run "$tmp/priv" --target ios -o "$tmp/i6" >/dev/null || { echo "export of a plugin with privacy failed"; fail=1; }
p="$tmp/i6/PrivacyInfo.xcprivacy"
grep -A4 'NSPrivacyAccessedAPICategoryUserDefaults<' "$p" | grep -q CA92.1 && grep -A5 'NSPrivacyAccessedAPICategoryFileTimestamp<' "$p" | grep -q 3B52.1 && grep -A5 'NSPrivacyAccessedAPICategoryFileTimestamp<' "$p" | grep -q C617.1 ||
  { echo "the plugin's privacy categories are not merged: $(grep -c string "$p") strings"; fail=1; }

# the options belong to their targets
run ../examples/hello --target ios -o "$tmp/x" --aab >/dev/null && { echo "--aab was taken for ios"; fail=1; }
run ../examples/hello --target android -o "$tmp/x" --dry-run >/dev/null && { echo "--dry-run alone was taken"; fail=1; }
[ -f "$tmp/ran" ] && { echo "a tool ran: $(cat "$tmp/ran")"; fail=1; }
[ $fail -eq 0 ] && echo "export packages: ok"
exit $fail
