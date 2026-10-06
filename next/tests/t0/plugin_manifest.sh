#!/bin/sh
# plugin.json (ZN-059): every manifest of plugins/ loads with yyjson; a plugin without "entry" defaults to index.ts and its module resolves;
# an unknown key warns once, a wrong type is reported with the file, a broken file does not stop the others.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
n=$(ls ../plugins/*/plugin.json | wc -l | tr -d ' ')
out=$("$ZINC" plugins 2>"$tmp/err"); rc=$?
[ $rc -eq 0 ] && [ "$(echo "$out" | wc -l | tr -d ' ')" = "$n" ] || { echo "zinc plugins does not list the $n manifests: rc=$rc $(head -c 200 "$tmp/err")"; fail=1; }
echo "$out" | grep -q "^pixelfont module zinc:pixelfont index.ts " || { echo "pixelfont (no entry in its manifest) does not default to index.ts"; fail=1; }
mkdir -p "$tmp/p/a" "$tmp/p/b" "$tmp/p/c"
echo '{"name":"a","kind":"module","module":"zinc:a","extra":1,"targets":{"macos":{}}}' > "$tmp/p/a/plugin.json"
echo '{"name":"b","kind":"module","module":5}' > "$tmp/p/b/plugin.json"
echo '{"name":"c" "kind"}' > "$tmp/p/c/plugin.json"
out=$("$ZINC" plugins "$tmp/p" 2>"$tmp/err"); rc=$?
[ $rc -eq 1 ] && echo "$out" | grep -q "^a module zinc:a index.ts macos" || { echo "a good manifest next to bad ones is not listed (rc=$rc): $out"; fail=1; }
[ "$(grep -c 'unknown key "extra"' "$tmp/err")" = 1 ] && grep -q '"module" must be a string' "$tmp/err" && grep -q "invalid JSON" "$tmp/err" || { echo "warnings and errors of the manifests are not reported once each: $(cat "$tmp/err")"; fail=1; }
printf "import { drawText } from 'zinc:pixelfont';\nconsole.log(typeof drawText);\n" > "$tmp/m.ts"
[ "$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/m.ts" 2>&1)" = "function" ] || { echo "import from zinc:pixelfont does not resolve"; fail=1; }
exit $fail
