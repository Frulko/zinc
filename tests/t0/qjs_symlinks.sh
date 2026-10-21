#!/bin/sh
# QuickJS module loader (src/qjs/qjs.cpp normalizeName): a package of node_modules is loaded by its real path, so a package that a pnpm
# workspace links twice (the app's node_modules/a and b's own node_modules/a, both symbolic links to packages/a) is one module, one state.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/packages/a" "$tmp/packages/b/node_modules" "$tmp/app/node_modules"
echo '{"name":"a","exports":{".":"./index.js"}}' > "$tmp/packages/a/package.json"
echo 'export const state = { loads: 0 }; state.loads++; globalThis.__aLoads = (globalThis.__aLoads ?? 0) + 1;' > "$tmp/packages/a/index.js"
echo '{"name":"b","exports":{".":"./index.js"}}' > "$tmp/packages/b/package.json"
echo "export { state } from 'a';" > "$tmp/packages/b/index.js"
ln -s ../../a "$tmp/packages/b/node_modules/a"
ln -s "$tmp/packages/a" "$tmp/app/node_modules/a"
ln -s "$tmp/packages/b" "$tmp/app/node_modules/b"
printf "import { state as x } from 'a';\nimport { state as y } from 'b';\nconsole.log(x === y, globalThis.__aLoads);\n" > "$tmp/app/main.js"
out=$("$ZINC" run "$tmp/app/main.js" --engine quickjs 2>/dev/null)
[ "$out" = "true 1" ] || { echo "qjs_symlinks: a package linked twice loads twice ($out)"; exit 1; }
