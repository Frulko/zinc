#!/bin/sh
# Published plugin binaries (ZN-337): a binary packed by `zinc plugin-build --pack` and listed in a signed index as binaries/<target>/<name>-<key>.tar is
# fetched through the TUF client and used with no compiler run (a zig wrapper counts them) and the program runs on it; a tampered archive is reported and the
# plugin is built here; a plugin whose sources changed has another key, misses, and is built here. Skipped (77) without the pinned zig.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
export ZINC="$Z"
zig=${ZINC_ZIG:-$(ls -d "${ZINC_HOME:-$HOME/.zinc}"/toolchains/zig-*/zig 2>/dev/null | head -1)}
[ -x "$zig" ] || { echo "plugin_fetch: no pinned zig downloaded"; exit 77; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
mkdir -p "$tmp/zigw" && ln -s "$(dirname "$zig")/lib" "$tmp/zigw/lib"   # the counting wrapper beside a lib/, like the real zig
printf '#!/bin/sh\ncase "$1" in c++|cc) echo "$1" >> "%s/runs";; esac\nexec "%s" "$@"\n' "$tmp" "$zig" > "$tmp/zigw/zig"; chmod +x "$tmp/zigw/zig"
export ZINC_ZIG="$tmp/zigw/zig"
runs() { [ -f "$tmp/runs" ] && wc -l < "$tmp/runs" | tr -d ' ' || echo 0; }
mkdir -p "$tmp/proj"; echo '{ "name": "fetch" }' > "$tmp/proj/zinc.json"
printf "import * as device from 'zinc:device';\nconsole.log('touch ' + device.hasTouch());\n" > "$tmp/proj/main.ts"
out=$(ZINC_HOME="$tmp/pub" "$Z" plugin-build device "$tmp/proj" --pack "$tmp/device.tar" 2>&1) || { echo "plugin_fetch: the publisher build failed: $out"; exit 1; }
key=$(echo "$out" | sed -n 's#.*/plugins/device-\([0-9a-f]*\)/.*#\1#p' | head -1)
t=$(tar tf "$tmp/device.tar" | head -1 | cut -d/ -f1)
python3 - "$PWD/tools/index-repo" "$tmp" "$t" "$key" <<'PY' || exit 1
import importlib.machinery, importlib.util, sys
l = importlib.machinery.SourceFileLoader("ir", sys.argv[1]); s = importlib.util.spec_from_loader("ir", l); ir = importlib.util.module_from_spec(s); l.exec_module(ir)
tmp, target, key = sys.argv[2:5]
keys = {r: [ir.keygen()] for r in ir.ROLES}
ir.build(tmp + "/index", keys, {"binaries/%s/device-%s.tar" % (target, key): (open(tmp + "/device.tar", "rb").read(), None)})
PY
export ZINC_INDEX_URL="file://$tmp/index" ZINC_INDEX_ROOT="$tmp/index/root.json"
: > "$tmp/runs"
out=$(ZINC_HOME="$tmp/hit" "$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "^device fetched " && [ "$(runs)" = 0 ] || { echo "plugin_fetch: the published binary was not used ($(runs) compiler runs): $out"; fail=1; }
(cd "$tmp/proj" && ZINC_HOME="$tmp/hit" "$Z" run main.ts 2>&1) | grep -qx "touch true\|touch false" || { echo "plugin_fetch: the program does not run on the fetched binary"; fail=1; }
f="$tmp/index/targets/binaries/$t/device-$key.tar"; printf 'X' | dd of="$f" bs=1 seek=600 conv=notrunc 2>/dev/null
: > "$tmp/runs"
out=$(ZINC_HOME="$tmp/tampered" "$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "was refused" && echo "$out" | grep -q "^device built " && [ "$(runs)" -gt 0 ] || { echo "plugin_fetch: a tampered archive is not reported and rebuilt: $out"; fail=1; }
mkdir -p "$tmp/proj/plugins" && cp -R ../plugins/device "$tmp/proj/plugins/" && echo "// changed" >> "$tmp/proj/plugins/device/native/device.host.cpp"
: > "$tmp/runs"
out=$(ZINC_HOME="$tmp/changed" "$Z" plugin-build device "$tmp/proj" 2>&1)
echo "$out" | grep -q "^device built " && ! echo "$out" | grep -q "device-$key" && [ "$(runs)" -gt 0 ] || { echo "plugin_fetch: a changed plugin did not miss: $out"; fail=1; }
exit $fail
