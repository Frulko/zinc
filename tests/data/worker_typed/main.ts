// zinc:worker numeric arrays (tests/t0/worker_typed.sh): u32[], i32[], f32[] and f64[] cross as dense blocks, as a copy (the sender changing its
// array after the post is not seen), and an array named in `transfer` is emptied on the sender, whatever its element type.
import { Worker, MessageEvent } from 'zinc:worker';
import { Job } from './types';

const w = new Worker<Job, Job>(new URL('./w.ts', import.meta.url));
const job: Job = { u: [0, 1, 4294967294], i: [-5, 0, 2147483647], f: [0.5, -1.25, 3], d: [8, -2, 0.5] };
let left = 3;
w.onmessage = (e: MessageEvent<Job>) => {
  const r = e.data;
  console.log('back u=' + r.u.length + ':' + r.u.slice(0, 3).join(',') + ' i=' + r.i.join(',') + ' f=' + r.f.join(',') + ' d=' + r.d.join(','));
  left--;
  if (left === 0) w.terminate();
};
const big: u32[] = Array.from({ length: 100000 }, (_, k): u32 => k * 7);
w.postMessage(job, [job.u]);
console.log('sender u=' + job.u.length + ' i=' + job.i.length);
const fj: Job = { u: [], i: [], f: job.f, d: [] };
w.postMessage(fj, [job.f]);
console.log('sender f=' + job.f.length);
const bigJob: Job = { u: big, i: [], f: [], d: [] };
w.postMessage(bigJob);
big[0] = 99;
