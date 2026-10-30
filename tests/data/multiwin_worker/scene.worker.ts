// The side window's scene, computed on the worker's thread; 'busy' holds the thread 1.5 s before it replies.
import { parentPort, MessageEvent } from 'zinc:worker';
import type { Scene, Shape } from 'zinc:system/window';
import type { Cmd, Reply } from './types';

function shape(kind: string, x: number, y: number, w: number, h: number, r: number, color: u32, t: string): Shape {
  return { kind: kind, x: x, y: y, w: w, h: h, r: r, color: color, text: t };
}
function scene(n: i32): Scene {
  const shapes: Shape[] = [shape('rrect', 10, 10, 180, 60, 12, 0x3a5a7a, '')];
  for (let i: i32 = 0; i < n; i++) shapes.push(shape('rect', 20 + i * 22, 25, 16, 16, 0, 0xffcc00, ''));
  shapes.push(shape('line', 10, 90, 180, 0, 0, 0xe06040, ''));
  shapes.push(shape('text', 10, 98, 0, 0, 1, 0xffffff, `worker scene ${n}`));
  return { background: 0x402820, shapes: shapes };
}

const port = parentPort<Reply, Cmd>();
port.onmessage = (e: MessageEvent<Cmd>) => { if (e.data.kind === 'draw') port.postMessage({ n: e.data.n, text: 'drawn', scene: scene(e.data.n) }); };
port.handle((c: Cmd): Reply => {
  const t0 = performance.now();
  let spins = 0;
  while (performance.now() - t0 < c.ms) spins++;
  return { n: c.n, text: spins > 0 ? 'done' : 'idle', scene: scene(1) };
});
