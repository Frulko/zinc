import * as ui from 'zinc:ui';
import { createNodeRef, createSignal, render } from 'zinc:ui/solid';
import { Button, HoldToConfirm, SegmentedControl, ToggleGroup, CommandPalette, ContextMenu, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = createNodeRef();
const [segment, setSegment] = createSignal('a');
const [values, setValues] = createSignal<string[]>(['a']);
const [visible, setVisible] = createSignal(true);
const [open, setOpen] = createSignal(true);
let confirmed = 0, invoked = 0, frame = 0;
function App(): i32 {
  return <View ref={root} className="flex-col p-4 gap-3">
    <Button label="Disabled" disabled={true} onClick={() => invoked++} />
    <Show when={visible()}><HoldToConfirm label="Archive" duration={100} onConfirm={() => confirmed++} /></Show>
    <SegmentedControl label="View" items={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B', disabled: true }, { value: 'c', label: 'C' }]} value={segment} onChange={setSegment} />
    <ToggleGroup label="Mode" items={[{ value: 'a', label: 'Choice A' }, { value: 'b', label: 'Choice B', disabled: true }, { value: 'c', label: 'Choice C' }]} value={values} onChange={setValues} />
    <ToggleGroup label="Single choice" items={[{ value: 'a', label: 'Only choice' }]} value={values} onChange={setValues} />
    <ContextMenu items={[{ label: 'Context action', onSelect: () => invoked += 100 }]}><Text>Context target</Text></ContextMenu>
    <CommandPalette open={open} onOpenChange={setOpen} items={[{ label: 'Save document', onSelect: () => invoked++ }, { label: 'Export PDF', onSelect: () => invoked += 10 }]} />
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if (n.tag === ui.TEXT && n.text === label) {
    let parent = n.parent;
    while (parent >= 0) {
      const ancestor = ui.inspectNode(parent);
      if (ancestor === null) break;
      if (ancestor.tag === ui.BUTTON) return parent;
      parent = ancestor.parent;
    }
    return n.parent;
  }
  for (const c of n.children) { const r = find(c, label); if (r >= 0) return r; }
  return -1;
}
function occurrences(h: i32, text: string): i32 {
  const node = ui.inspectNode(h);
  if (node === null) return 0;
  let count: i32 = node.tag === ui.TEXT && node.text === text ? 1 : 0;
  for (const child of node.children) count += occurrences(child, text);
  return count;
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    ui.typeText(-1, 'PDF'); ui.keyDown(-1, 'Backspace');
    if (occurrences(root.node, 'Export PDF') !== 1) throw new Error('palette ranking duplicated a row');
    ui.keyDown(-1, 'ArrowDown'); ui.keyDown(-1, 'Enter');
  }
  if (frame === 3) {
    const h = find(root.node, 'Archive');
    ui.keyDown(h, ' '); ui.tick(40); ui.keyUp(' '); ui.tick(100);
    if (confirmed !== 0) throw new Error('early release confirmed');
    ui.keyDown(h, ' '); ui.tick(120); ui.tick(120);
    if (confirmed !== 1) throw new Error('hold must confirm once');
    ui.keyUp(' ');
    ui.keyDown(h, ' '); ui.focusNode(-1); ui.tick(120);
    if (confirmed !== 1) throw new Error('blur did not cancel');
    ui.keyDown(h, ' '); ui.systemSignal('focus 0'); ui.tick(120); ui.systemSignal('focus 1');
    if (confirmed !== 1) throw new Error('window blur did not cancel');
    const b = find(root.node, 'Disabled'); ui.focusNode(b);
    if (ui.focused() === b) throw new Error('disabled took focus');
    const a = find(root.node, 'A'); ui.keyDown(a, 'ArrowRight');
    if (ui.focused() !== find(root.node, 'C')) throw new Error('segment disabled skip/focus');
    const only = find(root.node, 'Choice A'); ui.keyDown(only, 'ArrowRight');
    if (ui.focused() !== find(root.node, 'Choice C')) throw new Error('toggle disabled skip/focus');
    const single = find(root.node, 'Only choice'); ui.keyDown(single, 'ArrowRight');
    if (ui.focused() !== single) throw new Error('toggle arrows escaped single group');
    ui.keyDown(only, 'Enter');
  }
  if (frame === 4) {
    ui.systemSignal('reducemotion 1');
    ui.keyDown(find(root.node, 'Archive'), ' '); setVisible(false); ui.tick(120);
    if (confirmed !== 1) throw new Error('disposed hold confirmed');
  }
  if (frame === 5) {
    if (segment() !== 'c' || values().length !== 1 || values()[0] !== 'a' || invoked !== 10 || open()) throw new Error('segment or palette selection failed');
    ui.keyDown(find(root.node, 'Context target'), 'F10', ui.SHIFT); ui.keyDown(-1, 'Enter');
  }
  if (frame === 7) {
    if (invoked !== 110) throw new Error('keyboard context menu');
    console.log('actions: ok');
  }
});
