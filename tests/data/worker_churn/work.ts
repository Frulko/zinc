import { self, MessageEvent } from 'zinc:worker';
self.onmessage = (e: MessageEvent<string>) => { self.postMessage(e.data + '!'); };
