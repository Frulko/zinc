// A worker that names a type of a module that draws: none of the module's code is in the worker (D181 refuses a worker that draws)
import { self, MessageEvent } from 'zinc:worker';
import type { Song } from './side';
self.onmessage = (e: MessageEvent<Song>) => { self.postMessage(e.data.title); };
