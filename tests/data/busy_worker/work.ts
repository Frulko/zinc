// The 2 s computation of tests/data/busy_spinner, moved to a worker.
import { self } from 'zinc:worker';

self.onmessage = (e: MessageEvent<number>) => {
  const t0 = performance.now();
  let n = 0;
  while (performance.now() - t0 < e.data) n++;
  self.postMessage(n);
};
