#!/bin/sh
# The QuickJS bundler (docs/reports/zinc-quickjs-bundler.md). Without esbuild: TSX runs on QuickJS through the transform stage and prints the JSX
# goldens of the typed engine; zinc check --engine quickjs reports Z0006, Z0007 and Q0001 and passes a clean program; import.meta.url, the web
# globals (navigator) and node_modules packages resolve. With the pinned esbuild in ZINC_HOME (never downloaded here): zinc bundle keeps
# zinc:native as an import, folds __ZINC_ENGINE__, drops the unused code, links an ESM and a CommonJS package, maps a minified trace back to the
# source, and the bytecode (.qbc) prints what the source prints.
cd "$(dirname "$0")/../.." || exit 2
fail=0
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
for t in basic nested_cond node_call; do
  "$ZINC" run "tests/golden/jsx/$t.tsx" --engine quickjs 2>&1 | diff -q - "tests/golden/jsx/$t.out" >/dev/null || { echo "jsx/$t.tsx on quickjs differs from its golden"; fail=1; }
done

mkdir -p "$tmp/p/node_modules/esm-pkg" "$tmp/p/node_modules/cjs-pkg"
printf '{ "name": "esm-pkg", "exports": { ".": { "import": "./index.mjs" } } }\n' > "$tmp/p/node_modules/esm-pkg/package.json"
printf "export function twice(n) { return n * 2; }\nexport function unusedMarkerFn() { return 'UNUSED_MARKER'; }\n" > "$tmp/p/node_modules/esm-pkg/index.mjs"
printf '{ "name": "cjs-pkg", "main": "lib.js" }\n' > "$tmp/p/node_modules/cjs-pkg/package.json"
printf "const h = require('./helper');\nmodule.exports = { greet: (s) => h.prefix + s };\n" > "$tmp/p/node_modules/cjs-pkg/lib.js"
printf "exports.prefix = 'hello ';\n" > "$tmp/p/node_modules/cjs-pkg/helper.js"
cat > "$tmp/p/util.ts" <<'EOF'
export interface Shape { w: number }
export const area = (s: Shape): number => s.w * s.w;
export function deadCodeMarker(): string { return 'DEAD_CODE_MARKER'; }
export function fail(): never { throw new Error('thrown in util'); }
EOF
cat > "$tmp/p/main.ts" <<'EOF'
import { Shape, area, fail } from './util';
import { twice } from 'esm-pkg';
const s: Shape = { w: 3 };
console.log('area', area(s), 'twice', twice(4));
console.log('engine', __ZINC_ENGINE__, 'meta', import.meta.url.endsWith('/main.ts') || import.meta.url.endsWith('.js'));
console.log('navigator', typeof navigator);
EOF
printf "import { fail } from './util';\nconsole.log('before');\nfail();\n" > "$tmp/p/throw.ts"
printf "import { greet } from 'cjs-pkg';\nconsole.log(greet('cjs'));\n" > "$tmp/p/cjs.ts"
want="area 9 twice 8
engine quickjs meta true
navigator object"
got=$("$ZINC" run "$tmp/p/main.ts" --engine quickjs 2>&1)
[ "$got" = "$want" ] || { echo "the program on quickjs printed: $got"; fail=1; }

# zinc check --engine quickjs: the transform's diagnostics and the QuickJS lint
printf "const a = <View class=\"p-2\" />;\n" > "$tmp/cls.tsx"
printf "const a = <view />;\n" > "$tmp/low.tsx"
printf "const d = Temporal.Now.instant();\nconst f = new Intl.NumberFormat('fr');\nconst ok = new Intl.Segmenter();\nconst o = { Temporal: 1 }.Temporal;\n" > "$tmp/lint.ts"
"$ZINC" check --engine quickjs "$tmp/cls.tsx" 2>&1 | grep -q "Z0006" || { echo "class= is not Z0006 under check --engine quickjs"; fail=1; }
"$ZINC" check --engine quickjs "$tmp/low.tsx" 2>&1 | grep -q "Z0007" || { echo "<view> is not Z0007 under check --engine quickjs"; fail=1; }
out=$("$ZINC" check --engine quickjs "$tmp/lint.ts" 2>&1); rc=$?
[ $rc -eq 1 ] && [ "$(echo "$out" | grep -c Q0001)" = 2 ] && echo "$out" | grep -q "lint.ts:1:11: warning Q0001: Temporal" || { echo "the QuickJS lint: rc $rc: $out"; fail=1; }
"$ZINC" check --engine quickjs "$tmp/p/main.ts" >/dev/null 2>&1 || { echo "a clean program fails check --engine quickjs"; fail=1; }

# zinc bundle: only with the pinned esbuild already in ZINC_HOME
if ZINC_OFFLINE=1 "$ZINC" toolchain esbuild >/dev/null 2>&1; then
  "$ZINC" bundle "$tmp/p/main.ts" -o "$tmp/out/app.js" >/dev/null 2>&1 || { echo "zinc bundle failed"; fail=1; }
  got=$("$ZINC" run "$tmp/out/app.js" 2>&1)
  [ "$got" = "$want" ] || { echo "the bundle printed: $got"; fail=1; }
  grep -q "UNUSED_MARKER\|DEAD_CODE_MARKER" "$tmp/out/app.js" && { echo "the bundle keeps unused functions (no tree shaking)"; fail=1; }
  grep -q '__ZINC_ENGINE__' "$tmp/out/app.js" && { echo "__ZINC_ENGINE__ is not folded in the bundle"; fail=1; }
  head -1 "$tmp/out/app.js" | grep -q "^// zinc-bundle-entry: ../p/main.ts" || { echo "the bundle does not name its entry"; fail=1; }
  "$ZINC" bundle "$tmp/p/cjs.ts" -o "$tmp/out/cjs.js" >/dev/null 2>&1 && [ "$("$ZINC" run "$tmp/out/cjs.js" 2>&1)" = "hello cjs" ] || { echo "a CommonJS package does not link"; fail=1; }
  printf "import { flag } from 'zinc:native';\nexport const x = typeof flag;\nconsole.log(x);\n" > "$tmp/p/host.ts"
  "$ZINC" bundle "$tmp/p/host.ts" -o "$tmp/out/host.js" >/dev/null 2>&1; grep -q 'from "zinc:native"' "$tmp/out/host.js" || { echo "zinc:native is not left to the host"; fail=1; }
  "$ZINC" bundle "$tmp/p/main.ts" -o "$tmp/out/min.js" --minify --sourcemap --bytecode >/dev/null 2>&1 || { echo "zinc bundle --minify --sourcemap --bytecode failed"; fail=1; }
  got=$("$ZINC" run "$tmp/out/min.qbc" 2>&1)
  [ "$got" = "$want" ] || { echo "the bytecode prints: $got"; fail=1; }
  [ "$(wc -c < "$tmp/out/min.js")" -lt "$(wc -c < "$tmp/out/app.js")" ] || { echo "--minify does not shrink the bundle"; fail=1; }
  "$ZINC" bundle "$tmp/p/throw.ts" -o "$tmp/out/throw.js" --minify --sourcemap --bytecode >/dev/null 2>&1
  out=$("$ZINC" run "$tmp/out/throw.js" 2>&1); echo "$out" | grep -q "p/util.ts:4:" || { echo "a minified trace is not mapped to util.ts: $out"; fail=1; }
  out=$("$ZINC" run "$tmp/out/throw.qbc" 2>&1); echo "$out" | grep -q "p/util.ts:4:" || { echo "a bytecode trace is not mapped to util.ts: $out"; fail=1; }
else
  echo "skip zinc bundle: no esbuild in ZINC_HOME (zinc toolchain esbuild fetches it)"
fi
exit $fail
