// A window whose scene runs in a worker (ZN-864): the worker computes the side window's Scene and posts it; the window draws the last one it
// got. The main window keeps drawing while the worker answers a 1.5 s request. tests/t1/multiwin.sh: a deterministic run captures both
// windows at frame 8; a run on the real clock counts the main window's frames during the busy request.
import * as win from 'zinc:system/window';
import { Worker, MessageEvent, Envelope, workerPort } from 'zinc:worker';
import { onFrame, frame, clear, rect, text, quit } from 'zinc:gfx';
import type { Cmd, Reply } from './types';

const port = workerPort<Cmd, Reply>(new Worker<Envelope<Cmd>, Envelope<Reply>>(new URL('./scene.worker.ts', import.meta.url)));
const side = win.open({ title: 'Worker scene', width: 200, height: 120 });
port.onmessage = (e: MessageEvent<Reply>) => { side.setScene(e.data.scene); console.log(`scene ${e.data.n}: ${e.data.scene.shapes.length} shapes`); };

let busySince: i32 = -1;
onFrame((dt: number) => {
  const f = frame();
  clear(0x102030);
  rect(10 + (f % 20) * 10, 20, 30, 30, 0x40c0f0);
  text(10, 70, 'main', 0xffffff, 2);
  if (f === 1 || f === 5) port.postMessage({ kind: 'draw', n: f, ms: 0 });
  if (f === 12) {
    busySince = f;
    port.request({ kind: 'busy', n: f, ms: 1500 }).then((r: Reply) => {
      const during = frame() - busySince;
      console.log(`busy reply '${r.text}': ${during > 30 ? 'the main window kept drawing' : 'only ' + during + ' main frames meanwhile'}`);
      quit();
    });
  }
});
