#!/bin/sh
# .zapp archives (ZN-318): `zinc pack` of a project twice gives byte-identical files (a ustar that `tar` lists), `zinc run app.zapp` prints and
# draws what `zinc run dir` does, and a corrupted archive, one made for a newer engine, or one naming a file outside it is refused with a message.
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_SCALE=1 ZINC_STORAGE="$tmp/storage"
fail=0
"$Z" new game-2d "$tmp/game" >/dev/null && "$Z" new cli "$tmp/cli" >/dev/null || exit 2
"$Z" pack "$tmp/game" -o "$tmp/a.zapp" >/dev/null && "$Z" pack "$tmp/game" -o "$tmp/b.zapp" >/dev/null || { echo "zinc pack failed"; exit 1; }
cmp -s "$tmp/a.zapp" "$tmp/b.zapp" || { echo "two packs of the same project differ"; fail=1; }
[ "$(tar tf "$tmp/a.zapp" | tr '\n' ' ')" = "manifest.json assets/coin.svg assets/player.svg program.zbc resources.bin zinc.json " ] || { echo "unexpected content: $(tar tf "$tmp/a.zapp" | tr '\n' ' ')"; fail=1; }
frame() { ZINC_SIZE=640x400 ZINC_FRAMES=8 ZINC_FRAMEHASH=last "$Z" run "$1" 2>&1 | grep framehash; }
[ "$(cd "$tmp/game" && frame .)" = "$(frame "$tmp/a.zapp")" ] || { echo "the packed game draws another frame: $(frame "$tmp/a.zapp")"; fail=1; }
"$Z" pack "$tmp/cli" -o "$tmp/cli.zapp" >/dev/null || { echo "zinc pack cli failed"; fail=1; }
[ "$(cd "$tmp/cli" && "$Z" run . 2>&1)" = "$("$Z" run "$tmp/cli.zapp" 2>&1)" ] || { echo "the packed cli prints otherwise: $("$Z" run "$tmp/cli.zapp" 2>&1 | head -2)"; fail=1; }
python3 - "$tmp" <<'PY' || exit 2
import io, sys, tarfile
tmp = sys.argv[1]
data = bytearray(open(f'{tmp}/cli.zapp', 'rb').read())
data[2000] ^= 0x55                                    # a byte of program.zbc
open(f'{tmp}/corrupt.zapp', 'wb').write(data)
def rewrite(out, edit):
    src = tarfile.open(f'{tmp}/cli.zapp')
    buf = io.BytesIO(); dst = tarfile.open(fileobj=buf, mode='w', format=tarfile.USTAR_FORMAT)
    for m in src.getmembers():
        b = src.extractfile(m).read(); b, name = edit(m.name, b)
        info = tarfile.TarInfo(name); info.size = len(b); dst.addfile(info, io.BytesIO(b))
    dst.close(); open(out, 'wb').write(buf.getvalue())
rewrite(f'{tmp}/newer.zapp', lambda n, b: (b.replace(b'"engine": "', b'"engine": "99.') if n == 'manifest.json' else b, n))
rewrite(f'{tmp}/escape.zapp', lambda n, b: (b, '../evil' if n == 'zinc.json' else n))
PY
check() { out=$("$Z" run "$tmp/$1" 2>&1); rc=$?; [ $rc -ne 0 ] && echo "$out" | grep -q "$2" || { echo "$1: rc $rc, '$out' (want: $2)"; fail=1; }; }
check corrupt.zapp 'corrupted'
check newer.zapp 'update zinc'
check escape.zapp 'outside'
[ $fail -eq 0 ] && echo "zapp: ok"
exit $fail
