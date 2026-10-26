#!/bin/sh
# zinc.json "permissions" at run time (ZN-322.01, tests/golden/permissions: fs:read:data and net:127.0.0.1 granted). Enforced
# (ZINC_PERMISSIONS=enforce), the allowed calls work and the others (reading outside data, writing, listening, fetching another host) fail with
# errors naming the permission (enforce.out); while developing they work and each missing permission is warned about once on stderr; a project
# without "permissions" is not checked at all. tests/golden/permissions-more: processes, sockets, osc and mqtt with net:127.0.0.1 only (ZN-322.02).
# tests/golden/permissions-assets: reading the app's assets needs no permission, writing or linking there needs fs:write (ZN-646).
cd "$(dirname "$0")/../.." || exit 2
Z=$(cd "$(dirname "$ZINC")" && pwd)/$(basename "$ZINC")
g=tests/golden/permissions
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
fail=0
(cd $g && ZINC_PERMISSIONS=enforce "$Z" run . > "$tmp/enforce" 2>&1)
diff -q "$tmp/enforce" $g/enforce.out >/dev/null || { echo "enforced: $(diff "$tmp/enforce" $g/enforce.out | head -6)"; fail=1; }
(cd $g && "$Z" run . > "$tmp/dev" 2> "$tmp/dev.err")
for l in 'read zinc.json: true' 'read zinc.json again: true' 'write out.txt: written' 'serve: listening'; do grep -qx "$l" "$tmp/dev" || { echo "developing: no '$l'"; fail=1; }; done
[ "$(grep -c '^zinc: warning: ' "$tmp/dev.err")" = 4 ] || { echo "developing: 4 warnings expected (one per missing permission): $(cat "$tmp/dev.err")"; fail=1; }
for p in 'fs:read' 'fs:write' 'net:\*' 'net:blocked.invalid'; do [ "$(grep -c "permission \"$p\"" "$tmp/dev.err")" = 1 ] || { echo "developing: '$p' not warned exactly once"; fail=1; }; done
cp -R $g "$tmp/open" && echo '{ "name": "open", "entry": "main.ts" }' > "$tmp/open/zinc.json"
out=$(cd "$tmp/open" && ZINC_PERMISSIONS=enforce "$Z" run . 2>&1)
echo "$out" | grep -q 'warning\|EACCES' && { echo "a project without permissions is checked: $out"; fail=1; }
echo "$out" | grep -qx 'write out.txt: written' || { echo "a project without permissions cannot write: $out"; fail=1; }
m=tests/golden/permissions-more   # processes, sockets, osc and mqtt (ZN-322.02): only net:127.0.0.1 granted
(cd $m && ZINC_PERMISSIONS=enforce "$Z" run . > "$tmp/more" 2>&1)
diff -q "$tmp/more" $m/enforce.out >/dev/null || { echo "enforced (other families): $(diff "$tmp/more" $m/enforce.out | head -6)"; fail=1; }
(cd $m && "$Z" run . > "$tmp/more.dev" 2>/dev/null)
grep -q 'refused' "$tmp/more.dev" && { echo "developing (other families): refused calls: $(grep refused "$tmp/more.dev")"; fail=1; }
[ "$(grep -c ': done\|allowed' "$tmp/more.dev")" = 7 ] || { echo "developing (other families): $(cat "$tmp/more.dev")"; fail=1; }
d="$tmp/meta"; mkdir -p "$d/app" "$d/other"   # exists, realpath and mkdtemp are checked too (ZN-327): nothing is learned or made outside the list
cat > "$d/app/main.ts" <<EOF
import * as fs from 'zinc:fs';
function tryIt(what: string, f: () => string): void { try { console.log(what + ': ' + f()); } catch (e) { console.log(what + ': ' + (e as Error).message); } }
tryIt('exists', () => '' + fs.exists('$d/other'));
tryIt('mkdtemp', () => fs.mkdtemp('$d/other/made-'));
tryIt('realpath', () => fs.realpath('$d/other'));
EOF
echo '{ "name": "meta", "entry": "main.ts", "permissions": [] }' > "$d/app/zinc.json"
out=$(cd "$d/app" && ZINC_PERMISSIONS=enforce "$Z" run . 2>&1)
echo "$out" | grep -qx 'exists: false' && echo "$out" | grep -q '^mkdtemp: EACCES.*fs:write' && echo "$out" | grep -q '^realpath: EACCES.*fs:read' || { echo "unchecked fs calls: $out"; fail=1; }
[ -z "$(ls "$d/other")" ] || { echo "mkdtemp made a directory outside the permissions"; fail=1; }
t="$tmp/target"; mkdir -p "$t"   # "targets.<name>.permissions" of the target that runs: the profile's, else this OS's (not "windows" off macOS)
echo "import * as fs from 'zinc:fs'; try { fs.writeText('$t/out.txt', 'x'); console.log('written'); } catch (e) { console.log((e as Error).message); }" > "$t/main.ts"
echo '{ "name": "target", "entry": "main.ts", "permissions": [], "targets": { "rmpp": { "permissions": ["fs:write"] } } }' > "$t/zinc.json"
out=$(cd "$t" && ZINC_PERMISSIONS=enforce "$Z" run --profile rmpp . 2>&1 | tail -1)
[ "$out" = written ] || { echo "targets.rmpp.permissions not applied under --profile rmpp: $out"; fail=1; }
out=$(cd "$t" && ZINC_PERMISSIONS=enforce "$Z" run . 2>&1 | tail -1)
case "$out" in EACCES*fs:write*) ;; *) echo "targets.rmpp.permissions applied on this machine: $out"; fail=1;; esac
a=tests/golden/permissions-assets   # the assets exemption is read-only (ZN-646): run on a copy, a refused write must leave nothing behind
cp -R $a "$tmp/assets-app"
(cd "$tmp/assets-app" && ZINC_PERMISSIONS=enforce "$Z" run . > "$tmp/assets" 2>&1)
diff -q "$tmp/assets" $a/enforce.out >/dev/null || { echo "enforced (assets): $(diff "$tmp/assets" $a/enforce.out | head -6)"; fail=1; }
[ "$(ls "$tmp/assets-app/assets")" = note.txt ] || { echo "enforced (assets): a refused write left $(ls "$tmp/assets-app/assets" | tr '\n' ' ')"; fail=1; }
[ $fail -eq 0 ] && echo "permissions: ok"
exit $fail
