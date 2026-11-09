import * as ui from 'zinc:ui';
import { render, useState, MutableRef } from 'zinc:ui/react';
import { Popover, HoverCard, Tooltip, Button, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = new MutableRef<i32>(-1);
let update: (v: number) => void = (v: number) => {};
let frame: i32 = 0;
function App(): i32 {
  const [revision, setRevision] = useState(0);
  update = setRevision;
  return <View ref={root} className="flex-col p-4 gap-3">
    <Text>{revision}</Text>
    <Popover label="Filters"><Button label="Panel action" /></Popover>
    <HoverCard label="Owner" trigger={() => <Text>Ada</Text>}><Button label="Profile" /></HoverCard>
    <Tooltip label="Hint"><Button label="Hint target" /></Tooltip>
  </View>;
}
function find(h: i32, text: string): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.tag === ui.TEXT && n.text === text) {
    for (let p = n.parent; p >= 0; p = ui.parentOf(p)) { const parent = ui.inspectNode(p); if (parent !== null && parent.tag === ui.BUTTON) return p; }
    return h;
  }
  for (const child of n.children) { const result = find(child, text); if (result >= 0) return result; }
  return -1;
}
function visible(h: i32): boolean {
  if (h < 0) return false;
  for (let p = h; p >= 0; p = ui.parentOf(p)) { const n = ui.inspectNode(p); if (n === null || n.hidden) return false; }
  return true;
}
function hint(h: i32): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.role === 'tooltip') return h;
  for (const child of n.children) { const result = hint(child); if (result >= 0) return result; }
  return -1;
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) { ui.systemSignal('reducemotion 1'); ui.click(find(root.current, 'Filters')); update(1); }
  if (frame === 3) {
    if (!visible(find(root.current, 'Panel action'))) throw new Error('React rerender closed popover');
    ui.focused(); ui.keyDown(-1, 'Escape'); ui.click(find(root.current, 'Ada')); update(2);
  }
  if (frame === 4) {
    if (!visible(find(root.current, 'Profile'))) throw new Error('React rerender closed hover card');
    ui.domFocus(find(root.current, 'Profile'), true); ui.pointerAt(0, 0, false); ui.tick(300);
    if (!visible(find(root.current, 'Profile'))) throw new Error('focused hover card closed');
    ui.keyDown(-1, 'Escape'); ui.domFocus(find(root.current, 'Hint target'), true); update(3);
  }
  if (frame === 5) {
    if (!visible(hint(root.current))) throw new Error('React rerender reset focused tooltip');
    ui.keyDown(-1, 'Escape'); update(4);
  }
  if (frame === 6) {
    if (visible(hint(root.current))) throw new Error('React rerender reopened dismissed tooltip');
    ui.domFocus(-1, false);
    const box = ui.screenBox(find(root.current, 'Hint target'));
    ui.pointerAt(box[0] + 2, box[1] + 2, true); ui.tick(600);
    if (!visible(hint(root.current))) throw new Error('long press did not show hint');
    update(5);
  }
  if (frame === 7) {
    ui.tick(3001);
    if (visible(hint(root.current))) throw new Error('React rerender lost long-press expiry');
    ui.pointerAt(0, 0, false);
    const box = ui.screenBox(find(root.current, 'Ada'));
    ui.pointerAt(box[0] + 2, box[1] + 2, false); ui.tick(300); update(6);
  }
  if (frame === 8) {
    ui.tick(151);
    if (!visible(find(root.current, 'Profile'))) throw new Error('React rerender restarted hover dwell');
    ui.pointerAt(0, 0, false); ui.tick(50); update(7);
  }
  if (frame === 9) {
    ui.tick(151);
    if (visible(find(root.current, 'Profile'))) throw new Error('React rerender restarted hover grace');
    console.log('overlays react: ok');
  }
});
