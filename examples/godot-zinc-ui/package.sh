#!/bin/sh
set -eu
cd "$(dirname "$0")/../.."
root=$PWD
GODOT=${GODOT:-$(tools/godot/fetch)}
app="$root/examples/godot-zinc-ui/build/Warehouse.app"
[ -f examples/godot-zinc-ui/godot/bin/libzinc_godot.dylib ] || { echo 'Run examples/godot-zinc-ui/build.sh first'; exit 1; }
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/project/.godot"
cp "$GODOT" "$app/Contents/MacOS/GodotRuntime"
cp examples/godot-zinc-ui/godot/project.godot examples/godot-zinc-ui/godot/warehouse.gd examples/godot-zinc-ui/godot/warehouse.tscn examples/godot-zinc-ui/godot/zinc.gdextension "$app/Contents/Resources/project/"
mkdir -p "$app/Contents/Resources/project/bin"
cp examples/godot-zinc-ui/godot/bin/libzinc_godot.dylib "$app/Contents/Resources/project/bin/"
printf 'res://zinc.gdextension\n' > "$app/Contents/Resources/project/.godot/extension_list.cfg"
cat > "$app/Contents/MacOS/Warehouse" <<'EOF'
#!/bin/sh
here=$(CDPATH= cd -- "$(dirname "$0")" && pwd)
exec "$here/GodotRuntime" --path "$here/../Resources/project" "$@"
EOF
chmod +x "$app/Contents/MacOS/Warehouse"
cat > "$app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Warehouse</string><key>CFBundleIdentifier</key><string>org.zinc.godot-warehouse</string><key>CFBundleName</key><string>Warehouse</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>
EOF
cp -R examples/godot-zinc-ui/licenses "$app/Contents/Resources/"
codesign --force --sign - "$app/Contents/MacOS/GodotRuntime"
printf 'Built: %s\n' "$app"
