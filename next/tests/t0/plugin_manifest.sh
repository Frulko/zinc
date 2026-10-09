#!/bin/sh
# plugin.json (ZN-059): every manifest of plugins/ loads with yyjson; a plugin without "entry" defaults to index.ts and its module resolves;
# an unknown key warns once, a wrong type is reported with the file, a broken file does not stop the others.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
n=$(ls ../plugins/*/plugin.json | wc -l | tr -d ' ')
out=$("$ZINC" plugins 2>"$tmp/err"); rc=$?
[ $rc -eq 0 ] && [ "$(echo "$out" | wc -l | tr -d ' ')" = "$((n + 1))" ] || { echo "zinc plugins does not list the $n manifests (and the header): rc=$rc $(head -c 200 "$tmp/err")"; fail=1; }
# the table of the prototype's `zinc plugins` (tests/data/plugins-table.txt is its output at the time of the port), plus the plugins Next added since (zinc:system)
echo "$out" | diff -q - tests/data/plugins-table.txt >/dev/null || { echo "zinc plugins differs from the prototype's table"; fail=1; }
echo "$out" | grep -q "^  zinc:pixelfont  " || { echo "pixelfont (no entry in its manifest) is not listed"; fail=1; }
mkdir -p "$tmp/p/plugins/a" "$tmp/p/plugins/b" "$tmp/p/plugins/c"
echo '{"name":"a","kind":"module","module":"zinc:a","extra":1,"targets":{"macos":{"sources":["a.cpp"],"bogus":1}}}' > "$tmp/p/plugins/a/plugin.json"
echo '{"name":"b","kind":"module","module":5}' > "$tmp/p/plugins/b/plugin.json"
echo '{"name":"c" "kind"}' > "$tmp/p/plugins/c/plugin.json"
out=$("$ZINC" plugins "$tmp/p" 2>"$tmp/err"); rc=$?
[ $rc -eq 1 ] && echo "$out" | grep -q "^  zinc:a  *macos  *$" || { echo "a good manifest next to bad ones is not listed (rc=$rc): $out"; fail=1; }
[ "$(grep -c 'unknown key "extra"' "$tmp/err")" = 1 ] && [ "$(grep -c 'unknown key "macos.bogus"' "$tmp/err")" = 1 ] && grep -q '"module" must be a string' "$tmp/err" && grep -q "invalid JSON" "$tmp/err" || { echo "warnings and errors of the manifests are not reported once each: $(cat "$tmp/err")"; fail=1; }
printf "import { drawText } from 'zinc:pixelfont';\nconsole.log(typeof drawText);\n" > "$tmp/m.ts"
[ "$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/m.ts" 2>&1)" = "function" ] || { echo "import from zinc:pixelfont does not resolve"; fail=1; }
# options (ZN-100): plugin.json defaults, zinc.json `plugins.<name>`, then `targets.<t>.plugins.<name>`, as ZP_<PLUGIN>_<KEY> for the native code
mkdir -p "$tmp/o"
echo '{"name":"x","plugins":{"3d":{"scale":2,"dither":true}},"targets":{"linux":{"plugins":{"3d":{"subdiv":8}}}}}' > "$tmp/o/zinc.json"
[ "$("$ZINC" plugins "$tmp/o" --defines 3d | tr '\n' ' ')" = "ZP_3D_ZBITS=0 ZP_3D_SCALE=2 ZP_3D_DITHER=1 ZP_3D_SUBDIV=16 ZP_3D=1 " ] || { echo "zinc.json options do not reach the 3d plugin (scale 2, dither on)"; fail=1; }
[ "$("$ZINC" plugins "$tmp/o" --defines 3d linux | tr '\n' ' ')" = "ZP_3D_ZBITS=0 ZP_3D_SCALE=2 ZP_3D_DITHER=1 ZP_3D_SUBDIV=8 ZP_3D=1 " ] || { echo "a target's plugin options do not override the project's"; fail=1; }
[ "$("$ZINC" plugins . --defines 3d | tr '\n' ' ')" = "ZP_3D_ZBITS=0 ZP_3D_SCALE=1 ZP_3D_DITHER=0 ZP_3D_SUBDIV=16 ZP_3D=1 " ] || { echo "the 3d defaults of plugin.json are wrong"; fail=1; }
exit $fail
