// zinc:editor, zinc:command-palette and zinc:editor-lsp without a window: the highlighter and its language registry, the
// document model, the editing commands on several selections with undo, the fuzzy matcher and the LSP framing. The output
// is the golden tests/golden/editor/editor_core.out, the same on the interpreter, a zinc build program and QuickJS.
import { Doc, langNamed, langOf, langLabel, registerLanguage, pushRun, tokenize, matchBracket, tokenColor, L_TS, S_NORMAL,
  T_KEYWORD, T_COMMENT, T_STRING, T_NUMBER, T_TEXT, LIGHT, ONE_DARK, theme, useThemes, toggleTheme, DARK,
  one, typeText, wordStart, newline, indent, toggleComment, selectNext, addCursorV, History, Ed, EditorState, edited, setOnEdited } from 'zinc:editor';
import { fuzzy, segments, PaletteItem, ranked } from 'zinc:command-palette';
import { frame, Reader, uriOf } from 'zinc:editor-lsp';

function runs(lang: i32, s: string): string { const out: i32[] = []; tokenize(lang, s, S_NORMAL, out); return out.join(','); }

// the highlighter: TypeScript, JSON, a language registered by the program
console.log('ts ' + runs(L_TS, "const s = 'a'; // x"));
console.log('json ' + runs(langNamed('json'), '{"a": 1}'));
console.log('langs ' + langOf('main.tsx') + ' ' + langOf('notes.md') + ' ' + langOf('a.unknown') + ' ' + langLabel('a.tsx'));
// INI: a comment line, else key = value
function iniLine(s: string, state: i32, out: i32[]): i32 {
  if (s.startsWith(';')) { pushRun(out, s.length, T_COMMENT); return S_NORMAL; }
  const eq = s.indexOf('=');
  if (eq < 0) { pushRun(out, s.length, T_TEXT); return S_NORMAL; }
  pushRun(out, eq, T_KEYWORD); pushRun(out, 1, T_TEXT); pushRun(out, s.length - eq - 1, T_STRING);
  return S_NORMAL;
}
const INI = registerLanguage('INI', ['ini', 'cfg'], iniLine);
console.log('ini ' + (langOf('setup.cfg') === INI ? 'by extension' : 'missing') + ' ' + runs(INI, 'name=zinc') + ' | ' + runs(INI, '; note'));

// the document: lines, tokens carried across lines, colours of a row, brackets
const d = new Doc(L_TS);
d.setText('let a = [1, 2];\n/* open\nstill */ f(a);');
console.log('doc ' + d.lineCount() + ' lines, line of 20: ' + d.lineOf(20) + ', line 2 starts in a comment: ' + (d.tokens(2)[1] === T_COMMENT));
console.log('colors ' + d.rowColors('let a = [1, 2];', 0, LIGHT).join(','));
console.log('bracket ' + matchBracket(d, 8).join(',') + ' number colour ' + (tokenColor(ONE_DARK, T_NUMBER) === ONE_DARK.number));

// editing on several selections, undo
let e: Ed = one('a\nb\nc', 0, 0);
e = addCursorV(addCursorV(e, 1), 1);
e = typeText(e, '(', true);
console.log('cursors ' + JSON.stringify(e.text) + ' ' + e.sels.join(','));
const h = new History();
h.record(e, false);
const before = e;
e = toggleComment(e);
console.log('comment ' + JSON.stringify(e.text));
const back = h.back(e);
console.log('undo ' + (back !== null && (back as Ed).text === before.text));
e = selectNext(selectNext(one('x y x x', 0, 1)));
console.log('select-next ' + e.sels.join(','));
e = newline(one('if (a) {', 8, 8));
console.log('newline ' + JSON.stringify(e.text));
console.log('indent ' + JSON.stringify(indent(one('a\nb', 0, 3)).text));

// the editor's state and the edit hook
let seen = 0;
setOnEdited((s: EditorState) => { seen++; });
const st = new EditorState('/tmp/x.ts', 'let x = 1;', langOf('x.ts'));
edited(st, 'let x = 2;');
console.log('state ' + st.text() + ' ' + st.doc.lines[0] + ' edits ' + seen + ' caret ' + st.caret());

// themes
useThemes(LIGHT, DARK, false);
toggleTheme();
console.log('theme ' + theme().name);

// the palette's matcher
const m = fuzzy('mt', 'src/main.ts', 4);
console.log('fuzzy ' + (m === null ? 'none' : m.hits.join(',')) + ' ' + segments('main.ts', [0, 5]).join('|'));
const items: PaletteItem[] = [];
for (const label of ['open file', 'save file', 'settings']) {
  const f = fuzzy('sf', label, 0);
  if (f === null) continue;
  const it = new PaletteItem(label, '', '', '', () => {});
  it.score = f.score; items.push(it);
}
console.log('ranked ' + ranked(items, 'sf', 5).map((it: PaletteItem): string => it.label).join(','));

// the language server's framing
const r = new Reader();
const msgs = r.push(frame('{"id":1}') + frame('{"é":2}').slice(0, 10));
const rest = r.push(frame('{"é":2}').slice(10));
console.log('rpc ' + msgs.join(';') + ' / ' + rest.join(';') + ' ' + uriOf('/a b/é.ts') + ' ' + wordStart('foo.bar', 7));
