#!/bin/sh
# zinc:web's synchronous sha256 in a page (lib/std/web.browser.ts, the port of third_party/sha256 zinc:3d/scene names its files with): equal to
# node's on lengths around the block and padding edges.
cd "$(dirname "$0")/../.." || exit 2
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
sed -n '/^const K256/,/^}$/p' lib/std/web.browser.ts > "$tmp/sha.ts"
cat >> "$tmp/sha.ts" <<'TS'
import { createHash } from 'node:crypto';
const hex = (a: number[]) => a.map((v) => v.toString(16).padStart(2, '0')).join('');
for (const n of [0, 3, 55, 56, 63, 64, 65, 1000, 100000]) {
  const buf = new Uint8Array(n); for (let i = 0; i < n; i++) buf[i] = (i * 131 + 7) & 255;
  if (hex(sha256(buf)) !== createHash('sha256').update(buf).digest('hex')) { console.log('web sha256: wrong digest for ' + n + ' bytes'); process.exit(1); }
}
console.log('web sha256: ok');
TS
node --experimental-strip-types --no-warnings "$tmp/sha.ts"
