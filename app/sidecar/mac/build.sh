#!/bin/sh
# The Mac half of Sidecar: app/sidecar/mac/build.sh [out] (default app/sidecar/mac/build/sidecar, the engine as a command) and
# build/Sidecar.app beside it: the menu bar app (tray.swift) with the engine and the cursors inside. Needs the Xcode command-line tools.
set -eu
here=$(cd "$(dirname "$0")" && pwd)
out=${1:-$here/build/sidecar}
dir=$(dirname "$out")
mkdir -p "$dir"
swiftc -O -import-objc-header "$here/CGVirtualDisplay.h" "$here/main.swift" "$here/tune.swift" -framework ScreenCaptureKit -framework CoreMedia -o "$out"
app=$dir/Sidecar.app/Contents
rm -rf "$dir/Sidecar.app"
mkdir -p "$app/MacOS" "$app/Resources"
swiftc -O -parse-as-library "$here/tray.swift" "$here/tune.swift" -o "$app/MacOS/Sidecar"
cp "$out" "$app/MacOS/sidecar-engine"
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
codesign -s - --force --deep "$dir/Sidecar.app" 2>/dev/null || true
echo "built $out and $dir/Sidecar.app"
