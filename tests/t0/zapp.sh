#!/bin/sh
# .zapp archives (ZN-318): `zinc pack` of a project twice gives byte-identical files (a ustar that `tar` lists), `zinc run app.zapp` prints and
# draws what `zinc run dir` does, and a corrupted archive, one that needs runtime calls this engine lacks (needs.rt), one without needs made for a
# newer engine, or one naming a file outside it is refused with a message; one with needs packed by a newer engine runs (owner, 2026-10-26);
# an archive changed in place after a launch is checked again (ZN-430: launches read only the headers of an unchanged file).
# game-2d's packs ride along (packs/default.zpk: its sprite atlas, ZN-438), the same bytes in both archives.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_STORAGE="$tmp/storage"
fail=0
"$Z" new game-2d "$tmp/game" >/dev/null && "$Z" new cli "$tmp/cli" >/dev/null || exit 2
"$Z" pack "$tmp/game" -o "$tmp/a.zapp" >/dev/null && "$Z" pack "$tmp/game" -o "$tmp/b.zapp" >/dev/null || { echo "zinc pack failed"; exit 1; }
cmp -s "$tmp/a.zapp" "$tmp/b.zapp" || { echo "two packs of the same project differ"; fail=1; }
[ "$(tar tf "$tmp/a.zapp" | tr '\n' ' ')" = "manifest.json assets/coin.svg assets/coin.wav assets/player.svg packs/default.zpk program.info program.zbc resources.bin zinc.json " ] || { echo "unexpected content: $(tar tf "$tmp/a.zapp" | tr '\n' ' ')"; fail=1; }
frame() { ZINC_SIZE=640x400 ZINC_FRAMES=8 ZINC_FRAMEHASH=last "$Z" run "$1" 2>&1 | grep framehash; }
[ "$(cd "$tmp/game" && frame .)" = "$(frame "$tmp/a.zapp")" ] || { echo "the packed game draws another frame: $(frame "$tmp/a.zapp")"; fail=1; }
"$Z" pack "$tmp/cli" -o "$tmp/cli.zapp" >/dev/null || { echo "zinc pack cli failed"; fail=1; }
# a project on QuickJS carries its sources and runs on QuickJS, circular imports and all (examples/fatty)
mkdir -p "$tmp/q/src" && printf '{"name":"q","entry":"src/main.ts","engine":"quickjs"}\n' > "$tmp/q/zinc.json"
# and its import map's files outside the project (examples/js-three's third_party/three) ride along
mkdir -p "$tmp/lib" && printf "export const m = 'm';\n" > "$tmp/lib/m.js" && printf '{"imports":{"m":"../../lib/m.js"}}\n' > "$tmp/q/src/importmap.json"
printf "import { b } from './b';\nimport { m } from 'm';\nexport const a = 'a';\nconsole.log('quickjs ' + b() + m);\n" > "$tmp/q/src/main.ts"
printf "import { a } from './main';\nexport function b() { return a + 'b'; }\n" > "$tmp/q/src/b.ts"
"$Z" pack "$tmp/q" -o "$tmp/q.zapp" >/dev/null && rm -r "$tmp/lib" && [ "$(cd / && "$Z" run "$tmp/q.zapp" 2>/dev/null)" = "quickjs abm" ] || { echo "the QuickJS project's package does not run: $("$Z" run "$tmp/q.zapp" 2>&1 | tail -2)"; fail=1; }
# an asset that links to a file outside the project (hero's city.bin) is packed under its own name, not the link's target
"$Z" new cli "$tmp/linked" >/dev/null && mkdir -p "$tmp/shared" "$tmp/linked/assets" && echo data > "$tmp/shared/city.bin" && ln -s ../../shared/city.bin "$tmp/linked/assets/city.bin"
"$Z" pack "$tmp/linked" -o "$tmp/linked.zapp" >/dev/null && "$Z" run "$tmp/linked.zapp" >/dev/null 2>&1 && tar tf "$tmp/linked.zapp" | grep -qx 'assets/city.bin' ||
  { echo "a linked asset is not packed as assets/city.bin: $(tar tf "$tmp/linked.zapp" | tr '\n' ' ')"; fail=1; }
[ "$(cd "$tmp/cli" && "$Z" run . 2>&1)" = "$("$Z" run "$tmp/cli.zapp" 2>&1)" ] || { echo "the packed cli prints otherwise: $("$Z" run "$tmp/cli.zapp" 2>&1 | head -2)"; fail=1; }
python3 - "$tmp" <<'PY' || exit 2
import io, re, sys, tarfile
tmp = sys.argv[1]
data = bytearray(open(f'{tmp}/cli.zapp', 'rb').read())
data[data.index(b'program.zbc') + 612] ^= 0x55        # a byte of program.zbc (by its header: a fixed offset can fall in padding)
open(f'{tmp}/corrupt.zapp', 'wb').write(data)
def rewrite(out, edit):
    src = tarfile.open(f'{tmp}/cli.zapp')
    buf = io.BytesIO(); dst = tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT)
    for m in src.getmembers():
        b = src.extractfile(m).read(); b, name = edit(m.name, b)
        info = tarfile.TarInfo(name); info.size = len(b); dst.addfile(info, io.BytesIO(b))
    dst.close(); open(out, 'wb').write(buf.getvalue())
newer = lambda b: b.replace(b'"engine": "', b'"engine": "99.')
rewrite(f'{tmp}/newer.zapp', lambda n, b: (newer(b) if n == 'manifest.json' else b, n))                                       # packed by a newer zinc
rewrite(f'{tmp}/legacy.zapp', lambda n, b: (re.sub(rb'\n  "needs": [^\n]*', b'', newer(b)) if n == 'manifest.json' else b, n))  # and no needs
rewrite(f'{tmp}/needs.zapp', lambda n, b: (re.sub(rb'"rt": \d+', b'"rt": 65000', b) if n == 'manifest.json' else b, n))   # a call it lacks
rewrite(f'{tmp}/escape.zapp', lambda n, b: (b, '../evil' if n == 'zinc.json' else n))
PY
check() { out=$("$Z" run "$tmp/$1" 2>&1); rc=$?; [ $rc -ne 0 ] && echo "$out" | grep -q "$2" || { echo "$1: rc $rc, '$out' (want: $2)"; fail=1; }; }
check corrupt.zapp 'corrupted'
tar xOf "$tmp/cli.zapp" manifest.json | grep -q '"needs": {"zbc": [0-9]*, "rt": [0-9]*}' || { echo "the manifest has no needs"; fail=1; }
[ "$(cd "$tmp/cli" && "$Z" run . 2>&1)" = "$("$Z" run "$tmp/newer.zapp" 2>&1)" ] || { echo "an app packed by a newer zinc that needs nothing new is refused: $("$Z" run "$tmp/newer.zapp" 2>&1 | head -2)"; fail=1; }
check legacy.zapp 'this archive was made for zinc 99'
check needs.zapp 'needs a newer zinc engine (runtime call 64999, this engine has'
check escape.zapp 'outside'
# ZN-430: a launch reads only the headers and the manifest while the file is unchanged; a byte changed in place is checked again and refused
cp "$tmp/cli.zapp" "$tmp/inplace.zapp"
"$Z" run "$tmp/inplace.zapp" >/dev/null 2>&1 || { echo "inplace.zapp did not run"; fail=1; }
# a byte inside program.zbc (found by its header: a fixed offset may fall in the padding between two members, which changes no file)
python3 -c "import sys; f = open(sys.argv[1], 'r+b'); d = f.read(); at = d.index(b'program.zbc') + 512 + 100; f.seek(at); f.write(bytes([d[at] ^ 0x55]))" "$tmp/inplace.zapp"
check inplace.zapp 'corrupted'
[ $fail -eq 0 ] && echo "zapp: ok"
exit $fail
