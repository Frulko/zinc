import { self, MessageEvent } from 'zinc:worker';

self.onmessage = (e: MessageEvent<number>) => { self.postMessage(e.data * 2); };
