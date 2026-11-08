// The worker side: a timer on the real clock, then a request to the main program, then a report.
import { parentPort } from 'zinc:worker';
import type { Ask, Answer } from './types';

const port = parentPort<Ask, Answer>();
const t0 = performance.now();
setTimeout(() => {
  const waited = performance.now() - t0;
  port.postMessage({ text: `worker timer: ${waited >= 45 ? 'waited 50 ms' : 'fired early, after ' + waited + ' ms'}`, n: 1 });
  port.request({ text: 'apples', n: 21 }).then((r: Answer) => {
    port.postMessage({ text: `worker asked, main replied '${r.text}' ${r.n}`, n: 0 });
  });
}, 50);
