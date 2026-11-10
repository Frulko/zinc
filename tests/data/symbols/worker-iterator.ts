import { Worker } from 'zinc:worker';
const iterator = [1, 2][Symbol.iterator]();
new Worker<typeof iterator, number>('unused-worker.ts');
