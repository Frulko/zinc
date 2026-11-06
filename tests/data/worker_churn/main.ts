// Workers started and terminated one after the other, 20 messages each; then the program waits so tests/t1/worker_churn.sh counts its open files.
import { Worker, MessageEvent } from 'zinc:worker';

const ROUNDS = 200;
let round = 0;
function next(): void {
  if (round === ROUNDS) {
    console.log('done ' + round);
    setTimeout(() => {}, 10000);
    return;
  }
  round++;
  const w = new Worker<string, string>(new URL('./work.ts', import.meta.url));
  let got = 0;
  w.onmessage = (e: MessageEvent<string>) => {
    got++;
    if (got < 20) { w.postMessage(e.data); return; }
    w.terminate();
    setTimeout(next, 0);
  };
  w.postMessage('m');
}
next();
