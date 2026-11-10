#!/bin/sh
# Signed candidates, validation-before-stage, retry, and deterministic short-process promises.
set -eu
cd "$(dirname "$0")/../.."
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
tmp=$(mktemp -d); srv=
trap '[ -z "$srv" ] || { kill "$srv" 2>/dev/null || :; wait "$srv" 2>/dev/null || :; }; rm -rf "$tmp"' EXIT
real=${ZINC_HOME:-$HOME/.zinc}; mkdir -p "$tmp/home"
for f in "$real"/*; do [ ! -e "$f" ] || [ "$(basename "$f")" = apps ] || ln -s "$f" "$tmp/home/"; done
export ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 ZINC_DETERMINISTIC=1 ZINC_STEPS=0
export UPDATE_FIXTURE="$tmp" UPDATE_PYTHON="$(command -v python3)"
"$Z" update-keygen > "$tmp/key"
python3 - "$tmp" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1]); key = dict(line.strip().split('=', 1) for line in (p/'key').read_text().splitlines())
for name, app, content in [('bad', 'org.zinc.update-test', '{broken'), ('good', 'org.zinc.update-test', '{"works":true}'), ('other', 'org.zinc.other', '{}')]:
    d=p/name; (d/'src').mkdir(parents=True); (d/'assets').mkdir()
    (d/'src/main.ts').write_text("console.log('candidate');")
    (d/'assets/project.json').write_text(content)
    (d/'zinc.json').write_text(json.dumps({'name':'candidate','entry':'src/main.ts','app':{'id':app,'version':'1.1.0'},'assets':'assets','update':{'publicKey':key['public']}}))
d=p/'player'; (d/'src').mkdir(parents=True)
(d/'zinc.json').write_text(json.dumps({'name':'player','entry':'src/main.ts','permissions':['update','fs','process'],'app':{'id':'org.zinc.update-test','version':'1.0.0'},'update':{'url':'file://'+str(p/'good.manifest'),'publicKey':key['public']}}))
PY
for name in bad good other; do
  "$Z" pack "$tmp/$name" -o "$tmp/$name.zapp" > "$tmp/pack.log" 2>&1 || { cat "$tmp/pack.log"; exit 1; }
  hash=$(shasum -a 256 "$tmp/$name.zapp" | cut -d' ' -f1)
  printf 'version=1.1.0\nurl=%s.zapp\nsha256=%s\n' "$name" "$hash" > "$tmp/unsigned"
  "$Z" update-sign "$tmp/unsigned" "$(sed -n 's/^seed=//p' "$tmp/key")" > "$tmp/$name.manifest"
done
mkdir "$tmp/same-name"; cp "$tmp/bad.zapp" "$tmp/same-name/good.zapp"
hash=$(shasum -a 256 "$tmp/bad.zapp" | cut -d' ' -f1)
printf 'version=1.1.0\nurl=same-name/good.zapp\nsha256=%s\n' "$hash" > "$tmp/unsigned"
"$Z" update-sign "$tmp/unsigned" "$(sed -n 's/^seed=//p' "$tmp/key")" > "$tmp/same-name.manifest"
sed 's/version=1.1.0/version=9.0.0/' "$tmp/good.manifest" > "$tmp/tampered.manifest"
cp tests/data/app_update_async/candidates.ts "$tmp/player/src/main.ts"
"$Z" run "$tmp/player" > "$tmp/result" 2>&1 || { cat "$tmp/result"; exit 1; }
grep -q 'candidate checks passed' "$tmp/result" || { cat "$tmp/result"; exit 1; }
cp tests/data/app_update_async/process.ts "$tmp/player/src/main.ts"
ZINC_FRAMES=3 "$Z" run "$tmp/player" > "$tmp/result" 2>&1 || { cat "$tmp/result"; exit 1; }
grep -q 'process completed in frame 1' "$tmp/result" || { cat "$tmp/result"; exit 1; }
# The server cannot answer until frame two releases it: a check on the frame would deadlock.
python3 tests/data/app_update_async/server.py "$tmp" > "$tmp/port" 2> "$tmp/server.err" & srv=$!
for attempt in $(seq 1 100); do [ -s "$tmp/port" ] && break; sleep .05; done
[ -s "$tmp/port" ] || { cat "$tmp/server.err"; exit 1; }
cp tests/data/app_update_async/frames.ts "$tmp/player/src/main.ts"
UPDATE_URL="http://127.0.0.1:$(cat "$tmp/port")/" ZINC_DETERMINISTIC=0 ZINC_FRAMES=100000 "$Z" run "$tmp/player" > "$tmp/result" 2>&1 || { cat "$tmp/result"; exit 1; }
grep -q 'frames stayed responsive' "$tmp/result" || { cat "$tmp/result"; exit 1; }
# A normal quit joins the pending bounded worker before returning; its curl must finish too.
cp tests/data/app_update_async/quit.ts "$tmp/player/src/main.ts"
UPDATE_URL="http://127.0.0.1:$(cat "$tmp/port")/quit.manifest" ZINC_DETERMINISTIC=0 ZINC_FRAMES=100000 "$Z" run "$tmp/player" > "$tmp/result" 2>&1 || { cat "$tmp/result"; exit 1; }
[ -f "$tmp/quit-served" ] || { echo 'quit returned before the pending update completed'; cat "$tmp/server.err"; exit 1; }
echo 'app_update_async: ok'
