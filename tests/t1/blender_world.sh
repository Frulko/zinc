#!/bin/sh
set -eu
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R examples/blender-world "$tmp/project"
rm -rf "$tmp/project/build"
python3 - "$tmp/project/assets" <<'PYTEST'
import pathlib,struct,sys
p=pathlib.Path(sys.argv[1]);u=lambda *v:struct.pack('<'+'I'*len(v),*v)
(p/'bad-index.zworld').write_bytes(b'ZWD1'+u(1,0,1)+u(2,0xffffffff))
name=b'bad-chunk.zwc';index=b'ZWD1'+u(1,1,1)+struct.pack('<8f3i',0,0,0,1,1,1,0,0,-1,-1,0)+u(2,len(name))+name
index+=b'\0'*(-len(index)%4)
(p/'bad-chunk.zworld').write_bytes(index)
(p/'bad-chunk.zwc').write_bytes(b'ZWC1'+u(1,0,0))
PYTEST
cat >> "$tmp/project/src/main.ts" <<'TS'
import { World } from 'zinc:3d';
let rejected=false;try { const invalid=new World('bad-index.zworld'); invalid.dispose(); } catch(e) { rejected=true; }
if(!rejected)throw new Error('malformed world index accepted');
for(let i=0;i<8;i++){const invalid=new World('bad-chunk.zworld');if(invalid.handle>3||invalid.load(0)>=0)throw new Error('bad chunk accepted or disposed handles leaked');invalid.dispose();invalid.dispose();}
console.log('world malformed index/chunk and disposal proof');
TS
"$ZINC" assets build "$tmp/project" > "$tmp/build.log"
"$ZINC" assets build "$tmp/project" > "$tmp/cached.log"
grep -q '0 imported' "$tmp/cached.log"
ZINC_HEADLESS=1 ZINC_FRAMES=2 "$ZINC" run "$tmp/project" > "$tmp/run.log" 2>&1
cat "$tmp/run.log"
grep -q 'world malformed index/chunk and disposal proof' "$tmp/run.log"
grep -q 'world scene 12 entities 4 assets 2 cells 4 chunks' "$tmp/run.log"
grep -q 'world proof: static collisions, Inspector candidates, reuse and rollback' "$tmp/run.log"
python3 - "$tmp/project" <<'PY'
import hashlib,json,pathlib,sys
p=pathlib.Path(sys.argv[1]);pack=next((p/'build/assets/macos').glob('*.zpk'))
(p/'before').write_text(hashlib.sha256(pack.read_bytes()).hexdigest())
s=p/'assets/scene.json';d=json.loads(s.read_text())
next(n for n in d['nodes'] if n['metadata'].get('world'))['metadata']['world']['cell']=0
s.write_text(json.dumps(d))
PY
if "$ZINC" assets build "$tmp/project" > "$tmp/bad.log" 2>&1; then echo 'invalid world unexpectedly imported';exit 1;fi
grep -q 'positive finite' "$tmp/bad.log"
python3 - "$tmp/project" <<'PY'
import hashlib,pathlib,sys
p=pathlib.Path(sys.argv[1]);pack=next((p/'build/assets/macos').glob('*.zpk'))
assert hashlib.sha256(pack.read_bytes()).hexdigest()==(p/'before').read_text(),'failed build replaced last valid pack'
PY
