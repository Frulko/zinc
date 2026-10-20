// The markdown of an answer (src/services/markdown.ts): blocks, and inline marks turned into style runs over the text
// without its marks.
import * as assert from 'zinc:assert';
import { parse, inline, B_PARA, B_HEADING, B_ITEM, B_QUOTE, B_CODE, B_TABLE, B_RULE, S_BOLD, S_ITALIC, S_MONO, S_UNDERLINE,
  R_TEXT, R_CODE, R_LINK } from '../src/services/markdown';

// inline marks: the text loses them, the runs say where they were
let x = inline('Run **make all** then `npm test`, see [the docs](https://x.dev) and *why*.');
assert.equal(x.text, 'Run make all then npm test, see the docs and why.');
assert.deepEqual(x.runs, [4, 0, R_TEXT, 8, S_BOLD, R_TEXT, 6, 0, R_TEXT, 8, S_MONO, R_CODE, 6, 0, R_TEXT, 8, S_UNDERLINE, R_LINK,
  5, 0, R_TEXT, 3, S_ITALIC, R_TEXT, 1, 0, R_TEXT]);
assert.deepEqual(x.links, ['https://x.dev']);
assert.ok(!x.plain());
assert.ok(inline('just words').plain(), 'no marks: no runs needed');
assert.equal(inline('snake_case_name and 2 * 3 * 4').text, 'snake_case_name and 2 * 3 * 4', 'no emphasis inside words or around spaces');
assert.equal(inline('a \\*literal\\* star').text, 'a *literal* star');
assert.equal(inline('an `unclosed tick').text, 'an `unclosed tick');
assert.equal(inline('***both***').text, 'both');

// blocks
const md = [
  '# Title ##',
  'First line',
  'continues here.',
  '',
  '- one',
  '  - nested **bold**',
  '2. second',
  '> quoted',
  '> more',
  '```ts',
  'const a = 1;',
  '',
  'const b = 2;',
  '```',
  '---',
  '| Name | Size |',
  '|---|--:|',
  '| `a.ts` | 3 |',
  '```',
  'cut in the middle',
].join('\n');
const b = parse(md);
const kinds: i32[] = [];
for (const k of b) kinds.push(k.kind);
assert.deepEqual(kinds, [B_HEADING, B_PARA, B_ITEM, B_ITEM, B_ITEM, B_QUOTE, B_CODE, B_RULE, B_TABLE, B_CODE]);
assert.equal(b[0].level, 1);
assert.equal(b[0].inline.text, 'Title');
assert.equal(b[1].inline.text, 'First line continues here.');
assert.equal(b[2].marker, '•');
assert.equal(b[3].level, 1);
assert.equal(b[3].inline.text, 'nested bold');
assert.equal(b[4].marker, '2.');
assert.equal(b[5].inline.text, 'quoted more');
assert.equal(b[6].lang, 'ts');
assert.equal(b[6].code, 'const a = 1;\n\nconst b = 2;');
assert.equal(b[8].rows.length, 2);
assert.equal(b[8].rows[0][1].text, 'Size');
assert.equal(b[8].rows[1][0].text, 'a.ts');
assert.equal(b[9].code, 'cut in the middle', 'an unclosed fence runs to the end');
assert.equal(parse('').length, 0);
