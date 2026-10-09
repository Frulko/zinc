#!/bin/sh
# Plugin cache keys (ZN-332): plugins build with the pinned zig, so the key names the compiler by its version and never a path: the same plugin copied to two places,
# built under two homes, gets the same key (a Linux container and a cross build from the Mac agree too: ZN-332 notes). ZINC_PLUGIN_CC=system, or zinc.json "pluginCompiler":
# "system", builds with the system compiler under another key. Skipped (77) without the pinned zig or a system compiler.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tc="${ZINC_HOME:-$HOME/.zinc}/toolchains"
ls -d "$tc"/zig-* >/dev/null 2>&1 || { echo "plugin_key: no pinned zig downloaded"; exit 77; }
command -v c++ >/dev/null || { echo "plugin_key: no system compiler"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/h1" "$tmp/h2" "$tmp/a/plugins" "$tmp/b/deeper/b/plugins"
ln -s "$tc" "$tmp/h1/toolchains"; ln -s "$tc" "$tmp/h2/toolchains"
cp -R ../plugins/device "$tmp/a/plugins/"; cp -R ../plugins/device "$tmp/b/deeper/b/plugins/"
echo '{ "name": "a" }' > "$tmp/a/zinc.json"; echo '{ "name": "b" }' > "$tmp/b/deeper/b/zinc.json"
key() { sed -n 's#.*/plugins/\(device-[0-9a-f]*\)/.*#\1#p'; }
k1=$(ZINC_HOME="$tmp/h1" "$Z" plugin-build device "$tmp/a" 2>&1 | key)
k2=$(ZINC_HOME="$tmp/h2" "$Z" plugin-build device "$tmp/b/deeper/b" 2>&1 | key)
[ -n "$k1" ] && [ "$k1" = "$k2" ] || { echo "plugin_key: two places give two keys: '$k1' '$k2'"; fail=1; }
ks=$(ZINC_PLUGIN_CC=system ZINC_HOME="$tmp/h2" "$Z" plugin-build device "$tmp/b/deeper/b" 2>&1 | key)
[ -n "$ks" ] && [ "$ks" != "$k1" ] || { echo "plugin_key: the system compiler does not build under its own key: '$ks'"; fail=1; }
echo '{ "name": "b", "pluginCompiler": "system" }' > "$tmp/b/deeper/b/zinc.json"
kz=$(ZINC_HOME="$tmp/h2" "$Z" plugin-build device "$tmp/b/deeper/b" 2>&1 | key)
[ "$kz" = "$ks" ] || { echo "plugin_key: zinc.json pluginCompiler does not select the system compiler: '$kz'"; fail=1; }
printf "import * as device from 'zinc:device';\nconsole.log('touch ' + device.hasTouch());\n" > "$tmp/a/main.ts"
(cd "$tmp/a" && ZINC_HOME="$tmp/h1" "$Z" run main.ts 2>&1) | grep -qx "touch true\|touch false" || { echo "plugin_key: the zig-built plugin does not load"; fail=1; }
exit $fail
