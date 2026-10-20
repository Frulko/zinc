#!/bin/sh
# ZN-721: package an app with a transitive dylib dependency, move it, and verify signing.
[ "$(uname)" = Darwin ] || exit 77
cd "$(dirname "$0")/../.." || exit 2
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
mkdir -p "$t/source" "$t/Probe.app/Contents/MacOS" "$t/moved"
printf 'int inner(void) { return 42; }\n' > "$t/source/inner.c"
printf 'int inner(void); int outer(void) { return inner(); }\n' > "$t/source/outer.c"
printf '#include <stdio.h>\nint outer(void); int main(void) { printf("%%d\\n", outer()); }\n' > "$t/source/main.c"
cc -dynamiclib "$t/source/inner.c" -o "$t/source/libinner.dylib" || exit 1
cc -dynamiclib "$t/source/outer.c" "$t/source/libinner.dylib" -o "$t/source/libouter.dylib" || exit 1
cc "$t/source/main.c" "$t/source/libouter.dylib" -o "$t/Probe.app/Contents/MacOS/probe" || exit 1
cat > "$t/Probe.app/Contents/Info.plist" <<'PLIST'
<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>dev.zinc.test.package</string><key>CFBundleExecutable</key><string>probe</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>
PLIST
codesign --force --sign - "$t/Probe.app" >/dev/null 2>&1 || exit 1
tools/package --app "$t/Probe.app" > "$t/log" 2>&1 || { cat "$t/log"; exit 1; }
[ -s "$t/Probe.app.zip" ] && [ -s "$t/Probe.app/Contents/Frameworks/libinner.dylib" ] || exit 1
mv "$t/source" "$t/unavailable"
ditto -x -k "$t/Probe.app.zip" "$t/moved" || exit 1
out=$(cd / && "$t/moved/Probe.app/Contents/MacOS/probe" 2>&1)
[ "$out" = 42 ] || { echo "package_app: $out"; exit 1; }
codesign --verify --deep --strict "$t/moved/Probe.app" || exit 1
