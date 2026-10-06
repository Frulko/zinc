#!/bin/sh
# Parser pack (ZN-062), the constructs whose output depends on files: inline `type` specifiers and import.meta.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
echo "export type B = number
export const v: number = 7" > "$tmp/b.ts"
printf "import { v, type B } from './b'\nexport { type B }\nconst x: B = v\nconsole.log(x)\nconsole.log(import.meta.url.endsWith('/m.ts'), import.meta.dirname === '%s', import.meta.filename.endsWith('m.ts'))\n" "$tmp" > "$tmp/m.ts"
out=$("$ZINC" run "$tmp/m.ts" 2>&1)
[ "$out" = "7
true true true" ] || { echo "inline type specifiers or import.meta: $out"; exit 1; }
