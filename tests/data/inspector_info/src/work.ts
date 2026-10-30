import { self, MessageEvent } from 'zinc:worker';
import { Job, Done } from './types';

function crunch(n: i32): number {
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.sin(i) * Math.sin(i);
  return s;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const sum = crunch(e.data.n);
  const done: Done = { id: e.data.id, sum: sum };
  self.postMessage(done);
};
