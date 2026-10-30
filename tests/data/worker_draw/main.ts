import { Worker } from 'zinc:worker';
const w = new Worker<number, number>('./work.ts');
w.postMessage(1);
