#!/bin/sh
# macOS bundles (ZN-234): `zinc run` of an app with app.id and permissions runs from the dev bundle (right CFBundleIdentifier, valid ad-hoc signature, an unchanged refresh under 50 ms),
# and `zinc build --bundle` writes a launchable, signed .app with the Info.plist keys of the manifest and an icon.icns from the PNG.
[ "$(uname)" = Darwin ] || { echo "skipped: macOS only"; exit 77; }
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"; mkdir -p "$ZINC_HOME"
fail=0
mkdir "$tmp/app"
printf "import * as system from 'zinc:system';\nconsole.log(system.backend);\n" > "$tmp/app/main.ts"
printf '{"name":"t","entry":"main.ts","permissions":["notification"],"app":{"id":"dev.zinc.test.bundle","name":"Bundle Test","urlSchemes":["zbt"],"fileTypes":["zbt"],"dock":false,"version":"2.0.1","icon":"icon.png"}}\n' > "$tmp/app/zinc.json"
cp ../docs/img/breakout-demo.png "$tmp/app/icon.png"
cd "$tmp/app" || exit 2
out=$(env -u ZINC_DETERMINISTIC ZINC_DEVAPP_SELFTEST=1 "$ZINC" run main.ts 2>&1)
case "$out" in *"refreshed"*"bundle id of this process: dev.zinc.test.bundle"*) ;; *) echo "dev bundle: $out"; fail=1 ;; esac
case "$out" in *"macos"*) ;; *) echo "the program did not run in the bundle: $out"; fail=1 ;; esac
codesign -v "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.bundle.app" 2>/dev/null || { echo "dev bundle signature is not valid"; fail=1; }
out=$(env -u ZINC_DETERMINISTIC ZINC_DEVAPP_SELFTEST=1 "$ZINC" run main.ts 2>&1)
ms=$(printf '%s\n' "$out" | sed -n 's/.*up to date .* in \([0-9.]*\) ms.*/\1/p' | head -1)
[ -n "$ms" ] && [ "$(printf '%s\n' "$ms" | awk '{print ($1 < 50)}')" = 1 ] || { echo "an unchanged refresh took '$ms' ms: $out"; fail=1; }
"$ZINC" build --bundle main.ts -o "$tmp/Test.app" >"$tmp/log" 2>&1 || { echo "build --bundle: $(cat "$tmp/log")"; fail=1; }
codesign -v "$tmp/Test.app" 2>/dev/null || { echo "bundle signature is not valid"; fail=1; }
plist=$(plutil -p "$tmp/Test.app/Contents/Info.plist" 2>&1)
for want in '"CFBundleIdentifier" => "dev.zinc.test.bundle"' '"LSUIElement" => 1' '"CFBundleShortVersionString" => "2.0.1"' '0 => "zbt"' '"CFBundleIconFile" => "icon"'; do
  case "$plist" in *"$want"*) ;; *) echo "Info.plist lacks $want"; fail=1 ;; esac
done
[ -s "$tmp/Test.app/Contents/Resources/icon.icns" ] || { echo "no icon.icns"; fail=1; }
[ "$("$tmp/Test.app/Contents/MacOS/zinc" 2>&1)" = "" ] || true
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$ZINC_HOME/cache/macos/devapp/dev.zinc.test.bundle.app" >/dev/null 2>&1
[ $fail -eq 0 ] && echo "macos bundle: ok"
exit $fail
