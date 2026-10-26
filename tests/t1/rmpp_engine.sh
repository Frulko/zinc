#!/bin/sh
# The reMarkable engine bundle (ZN-841): tools/rmpp-engine over a stand-in Linux package (no cross build here), then the bundle's layout, and
# zinc-tile and the launchers it writes run on this machine with stand-ins for zinc and the lease: the qtfb tile runs zinc-app, which runs
# `zinc run <app>` with libquill.so's directory and the vendor's on the library path; the session tile refuses an unverified display engine
# and starts `lease launch --watchdog 10 --vendor-sha256 <hash> zinc-app <app>`, and zinc-app under the lease asks for the ink session.
# share/zinc/rmpp/engine.json says what the bundle's zinc runs (the zinc-engine line its binary carries) for the hub's engine updates.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail() { echo "FAIL $*"; exit 1; }
# the package tools/build-linux makes, reduced to what the bundle needs: a stand-in zinc that prints what it is asked
p=$tmp/pkg/zinc-0.0.0-linux-aarch64
mkdir -p "$p/bin" "$p/lib" "$p/share/zinc/plugins/display-rmpp/prebuilt/rmpp"
printf '#!/bin/sh\n# zinc-engine zbc=8 rt=612\necho "zinc $* LD_LIBRARY_PATH=$LD_LIBRARY_PATH ZINC_RMPP_INK=${ZINC_RMPP_INK:-} HOME=$HOME"\n[ -n "$ZA_SLEEP" ] && sleep "$ZA_SLEEP"\nexit 0\n' > "$p/bin/zinc"; chmod 755 "$p/bin/zinc"
: > "$p/share/zinc/plugins/display-rmpp/prebuilt/rmpp/plugin.so"
tar czf "$tmp/pkg.tar.gz" -C "$tmp/pkg" zinc-0.0.0-linux-aarch64
# a zig that "builds" the lease as a stand-in printing its arguments (the real one is an aarch64 binary)
printf '#!/bin/sh\nwhile [ "$1" != -o ]; do shift; done\nprintf "#!/bin/sh\\necho lease \\"\\$@\\"\\n" > "$2"; chmod 755 "$2"\n' > "$tmp/zig"; chmod 755 "$tmp/zig"
ZINC_ZIG=$tmp/zig tools/rmpp-engine --package "$tmp/pkg.tar.gz" -o "$tmp/out" > "$tmp/log" 2>&1 || { cat "$tmp/log"; fail "tools/rmpp-engine"; }
sh -n "$tmp/out/deploy.sh" || fail "deploy.sh does not parse"
mkdir "$tmp/tablet" && tar xzf "$tmp/out/zinc-rmpp.tar.gz" -C "$tmp/tablet" || fail "zinc-rmpp.tar.gz does not unpack"
z=$tmp/tablet/zinc
for f in bin/zinc bin/zinc-app bin/zinc-tile bin/lease bin/qtfb-hold lib/libquill.so QUILL-LICENSE share/zinc/rmpp/icon.png share/zinc/rmpp/verified \
         share/zinc/plugins/display-rmpp/prebuilt/rmpp/plugin.so lib/libpdfium.so PDFIUM-LICENSES/pdfium.txt; do [ -e "$z/$f" ] || fail "the bundle has no $f"; done
cmp -s "$z/lib/libquill.so" integrations/remarkable-ink/quill/libquill.so || fail "lib/libquill.so is not Quill's"
grep -qx 07aa9327f725288a5df5aebc33ea4b151c27d97d3b850279947ddddf3dd8ddec "$z/share/zinc/rmpp/verified" || fail "verified lacks OS 3.29's display engine"
[ "$(cat "$z/share/zinc/rmpp/engine.json" 2>/dev/null)" = '{"version":"0.0.0","zbc":8,"rt":612}' ] && cmp -s "$z/share/zinc/rmpp/engine.json" "$tmp/out/engine.json" \
  || fail "engine.json: $(cat "$z/share/zinc/rmpp/engine.json" 2>/dev/null)"
echo "bundle: ok ($(tar tzf "$tmp/out/zinc-rmpp.tar.gz" | wc -l | tr -d ' ') entries)"
# the tiles, against a stand-in vendor library whose hash the engine then verifies
export ZINC_APPLOAD=$tmp/appload ZINC_QSGEPAPER=$tmp/libqsgepaper.so
echo vendor > "$ZINC_QSGEPAPER"
echo 'zapp' > "$tmp/notes.zapp"
"$z/bin/zinc-tile" "$tmp/notes.zapp" > /dev/null || fail "zinc-tile (qtfb)"
"$z/bin/zinc-tile" "$tmp/notes.zapp" --session 2> "$tmp/err" && fail "the session tile was made for an unverified display engine"
grep -q "not verified" "$tmp/err" || fail "no reason for the refused session tile: $(cat "$tmp/err")"
sha256sum "$ZINC_QSGEPAPER" | cut -c1-64 >> "$z/share/zinc/rmpp/verified"
"$z/bin/zinc-tile" "$tmp/notes.zapp" --session > /dev/null || fail "zinc-tile --session"
python3 - "$ZINC_APPLOAD" <<'PY' || exit 1
import json, sys
for tile, qtfb in (('zinc-notes', True), ('zinc-notes-session', False)):
    m = json.load(open(f'{sys.argv[1]}/{tile}/external.manifest.json'))
    want = {'application': 'launch.sh', 'qtfb': qtfb, 'workingDirectory': f'{sys.argv[1]}/{tile}', 'disablesWindowedMode': not qtfb}
    bad = {k: m.get(k) for k in want if m.get(k) != want[k]}
    if bad: sys.exit(f'FAIL {tile}/external.manifest.json: {bad}')
    if open(f'{sys.argv[1]}/{tile}/icon.png', 'rb').read(8) != b'\x89PNG\r\n\x1a\n': sys.exit(f'FAIL {tile}/icon.png is not a PNG')
print('tiles: ok')
PY
cmp -s "$ZINC_APPLOAD/zinc-notes/icon.png" "$z/share/zinc/rmpp/icon.png" || fail "a .zapp without icon.png does not get the default tile icon"
# a .zapp with icon.png (zinc pack from zinc.json app.icon): the tile shows it
mkdir "$tmp/icon" && python3 -c 'import sys, zlib, struct
c = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))
sys.stdout.buffer.write(b"\x89PNG\r\n\x1a\n" + c(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 0, 0, 0, 0)) + c(b"IDAT", zlib.compress(b"\0\0")) + c(b"IEND", b""))' > "$tmp/icon/icon.png"
COPYFILE_DISABLE=1 tar cf "$tmp/drawn.zapp" -C "$tmp/icon" icon.png
"$z/bin/zinc-tile" "$tmp/drawn.zapp" > /dev/null || fail "zinc-tile (a .zapp with an icon)"
cmp -s "$ZINC_APPLOAD/zinc-drawn/icon.png" "$tmp/icon/icon.png" || fail "the tile does not show the .zapp's icon.png"
echo "icons: ok"
# zinc.json "display": {"keyboard": true}: the tile asks AppLoad for its on-screen keyboard; the others do not
mkdir "$tmp/kb" && printf '{ "name": "typer", "display": { "driver": "rmpp", "keyboard": true } }\n' > "$tmp/kb/zinc.json"
COPYFILE_DISABLE=1 tar cf "$tmp/typer.zapp" -C "$tmp/kb" zinc.json
"$z/bin/zinc-tile" "$tmp/typer.zapp" > /dev/null || fail "zinc-tile (a .zapp with the keyboard)"
python3 -c 'import json, sys; m = json.load(open(sys.argv[1])); sys.exit(m.get("supportsVirtualKeyboard") is not True)' "$ZINC_APPLOAD/zinc-typer/external.manifest.json" ||
  fail "the keyboard tile has no supportsVirtualKeyboard: $(cat "$ZINC_APPLOAD/zinc-typer/external.manifest.json")"
grep -q supportsVirtualKeyboard "$ZINC_APPLOAD/zinc-drawn/external.manifest.json" && fail "a tile without the keyboard asks for it"
echo "keyboard: ok"
out=$(HOME=/home/root "$ZINC_APPLOAD/zinc-notes/launch.sh")
[ "$out" = "zinc run $tmp/notes.zapp LD_LIBRARY_PATH=$z/lib:/usr/lib/plugins/scenegraph ZINC_RMPP_INK= HOME=/home/root" ] || fail "qtfb launch: $out"
V=$(sha256sum "$ZINC_QSGEPAPER" | cut -c1-64)
out=$("$ZINC_APPLOAD/zinc-notes-session/launch.sh")
[ "$out" = "lease launch --watchdog 10 --vendor-sha256 $V $z/bin/zinc-app $tmp/notes.zapp" ] || fail "session launch: $out"
out=$(env -u HOME ZINC_LEASE=1 "$z/bin/zinc-app" "$tmp/notes.zapp")   # what the lease's unit runs: no HOME, ZINC_LEASE set
[ "$out" = "zinc run $tmp/notes.zapp LD_LIBRARY_PATH=$z/lib:/usr/lib/plugins/scenegraph ZINC_RMPP_INK=session HOME=/home/root" ] || fail "zinc-app under the lease: $out"
sed 's/^/x/' "$z/share/zinc/rmpp/verified" > "$tmp/v" && mv "$tmp/v" "$z/share/zinc/rmpp/verified"   # an OS update: the hash is no longer verified
"$ZINC_APPLOAD/zinc-notes-session/launch.sh" > /dev/null 2>&1 && fail "the session launcher ran the lease on an unverified display engine"
"$z/bin/zinc-tile" --remove zinc-notes-session > /dev/null && [ ! -e "$ZINC_APPLOAD/zinc-notes-session" ] || fail "zinc-tile --remove"
# one instance per app: a second launch of the same .zapp stops the first, another app is left running
export TMPDIR=$tmp
ZA_SLEEP=30 "$z/bin/zinc-app" "$tmp/notes.zapp" > /dev/null & first=$!
ZA_SLEEP=30 "$z/bin/zinc-app" "$tmp/drawn.zapp" > /dev/null & other=$!
sleep 1
ZA_SLEEP=30 "$z/bin/zinc-app" "$tmp/notes.zapp" > /dev/null & second=$!
sleep 1
kill -0 $first 2>/dev/null && { kill $first $second $other; fail "a second launch of the same app left the first running"; }
kill -0 $second 2>/dev/null && kill -0 $other 2>/dev/null || { kill $second $other 2>/dev/null; fail "the second instance or another app was stopped"; }
kill $second $other; wait 2>/dev/null
echo "launchers: ok"
