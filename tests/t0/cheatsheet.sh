#!/bin/sh
# ZN-774.35: docs/cheatsheet.md is generated from lib/*.d.ts (zinc doc --cheatsheet); a declaration changed without the page fails here.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
"$ZINC" doc --cheatsheet --out "$tmp/cheatsheet.md" || { echo "zinc doc --cheatsheet failed"; exit 1; }
diff -u docs/cheatsheet.md "$tmp/cheatsheet.md" > "$tmp/diff" || { head -20 "$tmp/diff"; echo "docs/cheatsheet.md is stale: run zinc doc --cheatsheet --out docs/cheatsheet.md"; exit 1; }
# one line per function, with its signature and its comment, under its module
for want in '## zinc:gfx' '## zinc:fs' '## Globals' '- `rect(x: number, y: number, w: number, h: number, color: u32): void`' \
            '- `args(): string[]` Command-line arguments after the program name.'; do
  grep -qF -- "$want" docs/cheatsheet.md || { echo "docs/cheatsheet.md lacks: $want"; exit 1; }
done
exit 0
