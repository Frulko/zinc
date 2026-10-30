// zinc:worker on every engine: messages both ways, a moved buffer, an error that the main loop outlives, terminate (tests/t0/worker_basic.sh).
import { Worker, MessageEvent, ErrorEvent } from 'zinc:worker';
import { Job, Done } from './types';

const w = new Worker<Job, Done>(new URL('./work.ts', import.meta.url));
let got = 0;
w.onmessage = (e: MessageEvent<Done>) => {
  const d = e.data;
  console.log('done ' + d.id + ' sum ' + d.sum + ' ' + d.label + ' size ' + d.size + ' tags ' + d.tags.join(',') + ' note ' + (d.note === null ? 'none' : d.note));
  got++;
  if (got === 2) w.postMessage({ id: 3, n: 1, label: 'x', bytes: [], fail: true });
};
w.onerror = (e: ErrorEvent) => {
  console.log('error: ' + e.message);
  w.terminate();
  console.log('terminated');
  setTimeout(() => { console.log('the main loop goes on'); }, 20);   // the worker's crash did not stop the program
};
const buf: u8[] = [1, 2, 3];
w.postMessage({ id: 1, n: 100, label: 'one', bytes: buf, fail: false }, [buf]);
console.log('moved ' + buf.length);
w.postMessage({ id: 2, n: 10, label: 'two', bytes: [], fail: false });
