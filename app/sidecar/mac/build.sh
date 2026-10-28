#!/bin/sh
# The Mac half of Sidecar: app/sidecar/mac/build.sh [out] (default app/sidecar/mac/build/sidecar, the engine as a command) and
# build/Sidecar.app beside it: the menu bar app (tray.swift) with the engine and the cursors inside; build/sidecar-screen, the engine for a
# colour screen with a network (screen.swift, app/sidecar-screen). Needs the Xcode command-line tools.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=${1:-$here/build/sidecar}
dir=$(dirname "$out")
mkdir -p "$dir"
# the vendored codecs, once: lz4 and zstd's compressor (the receivers decode, plugins/display-rmpp/stream.h)
root=$(cd "$here/../../.." && pwd)
obj=$dir/obj; mkdir -p "$obj"
if [ ! -f "$obj/.built" ]; then
  (cd "$obj" && clang -O2 -w -c -DZSTD_DISABLE_ASM -DZSTD_MULTITHREAD=0 -I"$root/third_party/zstd" "$root"/third_party/zstd/common/*.c "$root"/third_party/zstd/compress/*.c "$root"/third_party/zstd/decompress/*.c "$root/third_party/lz4/lz4.c")
  touch "$obj/.built"
fi
codecs="-Xcc -I$root/third_party/zstd -Xcc -I$root/third_party/lz4 -Xcc -I$here -import-objc-header $here/bridge.h"
swiftc -O $codecs "$here/main.swift" "$here/tune.swift" "$obj"/*.o -framework ScreenCaptureKit -framework CoreMedia -o "$out"
swiftc -O $codecs "$here/screen.swift" "$obj"/*.o -framework ScreenCaptureKit -framework CoreMedia -o "$dir/sidecar-screen"
app=$dir/Sidecar.app/Contents
rm -rf "$dir/Sidecar.app"
mkdir -p "$app/MacOS" "$app/Resources"
swiftc -O -parse-as-library "$here/tray.swift" "$here/tune.swift" -o "$app/MacOS/Sidecar"
cp "$out" "$app/MacOS/sidecar-engine"
cp "$dir/sidecar-screen" "$app/MacOS/sidecar-screen"
cp -R "$here/cursors" "$app/Resources/cursors"
cat > "$app/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Zinc Sidecar</string>
<key>CFBundleIdentifier</key><string>dev.zinc.sidecar</string>
<key>CFBundleExecutable</key><string>Sidecar</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleShortVersionString</key><string>0.2</string>
<key>LSMinimumSystemVersion</key><string>13.0</string>
<key>LSUIElement</key><true/>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
# a stable signature keeps the Screen Recording and Accessibility permissions across builds (an ad-hoc one is a new app to macOS each
# time): the first Apple Development identity of the keychain, or SIDECAR_SIGN, else ad hoc
sign=${SIDECAR_SIGN:-$(security find-identity -p codesigning -v 2>/dev/null | sed -n 's/.*) \([0-9A-F]\{40\}\) "Apple Development.*/\1/p' | head -n 1)}
codesign -s "${sign:--}" --force --deep "$dir/Sidecar.app" 2>/dev/null || codesign -s - --force --deep "$dir/Sidecar.app" 2>/dev/null || true
echo "built $out and $dir/Sidecar.app"
