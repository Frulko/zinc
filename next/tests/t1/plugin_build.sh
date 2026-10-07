#!/bin/sh
# Plugin native code (ZN-101): compiled into the cache on first use, found there again, rebuilt alone and fast when its source changes, loaded with dlopen by the
# interpreter and linked statically into an AOT program; a missing system library is reported with the package to install.
cd "$(dirname "$0")/../.." || exit 2
command -v c++ >/dev/null && command -v ar >/dev/null || { echo "skipped: no C++ compiler"; exit 77; }
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home"
out=$("$ZINC" plugin-build sqlite 2>&1) || { echo "the sqlite plugin does not build: $out"; exit 1; }
echo "$out" | grep -q "^sqlite built " || { echo "first build is not reported as built: $out"; fail=1; }
out=$("$ZINC" plugin-build sqlite 2>&1)
echo "$out" | grep -q "^sqlite cached " || { echo "second build is not served from the cache: $out"; fail=1; }
# a copy of the plugin in a project: an edit rebuilds only that plugin's own sources, in well under 5 s, and the vendored sqlite3.c archive is reused
mkdir -p "$tmp/proj/plugins"
cp -R ../plugins/sqlite "$tmp/proj/plugins/sqlite"
"$ZINC" plugin-build sqlite "$tmp/proj" >/dev/null 2>&1 || { echo "the project copy does not build"; fail=1; }
vend=$(ls -d "$ZINC_HOME"/cache/*/plugins/sqlite-vendor-* | wc -l | tr -d ' ')
echo "// edited" >> "$tmp/proj/plugins/sqlite/native/sqlite.host.cpp"
start=$(date +%s)
out=$("$ZINC" plugin-build sqlite "$tmp/proj" 2>&1)
secs=$(( $(date +%s) - start ))
echo "$out" | grep -q "^sqlite built " && [ "$secs" -lt 5 ] || { echo "an edit does not rebuild the plugin in under 5 s ($secs s): $out"; fail=1; }
[ "$(ls -d "$ZINC_HOME"/cache/*/plugins/sqlite-vendor-* | wc -l | tr -d ' ')" = "$vend" ] || { echo "an edit of the plugin rebuilt its vendored library"; fail=1; }
[ "$(ls -d "$ZINC_HOME"/cache/*/plugins/* | wc -l | tr -d ' ')" = "$((vend + 3))" ] || { echo "the edit built more than one new plugin directory"; fail=1; }
# the interpreter loads it with dlopen, an AOT program links the archives and needs no dlopen
cat > "$tmp/t.ts" <<'TS'
import { Database } from 'zinc:sqlite';
const db = new Database();
db.exec('CREATE TABLE t (a INTEGER); INSERT INTO t VALUES (41), (1);');
const r = db.prepare('SELECT sum(a) AS s FROM t').get();
console.log(r === null ? -1 : r.number('s'));
TS
[ "$(ZINC_NATIVE=real "$ZINC" run "$tmp/t.ts" 2>&1)" = "42" ] || { echo "the interpreter does not run a program on the dlopened plugin"; fail=1; }
ZINC_NATIVE=real "$ZINC" build "$tmp/t.ts" -o "$tmp/t" >"$tmp/build.log" 2>&1 && [ "$("$tmp/t" 2>&1)" = "42" ] || { echo "an AOT program does not link the plugin: $(head -c 300 "$tmp/build.log")"; fail=1; }
# a system library that is missing: the message names the package
mkdir -p "$tmp/p2/plugins/foo/native"
cat > "$tmp/p2/plugins/foo/plugin.json" <<'JSON'
{"name":"foo","kind":"module","module":"zinc:foo","entry":"index.ts","description":"needs a library","targets":{"macos":{"pkg":["zn-no-such-lib"],"packages":["libnosuch-dev"]},"linux":{"pkg":["zn-no-such-lib"],"packages":["libnosuch-dev"]}}}
JSON
sed "s/'Sqlite'/'Foo'/" ../plugins/sqlite/native/sqlite.spec.ts > "$tmp/p2/plugins/foo/native/foo.spec.ts"
cp ../plugins/sqlite/native/sqlite.host.cpp "$tmp/p2/plugins/foo/native/foo.host.cpp"
echo 'export default 1;' > "$tmp/p2/plugins/foo/index.ts"
out=$("$ZINC" plugin-build foo "$tmp/p2" 2>&1)
echo "$out" | grep -q "needs the system library 'zn-no-such-lib'.*libnosuch-dev" || { echo "a missing library is not reported with its package: $out"; fail=1; }
exit $fail
