// The recommendation worker (zinc:worker, D181): services/recommend.ts on its own thread. drafts.ts starts it once and sends it the jobs.
import { self, MessageEvent } from 'zinc:worker';
import { RecJob, RecOut, handle } from './recommend';

self.onmessage = (e: MessageEvent<RecJob>) => { handle(e.data, (o: RecOut) => { self.postMessage(o); }); };
