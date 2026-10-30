import { Worker } from 'zinc:worker';
const file = './work.ts';
const w = new Worker<number, number>(file);
