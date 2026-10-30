import { self, MessageEvent } from 'zinc:worker';
import { Job, Done } from './types';

self.onmessage = (e: MessageEvent<Job>) => {
  const job = e.data;
  if (job.fail) throw new Error('job ' + job.id + ' failed');
  let sum = 0;
  for (let i = 1; i <= job.n; i++) sum += i;
  for (const b of job.bytes) sum += b;
  const done: Done = { id: job.id, sum: sum, label: job.label.toUpperCase(), size: job.bytes.length, tags: ['a', 'b'], note: job.id === 2 ? 'second' : null };
  self.postMessage(done);
};
