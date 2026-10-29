#!/bin/sh
# JSON.parse and JSON.stringify of a document shaped like the iPod demo's cache (bench/json_large.ts is the timed one), on the interpreter
# and on QuickJS: the round trip gives the same text (key order, escapes, numbers), numbers read and print as JavaScript does (the parser's
# exact fast path and its strtod fallback), unicode escapes and repeated keys; then fs.writeTextAsync and readTextAsync round-trip it and
# a missing file rejects. No timing is asserted.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/p" && cat > "$tmp/p/main.ts" <<'TS'
import * as fs from 'zinc:fs';
const out: unknown[] = [];
let seed = 7;
const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
for (let i = 0; i < 200; i++) {
  const sim: unknown[] = [];
  for (let j = 0; j < 50; j++) sim.push({ artist: 'Artist name ' + Math.floor(rnd() * 5000), match: Math.floor(rnd() * 1e6) / 1e6, tag: j % 3 === 0 ? 'a "quoted" \\ tag\n' : 'é😀' });
  out.push({ artist: 'Band é ' + i, at: 1700000000000 + i * 1000, ok: i % 2 === 0, none: null, similar: sim });
}
const text = JSON.stringify(out);
const back: any = JSON.parse(text);
console.log('roundtrip', JSON.stringify(back) === text, back.length, back[199].similar[49].artist === (out[199] as any).similar[49].artist);
console.log(JSON.stringify(JSON.parse('[0.1,1e21,1e-7,123456789012345678,-0,0.000001,1.7976931348623157e308,5e-324,1.5e300,123.456e-5,9007199254740993,0.30000000000000004,-12.5e2,100,255,256,1E2,2.5E-3,0.1e1,1234567890.12345,4.35,1e22,1e23,-1e-22,0.0000123,1.1e-6]')));
console.log(JSON.stringify(JSON.parse('"\\u00e9\\ud83d\\ude00\\n\\t\\"\\\\\\/\\u0001x"')));
console.log(JSON.stringify(JSON.parse('{"a":1,"b":2,"a":3}')));
console.log(JSON.stringify('é😀\u0001\u001f"\\ long text without escapes at all'));
const path = fs.tmpdir() + '/zinc-json-large-' + Math.floor(rnd() * 1e9) + '.json';
async function files(): Promise<void> {
  await fs.writeTextAsync(path, text);
  const s = await fs.readTextAsync(path);
  console.log('async', s === text);
  fs.remove(path);
  try { await fs.readTextAsync(path + '.missing'); console.log('missing: resolved'); } catch (e) { console.log('missing:', (e as Error).message.slice(0, 6)); }
}
files();
TS
want='roundtrip true 200 true
[0.1,1e+21,1e-7,123456789012345680,0,0.000001,1.7976931348623157e+308,5e-324,1.5e+300,0.00123456,9007199254740992,0.30000000000000004,-1250,100,255,256,100,0.0025,1,1234567890.12345,4.35,1e+22,1e+23,-1e-22,0.0000123,0.0000011]
"é😀\n\t\"\\/\u0001x"
{"a":3,"b":2}
"é😀\u0001\u001f\"\\ long text without escapes at all"
async true
missing: ENOENT'
for engine in --interp "--engine quickjs"; do
  # shellcheck disable=SC2086
  got=$(ZINC_HEADLESS=1 "$ZINC" run "$tmp/p/main.ts" $engine 2>"$tmp/err")
  [ "$got" = "$want" ] || { echo "FAIL ($engine):"; echo "$got"; tail -5 "$tmp/err"; exit 1; }
done
echo "json large: ok"
