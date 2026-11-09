import * as ui from 'zinc:ui';
import { render, useState, MutableRef } from 'zinc:ui/react';
import { Slider, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const root = new MutableRef<i32>(-1);
let current: number = 20, frame = 0;
let x: number = 0, y: number = 0, width: number = 0;
function App(): i32 {
  const [value, setValue] = useState(20);
  current = value;
  return <View ref={root} className="w-[400px] p-4"><Slider accessibilityLabel="React volume" value={() => value} onChange={setValue} /></View>;
}
function find(h: i32): i32 {
  const node = ui.inspectNode(h);
  if (node === null) return -1;
  if (node.label === 'React volume') return h;
  for (const child of node.children) { const result = find(child); if (result >= 0) return result; }
  return -1;
}
function rail(): i32 {
  let h = find(root.current);
  while (h >= 0) {
    const node = ui.inspectNode(h);
    if (node === null) break;
    const handlers = node.hs;
    if (handlers !== null && handlers.down !== null) return h;
    h = node.parent;
  }
  throw new Error('missing React slider');
}
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    const box = ui.screenBox(rail());
    x = box[0]; width = box[2]; y = box[1] + box[3] / 2;
    ui.pointerAt(x + width * 0.25, y, true);
    ui.pointerAt(x + width * 0.35, y, true);
  }
  if (frame === 3) {
    if (current < 30 || current > 40) throw new Error('first React drag change');
    ui.pointerAt(x + width * 0.65, y, true);
  }
  if (frame === 4) {
    if (current < 60 || current > 70) throw new Error('React rerender reset active slider gesture');
    ui.pointerAt(x + width * 0.65, y, false);
    ui.pointerAt(x + width * 0.9, y, false);
  }
  if (frame === 5) {
    if (current < 60 || current > 70) throw new Error('slider hover changed released value');
    ui.keyDown(find(root.current), 'Home');
  }
  if (frame === 6) {
    if (current !== 0) throw new Error('React slider keyboard change');
    console.log('selection react: ok');
  }
});
