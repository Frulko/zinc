import * as ui from 'zinc:ui';
import { render, createSignal } from 'zinc:ui/solid';
import { Card, CardContent, List, ListItem, Accordion, OpenFileDialog, SaveFileDialog, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const [open, setOpen] = createSignal(false), [save, setSave] = createSignal(false), [selected, setSelected] = createSignal(false);
const [expanded, setExpanded] = createSignal<string[]>(['first']);
let opened = '', saved = '', confirmations = 0, disabledClicks = 0, listClicks = 0, frame = 0;
const folder = '.';
function App(): i32 { return <View className="flex-col gap-3 p-4">
  <Card selected={selected} onClick={() => setSelected(!selected())}><CardContent><Text>Select project</Text></CardContent></Card>
  <Card /><Card disabled={true} onClick={() => { disabledClicks++; }}><CardContent><Text>Disabled project</Text></CardContent></Card>
  <List><ListItem title="Alpha row" onClick={() => { listClicks++; }} /><ListItem title="Beta row" disabled={true} onClick={() => { disabledClicks++; }} /><ListItem title="Cedar row" onClick={() => { listClicks++; }} /></List>
  <Accordion expanded={expanded} onChange={setExpanded} items={[{ id: 'first', title: 'First disclosure', content: () => <Text>First content</Text> }, { id: 'disabled', title: 'Disabled disclosure', disabled: true, content: () => <Text>Disabled content</Text> }, { id: 'third', title: 'Third disclosure', content: () => <Text>Third content</Text> }]} />
  <OpenFileDialog open={open} onOpenChange={setOpen} initialFolder={folder} onConfirm={(paths: string[]) => { opened = paths.join(','); confirmations++; }} />
  <SaveFileDialog open={save} onOpenChange={setSave} initialFolder={folder} initialName="new.md" onConfirm={(paths: string[]) => { saved = paths.join(','); confirmations++; }} />
</View>; }
function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function find(h: i32, label: string, field: boolean = false): i32 {
  const n = ui.inspectNode(h); if (n === null || n.hidden || n.leaving) return -1;
  if (n.label === label && (!field || n.ed !== null)) return h;
  for (const child of n.children) { const got = find(child, label, field); if (got >= 0) return got; }
  return -1;
}
function has(h: i32, text: string): boolean {
  const n = ui.inspectNode(h); if (n === null || n.hidden || n.leaving) return false;
  if (n.text.includes(text)) return true;
  for (const child of n.children) if (has(child, text)) return true;
  return false;
}
function card(h: i32, text: string): i32 {
  const n = ui.inspectNode(h); if (n === null || n.hidden || n.leaving) return -1;
  if (n.role === 'button' && has(h, text)) return h;
  for (const child of n.children) { const got = card(child, text); if (got >= 0) return got; }
  return -1;
}
function type(value: string): void {
  const field = find(ui.rootNode(), 'File name', true); expect(field >= 0, 'missing save name');
  ui.focusNode(field); ui.select(field, 0, ui.getValue(field).length); ui.insertText(value); ui.keyDown(field, 'Enter');
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++; const root = ui.rootNode();
  if (frame === 2) { const h = card(root, 'Select project'); expect(h >= 0, 'card missing'); ui.focusNode(h); ui.keyDown(h, 'Enter'); }
  if (frame === 3) { expect(selected(), 'Enter did not select card'); ui.keyDown(card(root, 'Select project'), ' '); }
  if (frame === 4) {
    expect(!selected(), 'Space did not toggle card'); ui.click(card(root, 'Disabled project')); expect(disabledClicks === 0, 'disabled card acted');
    const first = find(root, 'Alpha row'); ui.focusNode(first); ui.keyDown(first, 'ArrowDown'); expect(ui.focused() === find(root, 'Cedar row'), 'list arrows did not skip disabled row'); ui.keyDown(-1, 'Enter');
  }
  if (frame === 5) {
    expect(listClicks === 1, 'list Enter did not activate');
    ui.focusNode(find(root, 'First disclosure')); ui.keyDown(-1, 'ArrowDown'); expect(ui.focused() === find(root, 'Third disclosure'), 'accordion arrows did not skip disabled heading'); ui.keyDown(-1, ' ');
  }
  if (frame === 6) { expect(expanded().join(',') === 'third', 'accordion Space did not toggle'); setOpen(true); }
  if (frame === 9) { const grid = find(root, 'Files'); expect(has(root, 'sample.md'), 'real scoped listing missing'); ui.focusNode(grid); ui.keyDown(grid, 'ArrowDown'); ui.keyDown(grid, ' '); }
  if (frame === 10) ui.click(find(root, 'Open'));
  if (frame === 11) { expect(!open() && opened === 'sample.md' && confirmations === 1, 'open did not validate and confirm existing file'); setSave(true); }
  if (frame === 14) type('../bad');
  if (frame === 15) { expect(save() && confirmations === 1 && has(root, 'Enter a file name without a folder'), 'save accepted invalid name'); type('sample.md'); }
  if (frame === 16) { expect(save() && has(root, 'already exists'), 'save did not ask before choosing existing file'); ui.click(find(root, 'Replace')); }
  if (frame === 17) { expect(!save() && saved === 'sample.md' && confirmations === 2, 'overwrite path confirmation failed'); setSave(true); }
  if (frame === 19) { const field = find(root, 'File name', true); expect(ui.getValue(field) === 'new.md' && !has(root, 'already exists'), 'reopened save dialog retained old session'); ui.click(find(root, 'Cancel')); }
  if (frame === 20) { expect(!save() && confirmations === 2, 'cancel confirmed a path'); console.log('data surfaces: ok'); }
});
