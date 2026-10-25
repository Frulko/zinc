#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
out="$PWD/examples/zinc-libgodot/build"
app="$out/Zinc Pocket Rally.app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Frameworks" "$app/Contents/Resources"
cp "$out/rally" "$app/Contents/MacOS/Rally"
cp "$out/rally.pck" "$app/Contents/MacOS/Rally.pck"
cp "$out/libgodot.dylib" "$app/Contents/Frameworks/libgodot.dylib"
cat > "$app/Contents/MacOS/Launcher" <<'EOF'
#!/bin/sh
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
exec "$here/Rally" "$here/../Frameworks/libgodot.dylib" "$@"
EOF
chmod +x "$app/Contents/MacOS/Launcher"
cat > "$app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Launcher</string><key>CFBundleIdentifier</key><string>org.zinc.libgodot-rally</string><key>CFBundleName</key><string>Zinc Pocket Rally</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>
EOF
cp -R examples/godot-zinc-ui/licenses "$app/Contents/Resources/"
printf 'Built: %s\n' "$app"
