import { Worker, MessageEvent, ErrorEvent } from 'zinc:worker';
const worker = new Worker<string, string>(new URL('./work.ts', import.meta.url));
worker.onmessage = (event: MessageEvent<string>) => { console.log(event.data); worker.terminate(); };
worker.onerror = (event: ErrorEvent) => { worker.terminate(); throw new Error(event.message); };
worker.postMessage('go');
