// A worker asks the main program (ZN-1032): the worker's request is answered by an async handle on the main side, which replies after a timer;
// the worker's own timers run on the real clock. tests/t0/worker_request.sh runs it without ZINC_DETERMINISTIC.
import { Worker, MessageEvent, Envelope, workerPort } from 'zinc:worker';
import type { Ask, Answer } from './types';

const w = new Worker<Envelope<Answer>, Envelope<Ask>>(new URL('./ask.worker.ts', import.meta.url));
const port = workerPort<Answer, Ask>(w);
port.handle(async (a: Ask): Promise<Answer> => {
  await new Promise<void>((resolve: () => void) => { setTimeout(resolve, 20); });   // the reply waits for the Promise
  return { text: `main counts ${a.text}`, n: a.n * 2 };
});
port.onmessage = (e: MessageEvent<Ask>) => {
  console.log(e.data.text);
  if (e.data.n === 0) w.terminate();   // the worker said it is done
};
