#!/bin/sh
# Prebuilt plugin libraries (ZN-328.03): `zinc plugin-build <p> <proj> --prebuild` copies the native libraries into the plugin's prebuilt/<target>/ with their key; on a
# machine with a fresh cache and no working compiler (CXX=false) the plugin then loads from there and the program runs. Without prebuilt/, or with a key of other
# options or another engine, the plugin is built locally as before.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null && command -v ar >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/proj/plugins"
cp -R ../plugins/device "$tmp/proj/plugins/device"
printf '{ "name": "app", "entry": "main.ts" }\n' > "$tmp/proj/zinc.json"
printf "import * as device from 'zinc:device';\nconsole.log('touch ' + device.hasTouch());\n" > "$tmp/proj/main.ts"
ZINC_HOME="$tmp/h1" "$Z" plugin-build device "$tmp/proj" --prebuild > "$tmp/out" 2>&1 || { echo "plugin_prebuilt: --prebuild failed: $(cat "$tmp/out")"; exit 1; }
t=$(ls "$tmp/proj/plugins/device/prebuilt")
for f in key plugin.a; do [ -s "$tmp/proj/plugins/device/prebuilt/$t/$f" ] || { echo "plugin_prebuilt: prebuilt/$t/$f is missing"; fail=1; }; done
out=$(ZINC_HOME="$tmp/h2" CXX=false CC=false "$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "^device prebuilt " || { echo "plugin_prebuilt: the prebuilt libraries were not used: $out"; fail=1; }
(cd "$tmp/proj" && ZINC_HOME="$tmp/h2" CXX=false CC=false "$Z" run main.ts 2>&1) | grep -qx "touch true\|touch false" || { echo "plugin_prebuilt: the program does not run on the prebuilt library: $(cd "$tmp/proj" && ZINC_HOME="$tmp/h2" CXX=false CC=false "$Z" run main.ts 2>&1 | head -3)"; fail=1; }
echo 0000000000000000 > "$tmp/proj/plugins/device/prebuilt/$t/key"
out=$(ZINC_HOME="$tmp/h3" "$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "^device built " && echo "$out" | grep -q "other options or another engine" || { echo "plugin_prebuilt: a foreign key does not fall back to a local build: $out"; fail=1; }
rm -rf "$tmp/proj/plugins/device/prebuilt"
out=$(ZINC_HOME="$tmp/h4" "$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "^device built " || { echo "plugin_prebuilt: without prebuilt/ the plugin is not built locally: $out"; fail=1; }
exit $fail
