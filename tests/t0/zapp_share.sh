#!/bin/sh
# Editable .zapp snapshots reuse the normal archive/checksum reader and never replace an existing project.
cd "$(dirname "$0")/../.." || exit 2
Z=${ZINC:?set ZINC}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1
if "$Z" unpack "$tmp/missing.zapp" --out "$tmp/missing" >"$tmp/err" 2>&1; then exit 1; fi
rg -q 'cannot read' "$tmp/err" && [ ! -e "$tmp/missing" ] || exit 1
mkdir -p "$tmp/sketch/src" "$tmp/sketch/assets"
printf '{"name":"shared","entry":"src/main.ts"}\n' > "$tmp/sketch/zinc.json"
printf "import { word } from './word';\nconsole.log(word);\n" > "$tmp/sketch/src/main.ts"
printf "export const word = 'share roundtrip';\n" > "$tmp/sketch/src/word.ts"
printf 'asset bytes\n' > "$tmp/sketch/assets/a.txt"
"$Z" pack "$tmp/sketch" --sources --cover app/atelier/icon.png -o "$tmp/shared.zapp" >/dev/null || exit 1
"$Z" unpack "$tmp/shared.zapp" --out "$tmp/opened" >/dev/null || exit 1
for f in zinc.json src/main.ts src/word.ts assets/a.txt; do cmp -s "$tmp/sketch/$f" "$tmp/opened/$f" || exit 1; done
cmp -s app/atelier/icon.png "$tmp/opened/icon.png" || exit 1
[ "$("$Z" run "$tmp/shared.zapp" --interp 2>/dev/null)" = 'share roundtrip' ] || exit 1
[ "$("$Z" run "$tmp/opened" --interp 2>/dev/null)" = 'share roundtrip' ] || exit 1
if "$Z" unpack "$tmp/shared.zapp" --out "$tmp/opened" >"$tmp/err" 2>&1; then echo 'existing destination was overwritten'; exit 1; fi
cmp -s "$tmp/sketch/src/main.ts" "$tmp/opened/src/main.ts" || exit 1
# The default runnable-only package stays unchanged and has a clear import error.
"$Z" pack "$tmp/sketch" -o "$tmp/runnable.zapp" >/dev/null || exit 1
if "$Z" unpack "$tmp/runnable.zapp" --out "$tmp/no-sources" >"$tmp/err" 2>&1; then exit 1; fi
rg -q 'no editable sources' "$tmp/err" && [ ! -e "$tmp/no-sources" ] || exit 1
python3 - "$tmp" <<'PY' || exit 1
import sys,tarfile,io,hashlib,json
from pathlib import Path
root=Path(sys.argv[1])
with tarfile.open(root/'shared.zapp') as archive:
    for output,escape in [('corrupt.zapp',False),('escape.zapp',True)]:
        buf=io.BytesIO()
        with tarfile.open(fileobj=buf,mode='w',format=tarfile.USTAR_FORMAT) as result:
            for member in archive.getmembers():
                data=archive.extractfile(member).read()
                if member.name=='src/main.ts':
                    if escape: member.name='../escaped.ts'
                    else: data=data.replace(b'word',b'wOrd')
                member.size=len(data); result.addfile(member,io.BytesIO(data))
        (root/output).write_bytes(buf.getvalue())
with tarfile.open(root/'shared.zapp') as archive:
    files={m.name:archive.extractfile(m).read() for m in archive.getmembers()}
for old,new in [('src/main.ts','plugins/p/index.ts'),('src/word.ts','plugins/p/word.ts')]: files[new]=files.pop(old)
manifest=json.loads(files['manifest.json']); manifest['files']={k:hashlib.sha256(v).hexdigest() for k,v in files.items() if k!='manifest.json'}
files['manifest.json']=json.dumps(manifest).encode()
with tarfile.open(root/'missing-entry.zapp','w',format=tarfile.USTAR_FORMAT) as archive:
    for name,data in files.items():
        member=tarfile.TarInfo(name); member.size=len(data); archive.addfile(member,io.BytesIO(data))
with (root/'large.zapp').open('wb') as out: out.truncate(65*1024*1024)
PY
for archive in corrupt escape large missing-entry; do
  if "$Z" unpack "$tmp/$archive.zapp" --out "$tmp/$archive" >"$tmp/err" 2>&1; then echo "$archive accepted"; exit 1; fi
  [ ! -e "$tmp/$archive" ] && [ ! -e "$tmp/escaped.ts" ] || exit 1
done
printf '{}\n' > "$tmp/sketch/manifest.json"
if "$Z" pack "$tmp/sketch" --sources -o "$tmp/reserved.zapp" >"$tmp/err" 2>&1; then echo 'reserved manifest name accepted'; exit 1; fi
rg -q 'manifest.json is reserved' "$tmp/err" || exit 1
rm "$tmp/sketch/manifest.json"
ln -s "$tmp/opened/src/word.ts" "$tmp/sketch/src/link.ts"
if "$Z" pack "$tmp/sketch" --sources -o "$tmp/link.zapp" >"$tmp/err" 2>&1; then echo 'symbolic source accepted'; exit 1; fi
rg -q 'symbolic links' "$tmp/err" || exit 1
printf 'zapp_share: ok\n'
