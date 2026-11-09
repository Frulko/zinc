import { diffLines, diffVisible, diffRange } from '../../../lib/std/kit/code-diff';
import { jsonValueLines, parseJsonDocument, JsonStatus } from '../../../lib/std/json-tree';
import { inline } from '../../../lib/std/markdown';
import { parse, viewBlocks } from 'zinc:markdown';
import { EditorState, Doc, Assist, edited, indent, newline, one, langNamed, setAssist, getAssist } from 'zinc:editor';
function expect(v: boolean, message: string): void { if (!v) throw new Error(message); }
export function checkModels(): void {
  for (const pair of [['a\nb\nc', 'a\nx\nc'], ['', 'new'], ['old', ''], ['a\na\nb', 'a\nb\na']]) {
    const rows = diffLines(pair[0], pair[1]);
    expect(rows.filter((r) => r.kind <= 0).map((r) => r.before).join('\n') === pair[0], 'diff before reconstruction');
    expect(rows.filter((r) => r.kind >= 0).map((r) => r.after).join('\n') === pair[1], 'diff after reconstruction');
  }
  const long = 'same\n'.repeat(100) + 'end';
  expect(diffVisible(diffLines(long, long), 3, []).length === 1, 'unchanged diff context');
  const json = JSON.parse('{"a/b":1,"a":{"b":2},"~":[],"":null}');
  const lines = jsonValueLines(json, [], 3);
  expect(lines.some((r) => r.path === '/a~1b') && lines.some((r) => r.path === '/a/b') && lines.some((r) => r.path === '/~0') && lines.some((r) => r.path === '/'), 'escaped JSON paths');
  expect(jsonValueLines(42, [], 2)[0].text === '42', 'primitive root');
  expect(jsonValueLines(json, ['/a'], 3).length === lines.length - 1, 'independent JSON fold');
  expect(parseJsonDocument('{').status === JsonStatus.Invalid, 'invalid JSON state');
  expect(indent(one('x', 0, 0), '\t').text === '\tx', 'tab indentation');
  const doc = new Doc(0); doc.setText('const value = 1;'); doc.tokens(0); doc.setLanguage(langNamed('ts')); expect(doc.tokens(0)[1] !== 0, 'language invalidates token cache');
  expect(indent(one('x', 0, 0), '    ').text === '    x', 'custom indent');
  expect(newline(one('{', 1, 1), '\t').text === '{\n\t', 'custom newline');
  const a = new EditorState('', '', langNamed('ts')), b = new EditorState('', '', langNamed('json'));
  let countA = 0, countB = 0;
  a.onEdited = (s: EditorState) => countA++; b.onEdited = (s: EditorState) => countB++;
  a.assistant = new Assist(); b.assistant = new Assist(); setAssist(new Assist());
  expect(getAssist(a) !== getAssist(b), 'assistant instance isolation');
  edited(a, 'a'); edited(b, 'b'); expect(countA === 1 && countB === 1, 'edit callback isolation');

  const adjacent = inline('[a](first)[b](second)');
  expect(adjacent.text === 'ab' && adjacent.linkRanges.join(',') === '0,1,1,2', 'subset adjacent link ranges');
  const rich = viewBlocks(parse('[**a**](first)[b](second)'))[0].inline;
  expect(rich.text === 'ab' && rich.links.join(',') === 'first,second' && rich.linkRanges.join(',') === '0,1,1,2', 'md4c nested and adjacent link ranges');
  const large = diffLines('a\n'.repeat(2000), 'b\n'.repeat(2000));
  expect(large.length === 4001 && large[large.length - 1].kind === 0, 'bounded coarse diff retains final shared line');
  expect(diffRange('a'.repeat(2001), 'b').length === 0, 'long changed line bounded');
  expect(jsonValueLines([], [], 2)[0].fold === 0, 'empty container is not expandable');
  const nested = viewBlocks(parse('- parent\n  - child\n\n> first\n>\n> second'));
  expect(nested[0].blocks.length === 1 && nested[0].blocks[0].inline.text === 'child', 'nested list content');
  expect(nested[1].blocks.length === 2 && nested[1].blocks[1].inline.text === 'second', 'quote paragraph boundary');
  const aligned = viewBlocks(parse('| left | right |\n| :--- | ---: |\n| a | b |'));
  expect(aligned[0].alignments.join(',') === '1,3', 'native table alignment');
}
