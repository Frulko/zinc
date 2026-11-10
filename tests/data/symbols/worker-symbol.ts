import { Worker } from 'zinc:worker';
new Worker<{ value: symbol }, number>('unused-worker.ts');
