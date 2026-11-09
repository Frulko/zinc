import * as ui from 'zinc:ui';
import { render, createSignal } from 'zinc:ui/solid';
import { Metric, useQuietTheme } from 'zinc:ui/kit';
useQuietTheme();
const [history, setHistory] = createSignal<number[]>([2, 4, 3]);
let reads = 0, draws = 0, settled = 0, frame = 0;
function expect(value: boolean, message: string): void { if (!value) throw new Error(message); }
function canvas(h: i32): i32 {
  const n = ui.inspectNode(h); if (n === null) return -1;
  if (n.tag === ui.CANVAS) return h;
  for (const child of n.children) { const found = canvas(child); if (found >= 0) return found; }
  return -1;
}
function App(): i32 { return <Metric label="History" value={() => '3'} history={() => { reads++; return history(); }} className="w-[240px]" />; }
render(App, 0xf2f2f2, (dt: number) => {
  frame++;
  if (frame === 2) {
    const h = canvas(ui.rootNode()), node = ui.inspectNode(h);
    if (node === null || node.onDraw === null) throw new Error('metric canvas missing');
    expect(node.lazy, 'metric canvas forces idle frames');
    const draw = node.onDraw;
    ui.draw(h, (x: i32, y: i32, w: i32, height: i32) => { draws++; draw(x, y, w, height); });
    expect(reads === 1, 'metric history must be cached before drawing');
    setHistory([5, 2, 8]);
  }
  if (frame === 3) { expect(reads === 2 && draws > 0, 'metric history update did not repaint'); settled = draws; }
  if (frame === 6) { expect(draws === settled && reads === 2, 'settled metric repeated work'); console.log('data metric: ok'); }
});
