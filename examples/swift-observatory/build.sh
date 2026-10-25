#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
root=$PWD
out="$root/examples/swift-observatory/build"
app="$out/Native Observatory.app"
ZINC=${ZINC:-$root/build/zinc}
[ -f "${BUILD:-$root/build}/zn_app.link" ] || { echo 'First run: cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && tools/build zn_app zinc'; exit 1; }
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks"
ZN_AOT_CPP_ONLY=1 "$ZINC" build examples/swift-observatory -o "$out/scene"
EMBED_LINK_FLAGS='-dynamiclib -Wl,-install_name,@rpath/libObservatory.dylib' tools/link-embedded "$out/scene" "$app/Contents/Frameworks/libObservatory.dylib" examples/swift-observatory/native/Observatory.cpp
swiftc -O -I include -import-objc-header examples/swift-observatory/native/Observatory.h examples/swift-observatory/native/Main.swift -L "$app/Contents/Frameworks" -lObservatory -Xlinker -rpath -Xlinker @executable_path/../Frameworks -o "$app/Contents/MacOS/Observatory"
cat > "$app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Observatory</string><key>CFBundleIdentifier</key><string>dev.zinc.observatory</string><key>CFBundleName</key><string>Native Observatory</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>
PLIST
printf 'Built: %s\n' "$app"
