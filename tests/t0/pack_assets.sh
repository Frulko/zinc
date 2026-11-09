#!/bin/sh
# zinc.json "assets" said honestly (ZN-1016): a named folder that is not there is a warning of zinc check and zinc pack, an array is refused with
# the form to write, and a folder outside the project (n3ds-platformer's ../platformer/assets) is packed as assets/ with the packed zinc.json
# pointing there, where zinc pack once carried only a folder named assets/ beside zinc.json.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
export ZINC_HOME="$tmp/home" ZINC_STEPS=0 ZINC_HEADLESS=1
fail=0
mkdir -p "$tmp/p/src" "$tmp/shared/assets/sub"
echo 'console.log("hi");' > "$tmp/p/src/main.ts"
echo level > "$tmp/shared/assets/sub/level.txt"

echo '{ "name": "p", "entry": "src/main.ts", "assets": "../nowhere" }' > "$tmp/p/zinc.json"
out=$("$ZINC" check "$tmp/p" 2>&1)
echo "$out" | grep -q 'warning: "assets": ../nowhere is not a directory' || { echo "check: no warning for a missing assets folder: $out"; fail=1; }
out=$("$ZINC" pack "$tmp/p" -o "$tmp/p.zapp" 2>&1)
echo "$out" | grep -q '"assets": ../nowhere is not a directory' || { echo "pack: no warning for a missing assets folder: $out"; fail=1; }

echo '{ "name": "p", "entry": "src/main.ts", "assets": ["assets"] }' > "$tmp/p/zinc.json"
out=$("$ZINC" check "$tmp/p" 2>&1)
echo "$out" | grep -q '"assets" must be the assets directory ("assets": "assets") or an object.*not an array' || { echo "check: an array is not refused clearly: $out"; fail=1; }

echo '{ "name": "p", "entry": "src/main.ts", "assets": "../shared/assets" }' > "$tmp/p/zinc.json"
out=$("$ZINC" pack "$tmp/p" -o "$tmp/p.zapp" 2>&1) || { echo "pack failed: $out"; fail=1; }
tar -tf "$tmp/p.zapp" | grep -qx 'assets/sub/level.txt' || { echo "pack: the outside folder is not packed as assets/: $(tar -tf "$tmp/p.zapp" | tr '\n' ' ')"; fail=1; }
tar -tf "$tmp/p.zapp" | grep -q '\.\./' && { echo "pack: a member outside the archive"; fail=1; }
tar -xOf "$tmp/p.zapp" zinc.json | grep -q '"assets": "assets"' || { echo "pack: the packed zinc.json does not point at assets/: $(tar -xOf "$tmp/p.zapp" zinc.json)"; fail=1; }
exit $fail
