import * as ui from 'zinc:ui';
import { render, useState, MutableRef } from 'zinc:ui/react';
import { CodeBlock, CodeEditor, DiffViewer, MarkdownView, JsonViewer, useQuietTheme } from 'zinc:ui/kit';
import { checkModels } from '../kit-code/model';
useQuietTheme();
function expect(v: boolean, message: string): void { if (!v) throw new Error(message); }
checkModels();
const root = new MutableRef<i32>(-1);
let text: () => string = () => '', source: () => string = () => '';
let setShow: (v: boolean) => void = (v: boolean) => {};
let setJson: (v: string) => void = (v: string) => {}, setDiff: (v: string) => void = (v: string) => {};
let frame = 0, links = 0, tasks = 0, lastHref = '';
let linkX: number = 0, linkY: number = 0;
let jsonPainted: boolean = false;
function App(): i32 {
  const [value, setText] = useState('const count = 1;\ncount + 2;');
  const [markdown, setSource] = useState('# Workshop\n\nPréparez: before you build, read the **small** [guide](https://example.org)[API](https://example.org/api).\n\n- [ ] Read the guide');
  const [visible, setVisible] = useState(true);
  const [json, updateJson] = useState('{"a/b": {"child":1}, "a": {"b":2}}'), [diff, updateDiff] = useState('changed'); setJson = updateJson; setDiff = updateDiff;
  text = () => value; source = () => markdown; setShow = setVisible;
  return <View ref={root} className="flex-col p-3 gap-2">
    <CodeBlock code="const answer = 42;" language="ts" lineNumbers={true} emphasizedLines={[1]} title="Snippet" />
    {visible ? <CodeEditor label="Source editor" value={text} onChange={setText} language="ts" height={90} indent="    " /> : <View />}
    <CodeEditor label="Read only" value={() => 'locked'} onChange={(v: string) => { throw new Error('read only edit'); }} readOnly={true} height={50} />
    <DiffViewer before={'same\n'.repeat(8) + 'one\ntwo\nthree'} after={'same\n'.repeat(8) + 'one\n' + diff + '\nthree'} title="Revision" height={80} />
    <MarkdownView source={source()} compact={true} className="w-[220px]" onLink={(href: string) => { links++; lastHref = href; }} onTask={(next: string, offset: i32, checked: boolean) => { tasks++; setSource(next); }} />
    <JsonViewer source={json} label="First JSON" height={70} />
    <JsonViewer source={'{"a/b": {"child":1}, "a": {"b":2}}'} label="Second JSON" height={70} />
    <JsonViewer source="null" label="Primitive JSON" height={30} />
    <JsonViewer source="{" label="Invalid JSON" height={20} />
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.label === label) return h;
  if (n.text === label && n.parent >= 0) { const parent = ui.inspectNode(n.parent); if (parent !== null && parent.tag === ui.BUTTON) return n.parent; }
  for (const c of n.children) { const got = find(c, label); if (got >= 0) return got; }
  return -1;
}
function hasValue(h: i32, value: string): boolean { const n = ui.inspectNode(h); if (n === null) return false; if (n.ed !== null && ui.getValue(h) === value) return true; for (const c of n.children) if (hasValue(c, value)) return true; return false; }
function attr(h: i32, key: string): string { const n = ui.inspectNode(h); if (n === null) return ''; const at = n.attrK.indexOf(key); return at < 0 ? '' : n.attrV[at]; }
function field(h: i32): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.ed !== null && n.ed.multi) return h;
  for (const c of n.children) { const got = field(c); if (got >= 0) return got; }
  return -1;
}
ui.setAfterPaint(() => {
  if (frame === 13) {
    expect(find(find(root.current, 'First JSON'), '\"replacement\": [2 items]') >= 0, 'JSON input cache invalidation');
    expect(hasValue(find(root.current, 'Revision'), 'replacement'), 'diff input cache invalidation');
  }
  if (frame !== 6) return;
    expect(attr(find(find(root.current, 'First JSON'), '\"a/b\": {1 keys}'), 'aria-expanded') === 'false', 'JSON keyboard fold');
    expect(attr(find(find(root.current, 'Second JSON'), '\"a/b\": {1 keys}'), 'aria-expanded') === 'true', 'JSON folds crossed instances');
    const tree = find(root.current, 'First JSON'), item = find(tree, '\"a/b\": {1 keys}');
    expect(attr(tree, 'aria-activedescendant') === attr(item, 'id') && attr(item, 'id') !== '', 'JSON active descendant identity');
  jsonPainted = true;
});
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    const h = field(find(root.current, 'Source editor')); expect(h >= 0, 'editor mounted'); ui.focusNode(h); ui.select(h, 0, 0); ui.keyDown(h, 'Tab');
  }
  if (frame === 3) { expect(text().startsWith('    const'), 'editor indent or callback: ' + JSON.stringify(text())); const h = field(find(root.current, 'Read only')); ui.focusNode(h); ui.insertText('x'); expect(ui.getValue(h) === 'locked', 'read only field changed'); const link = find(root.current, 'guide: https://example.org');
    expect(link >= 0, 'inline link node');
    const n = ui.inspectNode(link), box = ui.screenBox(link);
    const at = n !== null ? n.text.indexOf('API') : -1;
    let x: number = -1, y: number = 8;
    expect(box[3] > 18, 'inline link fixture must wrap');
    for (; y < box[3] && x < 0; y += 18) {
      for (let pixel: i32 = 0; pixel < box[2]; pixel++) if (ui.textOffsetAt(link, pixel, y) === at) { x = pixel + 0.25; break; }
      if (x >= 0) break;
    }
    expect(x >= 0, 'wrapped inline link source hit');
    linkX = box[0] + x; linkY = box[1] + y;
    ui.pointerAt(linkX, linkY, true, 0); ui.pointerAt(linkX, linkY, false, 0); }
  if (frame === 4) { expect(links === 1 && lastHref === 'https://example.org/api', 'inline pointer link callback');
    const link = find(root.current, 'API: https://example.org/api'); ui.focusNode(link); ui.keyDown(link, 'Home'); ui.keyDown(link, 'Enter'); expect(lastHref === 'https://example.org', 'inline Home target must update before Enter'); ui.keyDown(link, 'ArrowRight'); ui.keyDown(link, ' ');
    expect(links === 3 && lastHref === 'https://example.org/api', 'inline keyboard link callbacks');
    ui.pointerAt(linkX, linkY, true); ui.pointerAt(linkX + 20, linkY, true); ui.pointerAt(linkX, linkY, false);
    expect(links === 3, 'inline drag activated a link');
    ui.pointerAt(linkX, linkY, true); ui.systemSignal('background'); ui.systemSignal('foreground'); ui.pointerAt(linkX, linkY, false);
    expect(links === 3, 'inline cancelled press activated a link');
    console.log('inline links: ok'); ui.click(find(root.current, 'Read the guide')); }
  if (frame === 5) { expect(tasks === 1 && source().includes('[x]'), 'task source callback'); const h = find(root.current, 'First JSON'); ui.focusNode(h); ui.keyDown(h, 'ArrowDown'); ui.keyDown(h, 'ArrowLeft'); }
  if (frame === 6) {
    const fold = find(root.current, 'Show 6 unchanged lines'); expect(fold >= 0, 'diff fold control'); ui.keyDown(fold, 'Enter');
    ui.click(find(root.current, 'Next change')); const h = field(find(root.current, 'Source editor')); ui.keyDown(h, 'f', ui.META); }
  if (frame === 7) { expect(jsonPainted, 'JSON fold must render in its normal paint'); const focused = ui.inspectNode(ui.focused()); expect(focused !== null && focused.label === 'Find text', 'find shortcut focus'); ui.insertText('count'); }
  if (frame === 8) ui.keyDown(-1, 'Enter');
  if (frame === 9) { const h = field(find(root.current, 'Source editor')); expect(ui.selectedText(h) === 'count', 'find selection'); ui.keyDown(h, 'g', ui.META); }
  if (frame === 10) { const h = ui.focused(), focused = ui.inspectNode(h); expect(focused !== null && focused.label === 'Line number', 'go to line focus'); ui.select(h, 0, ui.getValue(h).length); ui.insertText('2'); ui.keyDown(h, 'Enter'); }
  if (frame === 11) { const h = field(find(root.current, 'Source editor')); expect(ui.caretOf(h) === text().indexOf('\n') + 1, 'go to line caret'); ui.keyDown(h, 'Escape'); expect(ui.focused() === find(root.current, 'Source editor'), 'Escape keyboard exit'); setShow(false); }
  if (frame === 12) { ui.systemSignal('reducemotion 1'); setShow(true); setJson('{"replacement":[1,2]}'); setDiff('replacement'); }
  if (frame === 14) { const h = field(find(root.current, 'Source editor')); ui.focusNode(h); ui.select(h, 0, 0); ui.insertText('// '); }
  if (frame === 15) { expect(text().startsWith('// '), 'editor restart lost callback'); console.log('code react: ok'); }
});
