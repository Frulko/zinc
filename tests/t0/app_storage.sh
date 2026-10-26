#!/bin/sh
# Each app's own folder (<zinc home>/apps/<zinc.json name>/): zinc:storage keeps its keys there, zinc:sys dataDir() names it, and the keys
# "<name>.…" an app had in the shared <zinc home>/storage.kv of older engines move there on its first run (the others stay).
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/demo/src" "$tmp/home"
printf '{ "name": "demo", "entry": "src/main.ts" }\n' > "$tmp/demo/zinc.json"
cat > "$tmp/demo/src/main.ts" <<'TS'
import * as storage from 'zinc:storage';
import { dataDir } from 'zinc:sys';
console.log('old=' + storage.get('demo.theme') + ' keys=' + storage.keys().join(','));
storage.set('demo.count', '1');
console.log('dir=' + dataDir());
TS
printf 'demo.theme\tdark\nother.keep\t1\n' > "$tmp/home/storage.kv"
out=$(ZINC_HOME="$tmp/home" "$ZINC" run "$tmp/demo" 2>&1)
fail=0
echo "$out" | grep -qx 'old=dark keys=demo.theme' || { echo "the app's old key did not move: $out"; fail=1; }
echo "$out" | grep -qx "dir=$tmp/home/apps/demo" || { echo "dataDir: $out"; fail=1; }
[ "$(cat "$tmp/home/storage.kv")" = "$(printf 'other.keep\t1')" ] || { echo "the shared store: $(cat "$tmp/home/storage.kv")"; fail=1; }
grep -q '^demo.count	1$' "$tmp/home/apps/demo/storage.kv" && grep -q '^demo.theme	dark$' "$tmp/home/apps/demo/storage.kv" || { echo "the app's store: $(cat "$tmp/home/apps/demo/storage.kv")"; fail=1; }
[ $fail -eq 0 ] && echo "app storage: ok"
exit $fail
