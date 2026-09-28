// Self-check of the editor's logic that has no UI: fuzzy matching, the highlighters (states across lines), bracket
// matching, search, ANSI colours and `zinc check --json` parsing. Prints one line per check; exits 1 on a failure.
//   zinc run examples/zed-editor/src/selftest.ts --target sim      (or the default target)
import * as sys from 'zinc:sys';
import { fuzzy, segments, Fuzzy } from './app/fuzzy';
import { tokenize, L_TS, L_CSS, L_MD, L_JSON, S_NORMAL, S_COMMENT, S_TEMPLATE, S_FENCE, S_CSS_RULE, T_COMMENT, T_KEYWORD, T_STRING,
  T_TYPE, T_FN, T_PROPERTY, T_TAG, T_ATTR, T_HEADING, T_NUMBER } from './app/syntax';
import { Doc, matchBracket } from './app/document';
import { parseAnsi, parseDiagnostics } from './app/tools';
import { findAll } from './app/search';
import { DARK } from './app/theme';

let failures: i32 = 0;
function check(ok: boolean, what: string): void {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures++;
}
/** Token of the character at column `col` in runs [len, tok...]. */
function tokAt(runs: i32[], col: i32): i32 {
  let p: i32 = 0;
  for (let i = 0; i + 1 < runs.length; i += 2) { if (col < p + runs[i]) return runs[i + 1]; p += runs[i]; }
  return -1;
}
function line(lang: i32, s: string, state: i32): i32[] { const out: i32[] = []; tokenize(lang, s, state, out); return out; }

// ---- fuzzy
const f1 = fuzzy('dash', 'src/ui/Dashboard.tsx', 7);
check(f1 !== null && (f1 as Fuzzy).hits.join(',') === '7,8,9,10', 'fuzzy: a substring at a word start');
check(fuzzy('xyz', 'src/main.ts', 4) === null, 'fuzzy: missing characters do not match');
const a = fuzzy('tog', 'editor: toggle soft wrap', 0), b = fuzzy('tog', 'theme selector: toggle light', 0);
check(a !== null && (a as Fuzzy).hits[0] === 8, 'fuzzy: contiguous "tog" in "toggle"');
check(b !== null && (b as Fuzzy).hits[0] === 16, 'fuzzy: prefers the contiguous match over scattered letters');
const st = fuzzy('st', 'src/lib/stats.ts', 8), sm = fuzzy('st', 'docs/notes/misc/test-data.md', 16);
check(st !== null && sm !== null && (st as Fuzzy).score > (sm as Fuzzy).score, 'fuzzy: file name matches rank first');
check(segments('Dashboard.tsx', [0, 1, 2, 3]).join('|') === '|Dash|board.tsx|', 'fuzzy: highlighted segments');

// ---- highlighting
const ts = line(L_TS, 'const x: Foo = bar(1); // hi', S_NORMAL);
check(tokAt(ts, 0) === T_KEYWORD && tokAt(ts, 9) === T_TYPE && tokAt(ts, 15) === T_FN && tokAt(ts, 19) === T_NUMBER && tokAt(ts, 23) === T_COMMENT, 'ts: keyword, type, call, number, comment');
const open: i32[] = [];
check(tokenize(L_TS, 'let a = 1; /* starts', S_NORMAL, open) === S_COMMENT, 'ts: an open block comment carries to the next line');
const inside = line(L_TS, 'still */ return', S_COMMENT);
check(tokAt(inside, 0) === T_COMMENT && tokAt(inside, 9) === T_KEYWORD, 'ts: the comment ends, code resumes');
check(tokenize(L_TS, 'const s = `multi', S_NORMAL, []) === S_TEMPLATE, 'ts: template strings span lines');
check(tokAt(line(L_TS, 'o.prop', S_NORMAL), 2) === T_PROPERTY, 'ts: property after a dot');
const jsx = line(L_TS, '  return <View class="x" grow>{a < b}</View>;', S_NORMAL);
check(tokAt(jsx, 10) === T_TAG && tokAt(jsx, 15) === T_ATTR && tokAt(jsx, 21) === T_STRING, 'tsx: tag, attribute, value');
check(tokAt(line(L_TS, 'createSignal<string>(0)', S_NORMAL), 13) !== T_TAG, 'ts: a generic is not a JSX tag');
const json = line(L_JSON, '  "name": "zinc", "n": 3, "ok": true', S_NORMAL);
check(tokAt(json, 3) !== T_STRING && tokAt(json, 11) === T_STRING && tokAt(json, 23) === T_NUMBER, 'json: keys and values');
check(tokenize(L_MD, '```ts', S_NORMAL, []) === S_FENCE && tokAt(line(L_MD, '# Title', S_NORMAL), 2) === T_HEADING, 'markdown: fences and headings');
const css: i32[] = [];
check(tokenize(L_CSS, '.card {', S_NORMAL, css) === S_CSS_RULE && tokAt(css, 1) === T_TYPE, 'css: selector, then inside a rule');
check(tokAt(line(L_CSS, '  padding: 16px;', S_CSS_RULE), 3) === T_PROPERTY, 'css: property names');

// ---- document: lines, brackets, search (with non-ASCII text: offsets are UTF-16 indices)
const d = new Doc(L_TS);
d.setText('fn(a, [b]) {\n  é = { x: (1) };\n}');
check(d.lineCount() === 3 && d.lineOf(14) === 1 && d.lineText(1) === '  é = { x: (1) };', 'doc: line index');
check(matchBracket(d, 2).join(',') === '2,9', 'brackets: ( before ) on the same line');
check(matchBracket(d, 12).join(',') === '11,31', 'brackets: { across lines');
check(matchBracket(d, 27).join(',') === '26,24', 'brackets: the one before the caret');
check(findAll(d, 'X').join(',') === '21', 'search: case-insensitive, line by line');
check(d.rowColors('é = {', 15, DARK).length > 0, 'doc: colour runs of a row');

// ---- ANSI and diagnostics
const sp = parseAnsi('\u001b[1mWeather\u001b[0m \u001b[32m15 °C\u001b[0m', -1);
check(sp.length === 3 && sp[0].bold && sp[2].color === 2 && sp[2].text === '15 °C', 'ansi: bold, colours, reset');
const diags = parseDiagnostics('[{"uri":"a.ts","range":{"start":{"line":22,"character":25}},"code":"TS2304","severity":1,"message":"Cannot find name \\"celcius\\"."}]');
check(diags.length === 1 && diags[0].line === 22 && diags[0].col === 25 && diags[0].message === 'Cannot find name "celcius".', 'diagnostics: zinc check --json');

console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
if (failures > 0) sys.exit(1);
