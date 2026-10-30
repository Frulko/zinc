import { Worker } from 'zinc:worker';
interface Msg { n: number; seen: Map<string, i32> }
const w = new Worker<Msg, number>('./work.ts');
