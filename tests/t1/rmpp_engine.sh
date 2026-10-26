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
for f in bin/zinc bin/zinc-app bin/zinc-tile bin/lease bin/qtfb-hold bin/zinc-watch lib/libquill.so QUILL-LICENSE share/zinc/rmpp/icon.png share/zinc/rmpp/verified \
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
# one instance per app: a second launch of the same .zapp stops the first, another app is left running; each starts its watcher as a
# child of the app's pid (zinc-app execs zinc) with the base of its files
export TMPDIR=$tmp
printf '#!/bin/sh\necho "$PPID $1" >> "%s/watchers"\n' "$tmp" > "$z/bin/zinc-watch"
ZA_SLEEP=30 "$z/bin/zinc-app" "$tmp/notes.zapp" > /dev/null & first=$!
ZA_SLEEP=30 "$z/bin/zinc-app" "$tmp/drawn.zapp" > /dev/null & other=$!
sleep 1
ZA_SLEEP=30 "$z/bin/zinc-app" "$tmp/notes.zapp" > /dev/null & second=$!
sleep 1
kill -0 $first 2>/dev/null && { kill $first $second $other; fail "a second launch of the same app left the first running"; }
kill -0 $second 2>/dev/null && kill -0 $other 2>/dev/null || { kill $second $other 2>/dev/null; fail "the second instance or another app was stopped"; }
base=$tmp/zinc-app-$(echo "$tmp/notes.zapp" | tr '/ ' '__')
grep -qx "$second $base" "$tmp/watchers" || fail "zinc-app did not start the watcher of pid $second on $base: $(cat "$tmp/watchers")"
kill $second $other; wait 2>/dev/null
echo "launchers: ok"

# zinc-watch itself, built for this machine with short thresholds, against a fake /proc: ok, busy (CPU high), waste (hidden and busy),
# memory, hung on screen (left alone), hung while hidden (stopped), hung with its window closed (its parent changed: stopped at once)
W=$tmp/zinc-watch; wp=$tmp/wproc
cc -O2 -DPERIOD_S=1 -DHUNG_S=2 -DBUSY_CHECKS=2 -DWASTE_CHECKS=2 -DMEM_KB=100000 -DSTOP_HIDDEN_S=3 integrations/remarkable-engine/zinc-watch.c -o "$W" || fail "cc zinc-watch.c"
mkdir "$wp"
export ZINC_PROC_ROOT=$wp
watched() {   # name: a stand-in app whose child is the watcher (as zinc-app makes it), its fake /proc entry and files
  b=$tmp/zinc-app-$1
  sh -c '"$0" "$1" 2>> "$2" & exec sleep 60' "$W" "$b" "$tmp/watch.err" & a=$!
  echo $a > "$b.pid"; mkdir -p "$wp/$a"; echo full > "$b.beat"; echo 1 > "$tmp/ppid"; echo 50000 > "$tmp/rss"; echo 0 > "$tmp/step"; echo full > "$tmp/mode"
}
ticker() {   # the kernel's and the engine's part: CPU ticks at $(cat step) per 0.25 s, the heartbeat while $tmp/beating exists
  t=0
  while kill -0 $a 2>/dev/null; do
    t=$((t + $(cat "$tmp/step")))
    printf '%s (zinc) S %s 0 0 0 0 0 0 0 0 0 %s 0\n' $a "$(cat "$tmp/ppid")" $t > "$wp/$a/stat.t" && mv "$wp/$a/stat.t" "$wp/$a/stat"
    printf 'Name:\tzinc\nVmRSS:\t%s kB\n' "$(cat "$tmp/rss")" > "$wp/$a/status"
    [ -e "$tmp/beating" ] && cat "$tmp/mode" > "$b.beat"
    sleep 0.25
  done
}
state() { cut -d' ' -f1 "$b.watch" 2>/dev/null; }
until_state() { i=0; while [ "$(state)" != "$1" ] && [ $i -lt 40 ]; do sleep 0.1; i=$((i + 1)); done; [ "$(state)" = "$1" ] || fail "$2: the watcher says '$(cat "$b.watch" 2>/dev/null)', not $1"; }
touch "$tmp/beating"
watched one; ticker & tk=$!
sleep 1.5; until_state ok "a quiet app"
echo 25 > "$tmp/step"; until_state busy "an app using a whole core"
echo hidden > "$tmp/mode"; until_state waste "a hidden app using the CPU"
grep -q "is hidden and uses" "$tmp/watch.err" || fail "no journal line for the battery waste: $(cat "$tmp/watch.err")"
echo 0 > "$tmp/step"; echo full > "$tmp/mode"; echo 200000 > "$tmp/rss"; until_state memory "an app above the memory limit"
echo 50000 > "$tmp/rss"; rm "$tmp/beating"; until_state hung "an app whose heartbeat stopped"
sleep 4; kill -0 $a 2>/dev/null || fail "the watcher stopped a hung app on screen (the user decides)"
echo hidden > "$b.beat"; touch -t 202001010000 "$b.beat"
i=0; while kill -0 $a 2>/dev/null && [ $i -lt 60 ]; do sleep 0.1; i=$((i + 1)); done
kill -0 $a 2>/dev/null && fail "a hung hidden app was not stopped"
grep -q "not responding while hidden" "$tmp/watch.err" || fail "no journal line for the stop: $(cat "$tmp/watch.err")"
wait $tk 2>/dev/null; sleep 1.2
for x in pid beat watch; do [ -e "$b.$x" ] && fail "the watcher left $b.$x after the app ended"; done
watched two; touch -t 202001010000 "$b.beat"; ticker & tk=$!
sleep 1.5; until_state hung "a second hung app"
echo 4242 > "$tmp/ppid"
i=0; while kill -0 $a 2>/dev/null && [ $i -lt 30 ]; do sleep 0.1; i=$((i + 1)); done
kill -0 $a 2>/dev/null && { kill $a; fail "a hung app whose window was closed was not stopped"; }
grep -q "its window was closed" "$tmp/watch.err" || fail "no journal line for the closed window: $(cat "$tmp/watch.err")"
wait 2>/dev/null
echo "watcher: ok"
