// Self-check of the editor's logic that needs no window: the editing commands of app/edit.ts (indent, several cursors,
// comments, pairs, line commands, undo). One line per check; exits 1 on a failure.
//   zinc run next/app/atelier/selftest.ts
import * as sys from 'zinc:sys';
import { Ed, norm, typeText, paste, copyText, erase, newline, indent, outdent, toggleComment, deleteLines, duplicateLines, moveLines,
  single, addSel, selectNext, addCursorV, move, History, M_LEFT, M_RIGHT, M_WORD_RIGHT, M_HOME, M_END, M_UP, M_DOWN } from './app/edit';

let failures: i32 = 0;
/** A state from a picture: `|` is a cursor, `«…»` a selection (the last mark is the main one). */
function ed(pic: string): Ed {
  let text = '', a: i32 = -1;
  const sels: i32[] = [];
  for (let i = 0; i < pic.length; i++) {
    const c = pic.slice(i, i + 1);
    if (c === '|') { sels.push(text.length); sels.push(text.length); }
    else if (c === '«') a = text.length;
    else if (c === '»') { sels.push(a); sels.push(text.length); }
    else text += c;
  }
  return norm(text, sels, (sels.length >> 1) - 1);
}
function pic(e: Ed): string {
  let out = '', from: i32 = 0;
  for (let i = 0; i < e.count(); i++) {
    out += e.text.slice(from, e.lo(i));
    out += e.hi(i) > e.lo(i) ? '«' + e.text.slice(e.lo(i), e.hi(i)) + '»' : '|';
    from = e.hi(i);
  }
  return out + e.text.slice(from);
}
function check(got: Ed, want: string, what: string): void {
  const ok = pic(got) === want;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) { failures++; console.log('     got  ' + pic(got).split('\n').join('⏎') + '\n     want ' + want.split('\n').join('⏎')); }
}
function same(got: string, want: string, what: string): void {
  const ok = got === want;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) { failures++; console.log('     got  ' + got + '\n     want ' + want); }
}

// ---- 1. Tab and Shift+Tab
check(indent(ed('a\n«b\nc»\nd')), 'a\n«  b\n  c»\nd', 'Tab indents every line of the selection');
check(indent(ed('if (x) {\nfo«o»();\n}')), 'if (x) {\n  fo«o»();\n}', 'Tab with part of a line selected indents the line');
check(indent(ed('«a\n»b')), '«  a\n»b', 'a selection ending at a line start leaves that line');
check(indent(ed('a\n«b\n\nc»')), 'a\n«  b\n\n  c»', 'blank lines get no indent');
check(indent(ed('ab|c')), 'ab  |c', 'Tab without selection inserts the indent unit');
check(indent(ed('abc|')), 'abc |', 'Tab stops at the next indent column');
check(outdent(ed('  a\n    «b\n  c»\nd')), '  a\n  «b\nc»\nd', 'Shift+Tab unindents every line of the selection');
check(outdent(ed('    fo|o')), '  fo|o', 'Shift+Tab without selection unindents the line');
check(outdent(ed(' a|\nb|')), 'a|\nb|', 'Shift+Tab removes what indent there is');

// ---- 2. several cursors
check(typeText(ed('a| b| c|'), 'x', true), 'ax| bx| cx|', 'typing goes to every cursor');
check(typeText(ed('«one» two «one»'), 'x', false), 'x| two x|', 'typing replaces every selection');
check(erase(ed('ab| cd| ef|'), false), 'a| c| e|', 'Backspace at every cursor');
check(erase(ed('|ab |cd'), true), '|b |d', 'Delete at every cursor');
check(erase(ed('a|b|c'), false), '|c', 'cursors that meet become one');
check(paste(ed('a| b|'), 'XY'), 'aXY| bXY|', 'paste at every cursor');
check(paste(ed('a| b|'), 'X\nY'), 'aX| bY|', 'paste of as many lines as cursors: one each');
same(copyText(ed('«ab» c «de»')), 'ab\nde', 'copy joins the selections');
check(indent(ed('«a»\nb\n«c»')), '«  a»\nb\n«  c»', 'Tab on several selections');
check(outdent(ed('  a|\nb\n  c|')), 'a|\nb\nc|', 'Shift+Tab on several cursors');
check(selectNext(ed('foo ba|r foo bar')), 'foo «bar» foo bar', 'Cmd+D takes the word under the cursor');
check(selectNext(ed('foo «bar» foo bar')), 'foo «bar» foo «bar»', 'Cmd+D adds the next occurrence');
check(selectNext(ed('bar foo «bar»')), '«bar» foo «bar»', 'Cmd+D wraps to the start');
check(selectNext(selectNext(ed('«x» x'))), '«x» «x»', 'Cmd+D stops when all are selected');
check(addCursorV(ed('abc\nde|f\ng'), -1), 'ab|c\nde|f\ng', 'Cmd+Alt+Up adds a cursor above');
check(addCursorV(addCursorV(ed('abc|\nd\nefgh'), 1), 1), 'abc|\nd|\nefg|h', 'Cmd+Alt+Down twice, a short line in between');
check(addCursorV(ed('a|'), 1), 'a|', 'no line below: nothing');
check(addSel(ed('a|bc'), 3, 3), 'a|bc|', 'Alt+click adds a cursor');
check(single(ed('a|b|c|')), 'abc|', 'Escape keeps the main cursor');
check(move(ed('ab| cd|'), M_LEFT, false), 'a|b c|d', 'arrows move every cursor');
check(move(ed('|ab |cd'), M_WORD_RIGHT, true), '«ab» «cd»', 'Shift+Alt+Right extends every cursor by a word');
check(move(ed('a«b»c'), M_RIGHT, false), 'ab|c', 'Right on a selection goes to its end');
check(move(ed('  ab|\n  cd|'), M_HOME, false), '  |ab\n  |cd', 'Home goes to the text of the line');
check(move(ed('|ab\n|cd'), M_END, false), 'ab|\ncd|', 'End at every cursor');
check(move(ed('abc\nde|'), M_UP, false), 'ab|c\nde', 'Up keeps the column');
check(move(ed('abc|\nd\n'), M_DOWN, false), 'abc\nd|\n', 'Down stops at a shorter line');
const h = new History();
const s0 = ed('a| b|');
const s1 = typeText(s0, 'x', true); h.record(s0, true);
const s2 = typeText(s1, 'y', true); h.record(s1, true);
const u = h.back(s2);
check(u !== null ? u as Ed : s2, 'a| b|', 'one undo takes back the typing at every cursor');
const r = h.forward(u !== null ? u as Ed : s2);
check(r !== null ? r as Ed : s0, 'axy| bxy|', 'redo brings it back');
const s3 = indent(ed('«a\nb»')); h.record(ed('«a\nb»'), false);
const u3 = h.back(s3);
check(u3 !== null ? u3 as Ed : s3, '«a\nb»', 'undo of Tab restores the text and the selection');

// ---- 3. Enter and comments
check(newline(ed('  foo|')), '  foo\n  |', 'Enter keeps the indent');
check(newline(ed('if (x) {|')), 'if (x) {\n  |', 'Enter after an opening brace: one more level');
check(newline(ed('  f(|)')), '  f(\n    |\n  )', 'Enter between brackets opens a block');
check(newline(ed('a|\n  b|')), 'a\n|\n  b\n  |', 'Enter at every cursor');
check(toggleComment(ed('  a\n  «b\n    c»')), '  a\n  // «b\n  //   c»', 'Cmd+/ comments the lines at their common indent');
check(toggleComment(ed('  // «b\n  //   c»')), '  «b\n    c»', 'Cmd+/ again removes it');
check(toggleComment(ed('x = 1;| // note')), '// x = 1;| // note', 'a trailing comment does not count');
check(toggleComment(ed('// a\n«b\n// c»')), '// a\n// «b\n// // c»', 'mixed lines are commented');

// ---- 4. pairs and line commands
check(typeText(ed('f|'), '(', true), 'f(|)', 'an opening bracket brings its closing one');
check(typeText(ed('f(|)'), ')', true), 'f()|', 'typing the closing bracket steps over it');
check(typeText(ed('x = |;'), '"', true), 'x = "|";', 'a quote closes itself');
check(typeText(ed('don|'), "'", true), "don'|", 'no pair after a letter');
check(typeText(ed('f|oo'), '(', true), 'f(|oo', 'no pair before a word');
check(typeText(ed('«ab»'), '[', true), '[«ab»]', 'a bracket typed on a selection wraps it');
check(erase(ed('f(|)'), false), 'f|', 'Backspace between an empty pair removes both');
check(erase(ed('    |x'), false), '  |x', 'Backspace in the indent removes one level');
check(deleteLines(ed('a\nb|\nc')), 'a\n|c', 'Cmd+Shift+K deletes the line');
check(deleteLines(ed('a\nb|')), 'a|', 'deleting the last line');
check(duplicateLines(ed('a\nb|c\nd')), 'a\nbc\nb|c\nd', 'Cmd+Shift+D duplicates the line');
check(moveLines(ed('a\nb|\nc'), -1), 'b|\na\nc', 'Alt+Up moves the line');
check(moveLines(ed('a\n«b\nc»\nd'), 1), 'a\nd\n«b\nc»', 'Alt+Down moves the selected lines');
check(moveLines(ed('a|\nb'), -1), 'a|\nb', 'the first line does not move up');

console.log(failures === 0 ? 'selftest passed' : `${failures} failure(s)`);
if (failures > 0) sys.exit(1);
