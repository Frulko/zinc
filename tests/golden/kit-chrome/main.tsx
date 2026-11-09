import * as ui from 'zinc:ui';
import * as dnd from 'zinc:ui/dnd';
import { createSignal, createNodeRef, render } from 'zinc:ui/solid';
import { DocumentTabs, DockLayout, DockLayoutState, parseDockLayout, saveDockLayout, moveDockPanel, setDockPanelOpen, StatusBar, StatusItem, Toolbar } from 'zinc:ui/kit';
import { MenuBar, useQuietTheme, keyLabel } from 'zinc:ui/kit';
useQuietTheme();
if (keyLabel('ctrl--') !== '⌃-' || keyLabel('mod-shift--') !== '⌘⇧-' || keyLabel('') !== '') throw new Error('minus shortcut hint');
const initial: DockLayoutState = { root: { id: 'root', axis: 'tabs', ratio: 0.5, tabs: ['a', 'b'], selected: 'a' }, closed: [] };
const moved = moveDockPanel(initial, 'b', 'root', 'right');
if (initial.root.tabs.length !== 2 || moved.root.axis !== 'horizontal') throw new Error('move mutated input');
const closed = setDockPanelOpen(moved, 'b', false);
const reopened = setDockPanelOpen(parseDockLayout(saveDockLayout(closed)), 'b', true);
if (closed.closed.length !== 1 || reopened.closed.length !== 0 || reopened.root.second?.tabs[0] !== 'b') throw new Error('saved close/reopen lost placement');
let rejected = 0;
for (const bad of ['{}', '{"root":{"id":"x","axis":"tabs","tabs":["a","a"],"selected":"a"},"closed":[]}', '{"root":{"id":"x","axis":"horizontal","ratio":2},"closed":[]}']) {
  try { parseDockLayout(bad); } catch (e) { rejected++; }
}
if (rejected !== 3 || initial.root.selected !== 'a') throw new Error('invalid layout accepted');
const [workspace, setWorkspace] = createSignal(moved);
const [selected, select] = createSignal('a');
const root = createNodeRef();
let removed = '', reordered = '', action = '', frame = 0;
function App(): i32 {
  return <View ref={root} className="flex-col w-full p-4">
    <MenuBar items={[{ label: 'File', mnemonic: 'f', submenu: [{ label: 'Save', id: 'save', accelerator: 'mod-s' }] }, { label: 'Edit', mnemonic: 'e', submenu: [{ label: 'Undo', id: 'undo' }] }]} onSelect={(id: string) => { action = id; }} />
    <Toolbar label="Document tools" items={[{ label: 'Save', onSelect: () => { action = 'toolbar'; } }]} />
    <View className="w-[200px]"><Toolbar label="Narrow tools" items={[{ label: 'Export document' }, { label: 'Publish document' }]} trailing={() => <Text>Ready</Text>} /></View>
    <DocumentTabs items={() => [{ id: 'a', label: 'Alpha', dirty: true }, { id: 'b', label: 'Beta' }]} selected={selected} onSelect={select}
      onClose={(id: string) => { removed = id; }} onMove={(a: i32, b: i32) => { reordered = '' + a + b; }} />
    <View className="h-[240px]"><DockLayout layout={workspace} onChange={setWorkspace} panels={[
      { id: 'a', label: 'Panel A', content: () => <Text>Alpha panel content</Text> },
      { id: 'b', label: 'Panel B', content: () => <Text>Beta panel content</Text> }
    ]} /></View>
    <StatusBar><StatusItem label="Ready" /></StatusBar>
  </View>;
}
function find(h: i32, label: string): i32 {
  const n = ui.inspectNode(h);
  if (n === null) return -1;
  if (n.tag === ui.TEXT && n.text.startsWith(label)) return n.parent;
  for (const c of n.children) { const found = find(c, label); if (found >= 0) return found; }
  return -1;
}
function visibleButton(h: i32, label: string): i32 {
  const n = ui.inspectNode(h);
  if (n === null || n.hidden) return -1;
  if (n.tag === ui.TEXT && n.text === label) {
    let parent = n.parent;
    while (parent >= 0) { const p = ui.inspectNode(parent); if (p === null) break; if (p.tag === ui.BUTTON) return parent; parent = p.parent; }
  }
  for (const c of n.children) { const button = visibleButton(c, label); if (button >= 0) return button; }
  return -1;
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    const overflow = visibleButton(root.node, 'More actions');
    if (overflow < 0 || ui.screenBox(overflow)[0] + ui.screenBox(overflow)[2] > 216) throw new Error('toolbar overflow did not fit');
    ui.keyDown(find(root.node, 'Alpha'), 'ArrowRight');
    if (selected() !== 'b') throw new Error('tab arrows');
    ui.keyDown(-1, 'ArrowLeft', ui.SHIFT);
    ui.keyDown(-1, 'Delete');
    ui.dispatchAction('menu:save');
    if (removed !== 'b' || reordered !== '10' || action !== 'save') throw new Error('tab close/move or accelerator');
    ui.keyDown(-1, 'F10');
  }
  if (frame === 3) {
    ui.keyDown(-1, 'ArrowRight'); ui.keyDown(-1, 'ArrowDown');
  }
  if (frame === 4) ui.keyDown(-1, 'Enter');
  if (frame === 6) {
    if (action !== 'undo') throw new Error('menu traversal');
    setWorkspace(setDockPanelOpen(workspace(), 'b', false));
  }
  if (frame === 7) {
    if (find(root.node, 'Beta panel content') >= 0) throw new Error('closed panel kept building');
    setWorkspace(setDockPanelOpen(workspace(), 'b', true));
  }
  if (frame === 8) {
    if (find(root.node, 'Beta panel content') < 0) throw new Error('panel did not reopen');
    const source = ui.screenBox(find(root.node, 'Panel B')), target = ui.screenBox(find(root.node, 'Alpha panel content'));
    const x = source[0] + source[2] / 2, y = source[1] + 12;
    const tx = target[0] + target[2] / 2, ty = target[1] + target[3] / 2;
    ui.pointerAt(x, y, true); ui.pointerAt(x - 10, y + 10, true); ui.pointerAt(tx, ty, true);
    ui.keyDown(find(root.node, 'Panel B'), 'Escape'); ui.pointerAt(tx, ty, false);
    if (workspace().root.axis !== 'horizontal' || dnd.currentDrag() !== null) throw new Error('Escape did not cancel drag');
    ui.pointerAt(x, y, true); ui.pointerAt(x - 10, y + 10, true); ui.pointerAt(tx, ty, true); ui.pointerAt(tx, ty, false);
  }
  if (frame === 10) {
    if (workspace().root.axis !== 'tabs' || workspace().root.tabs.length !== 2) throw new Error('drag did not dock in target group');
    console.log('chrome: ok');
  }
});
