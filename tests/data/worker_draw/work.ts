import { self } from 'zinc:worker';
import { clear } from 'zinc:gfx';
self.onmessage = (e: MessageEvent<number>) => { clear(0); };
