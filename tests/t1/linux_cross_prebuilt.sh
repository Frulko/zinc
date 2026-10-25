#!/bin/sh
# ZN-823: a cross-built Linux package (tools/build-linux --arch aarch64, tools/package --linux-arch) ships each plugin's library for the device,
# so its first run compiles nothing. Three checks:
#  1. this machine's zinc cross-builds a plugin (`plugin-build --target linux-aarch64 --prebuild`) into a real aarch64 shared object, plugin.a and key;
#  2. the package dist/linux-aarch64 (ZINC_LINUX_DIST), when there: every plugin with native code for Linux has prebuilt/linux/{plugin.so,plugin.a,key}
#     or is named in sizes-linux.json with why;
#  3. with docker (an arm64 container) and that package: the packaged aarch64 zinc, as a device runs it, takes every prebuilt library
#     (`zinc plugin-build <name>` says "prebuilt": the key it computes matches, no compiler, no network).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/p/plugins" && cp -R plugins/svg "$tmp/p/plugins/" && rm -rf "$tmp/p/plugins/svg/prebuilt"
echo '{ "name": "pack" }' > "$tmp/p/zinc.json"
ZINC_PREBUILT=0 "$Z" plugin-build svg "$tmp/p" --target linux-aarch64 --prebuild > "$tmp/log" 2>&1 || { echo "cross plugin-build failed: $(tail -5 "$tmp/log")"; exit 1; }
python3 - "$tmp/p/plugins/svg/prebuilt/aarch64-linux" <<'PY' || exit 1
import os, sys
d = sys.argv[1]
for f in ("plugin.so", "plugin.a", "key"):
    if not os.path.exists(os.path.join(d, f)): sys.exit("svg: no %s in %s" % (f, d))
b = open(os.path.join(d, "plugin.so"), "rb").read(20)
if b[:4] != b"\x7fELF" or int.from_bytes(b[16:18], "little") != 3 or int.from_bytes(b[18:20], "little") != 183:
    sys.exit("svg: plugin.so is not an aarch64 shared object (%r)" % b[:20])
PY
echo "cross plugin-build: svg -> aarch64 plugin.so, plugin.a, key"

dist=${ZINC_LINUX_DIST:-dist/linux-aarch64}
pkg=$(ls -t "$dist"/zinc-*-linux-aarch64.tar.gz 2>/dev/null | head -1)
[ -n "$pkg" ] || { echo "no $dist/zinc-*-linux-aarch64.tar.gz (tools/build-linux --arch aarch64): package checks not run"; exit 0; }
tar -xzf "$pkg" -C "$tmp" && root=$(echo "$tmp"/zinc-*-linux-aarch64)
python3 - "$root/share/zinc" "$dist/sizes-linux.json" > "$tmp/with" <<'PY' || exit 1
import json, os, sys
share, sizes = sys.argv[1:]
without = json.load(open(sizes)).get("plugins_without_prebuilt", {})
bad, ok = [], []
for name in sorted(os.listdir("plugins")):
    m = os.path.join("plugins", name, "plugin.json")
    if not os.path.exists(m): continue
    m = json.load(open(m)); t = m.get("targets", {})
    nd = os.path.join("plugins", name, "native")
    native = m.get("kind") == "display" or (os.path.isdir(nd) and any(f.endswith(".spec.ts") for f in os.listdir(nd)))
    if not native or not isinstance(t, dict) or "linux" not in t: continue
    if m.get("kind") == "display" and not (t["linux"] or {}).get("sources"): continue
    pre = os.path.join(share, "plugins", name, "prebuilt", "linux")
    if all(os.path.exists(os.path.join(pre, f)) for f in ("plugin.so", "plugin.a", "key")): ok.append(name)
    elif name not in without: bad.append(name)
if bad: sys.exit("the package ships these plugins with no prebuilt/linux library and no reason in sizes-linux.json: " + ", ".join(bad))
print(" ".join(ok))
sys.stderr.write("package: %d plugins prebuilt, %d left out (%s)\n" % (len(ok), len(without), ", ".join(sorted(without))))
PY

command -v docker >/dev/null && docker info >/dev/null 2>&1 || { echo "no docker: the device-side key check not run"; exit 0; }
# the device: the packaged zinc in an arm64 Debian, no network, an empty ZINC_HOME (no zig): a key it would not accept fails the build
docker run --rm --platform linux/arm64 --network none -v "$root:/opt/zinc:ro" -e ZINC_HOME=/tmp/zh -e ZINC_PREBUILT=0 -e "PLUGINS=$(cat "$tmp/with")" \
  debian:bookworm-slim sh -c 'mkdir -p /tmp/p && echo "{ \"name\": \"p\" }" > /tmp/p/zinc.json && cd /tmp/p && fail=0
    for n in $PLUGINS; do out=$(/opt/zinc/bin/zinc plugin-build "$n" /tmp/p 2>&1); case "$out" in *" prebuilt "*) ;; *) echo "device: $n: $out" | head -3; fail=1 ;; esac; done
    exit $fail' || exit 1
echo "device (arm64 container): every prebuilt library taken, key accepted: $(wc -w < "$tmp/with" | tr -d ' ') plugins"
echo "linux cross prebuilt: ok"
