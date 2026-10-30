// A worker that computes while the main program does too: zinc profile shows a track per thread and the messages as flows
// (tests/t0/worker_profile.sh); the inspector's Threads view and Performance tracks (tests/t1/inspector_threads.sh) and zinc debug --cdp on the
// worker (tests/t1/debug_worker.sh) use it too.
import { Worker, MessageEvent } from 'zinc:worker';
import { Job, Done } from './types';

function mainWork(n: i32): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.sqrt(i) * 0.5;
  return s;
}

const w = new Worker<Job, Done>(new URL('./work.ts', import.meta.url));
const jobs: i32 = 4;
let got = 0;
w.onmessage = (e: MessageEvent<Done>) => {
  got++;
  console.log('done ' + e.data.id + ' ' + (e.data.sum > 0));
  if (got === jobs) { w.terminate(); console.log('main ' + (mainWork(3000000) > 0)); }
};
for (let i = 1; i <= jobs; i++) w.postMessage({ id: i, n: 2000000 });
console.log('main ' + (mainWork(3000000) > 0));
