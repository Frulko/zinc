#!/bin/sh
# ZN-963: zinc:sys dataDir() is the app's own writable folder (<zinc home>/apps/<name>/, made on first call): a program writes, reads
# and removes a file in it on the interpreter, QuickJS and AOT (the name: the zinc.json name, else the folder of the program).
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/demo"; cat > "$tmp/demo/main.ts" <<'TS'
import { dataDir } from 'zinc:sys';
import * as fs from 'zinc:fs';
const dir = dataDir();
const f = dir + '/note.txt';
fs.writeText(f, 'kept');
const back = fs.readText(f);
fs.remove(f);
console.log(dir + ' ' + back + ' ' + fs.exists(f));
TS
want="$tmp/home/apps/demo kept false"
run() { ZINC_HOME="$tmp/home" ZINC_HEADLESS=1 timeout 60 "$@" 2>&1; }
for e in --interp "--engine quickjs"; do
  rm -rf "$tmp/home"
  got=$(run "$ZINC" run $e "$tmp/demo/main.ts")
  [ "$got" = "$want" ] || { echo "app_data_dir ($e): got '$got', expected '$want'"; fail=1; }
done
rm -rf "$tmp/home"
if timeout 300 "$ZINC" build "$tmp/demo/main.ts" -o "$tmp/a" >/dev/null 2>&1; then
  got=$(run "$tmp/a")
  [ "$got" = "$want" ] || { echo "app_data_dir (AOT): got '$got', expected '$want'"; fail=1; }
else echo "app_data_dir: zinc build failed"; fail=1; fi
exit $fail
