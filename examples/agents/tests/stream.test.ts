// Bounded reading (src/services/stream.ts): lines split anywhere, an oversized line spilled to disk with only its head
// kept, the spill read back part by part, and the tolerant unescaping of a cut JSON string.
import * as assert from 'zinc:assert';
import * as fs from 'zinc:fs';
import { LineReader, Spill, LINE_CAP, BIG_HEAD, PART_CHARS, unescapeLoose } from '../src/services/stream';

const dir = fs.mkdtemp(fs.tmpdir() + '/agents-stream-');
const lines: string[] = [];
let bigHead = '', bigSpill: Spill | null = null;
const r = new LineReader(dir + '/t', (l: string) => lines.push(l), (h: string, s: Spill) => { bigHead = h; bigSpill = s; });

r.feed('{"a":1}\n{"b"');
r.feed(':2}\r\n\n{"c":');
assert.deepEqual(lines, ['{"a":1}', '{"b":2}']);

// a line of 2.5 × LINE_CAP, fed in 64 KiB chunks: never more than LINE_CAP + BIG_HEAD held
const chunk = 'x'.repeat(65536);
const n = Math.ceil(LINE_CAP * 2.5 / 65536);
let most = 0;
r.feed('3,"out":"');
for (let i = 0; i < n; i++) { r.feed(chunk); most = Math.max(most, r.held()); }
r.feed('"}\nlast');
assert.ok(most <= LINE_CAP + BIG_HEAD, `held ${most}`);
assert.ok(bigSpill !== null, 'the long line was spilled');
const sp = bigSpill as Spill;
assert.equal(sp.total, 14 + n * 65536 + 2);
assert.equal(sp.parts, Math.ceil(sp.total / PART_CHARS));
assert.ok(bigHead.startsWith('{"c":3,"out":"xxx'));
assert.equal(bigHead.length, BIG_HEAD);
assert.equal(sp.read(0).length, PART_CHARS);
assert.equal(lines.length, 2, 'the long line is not a parsed line');
r.end();
assert.deepEqual(lines, ['{"a":1}', '{"b":2}', 'last']);
assert.equal(r.held(), 0);

// unescaping a cut JSON string
assert.equal(unescapeLoose('a\\nb\\t\\"c\\\\d\\u00e9" rest', true), 'a\nb\t"c\\dé');
assert.equal(unescapeLoose('cut here\\', false), 'cut here');
assert.equal(unescapeLoose('half \\u00', false), 'half \\u00');
fs.remove(dir, true);
console.log('stream: ok');
