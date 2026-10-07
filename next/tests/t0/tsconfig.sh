#!/bin/sh
# Bare imports through tsconfig.json `paths` (ZN-076): exact and wildcard patterns, baseUrl, comments and trailing commas in the file, index resolution,
# a `.js` specifier served by a .ts file, and a Z0119 that names the alias whose target is missing.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/app/src" "$tmp/lib/compat/pkg" "$tmp/lib/addons"
cat > "$tmp/app/tsconfig.json" <<'JSON'
{
  // comments are allowed in a tsconfig
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "inferno": ["../lib/compat/inferno.ts"],
      "pkg/*": ["../lib/compat/pkg/*"],
      "three/addons/*.js": ["../lib/addons/*.ts"],
      "gone": ["../lib/compat/missing.ts"],
    },
  },
}
JSON
echo "export const render = (): string => 'inferno'" > "$tmp/lib/compat/inferno.ts"
echo "export const tool = (): string => 'pkg tool'" > "$tmp/lib/compat/pkg/tool.ts"
mkdir -p "$tmp/lib/compat/pkg/sub"
echo "export const deep = (): string => 'pkg sub index'" > "$tmp/lib/compat/pkg/sub/index.ts"
echo "export const loader = (): string => 'addon'" > "$tmp/lib/addons/GLTFLoader.ts"
cat > "$tmp/app/src/main.ts" <<'TS'
import { render } from 'inferno'
import { tool } from 'pkg/tool'
import { deep } from 'pkg/sub'
import { loader } from 'three/addons/GLTFLoader.js'
console.log(render(), tool(), deep(), loader())
TS
out=$("$ZINC" run "$tmp/app/src/main.ts" 2>&1)
[ "$out" = "inferno pkg tool pkg sub index addon" ] || { echo "aliases do not resolve: $out"; fail=1; }
printf "import { x } from 'gone'\nconsole.log(x)\n" > "$tmp/app/src/bad.ts"
out=$("$ZINC" check --check "$tmp/app/src/bad.ts" 2>&1 | head -1)
case "$out" in *Z0119*"'gone'"*"paths 'gone'"*missing.ts*) ;; *) echo "the failed alias is not named: $out"; fail=1 ;; esac
printf "import { x } from 'nothing'\n" > "$tmp/app/src/none.ts"
out=$("$ZINC" check --check "$tmp/app/src/none.ts" 2>&1 | head -1)
case "$out" in *Z0119*"'nothing'"*) ;; *) echo "an unmapped bare import is not reported as Z0119: $out"; fail=1 ;; esac
exit $fail
