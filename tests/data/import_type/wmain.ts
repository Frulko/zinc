import { Worker, MessageEvent } from 'zinc:worker';
import type { Song } from './side';
const w = new Worker<Song, string>('./wwork.ts');
w.onmessage = (e: MessageEvent<string>) => { console.log('worker got ' + e.data); w.terminate(); };
const s: Song = { title: 'Song', plays: 1 };
w.postMessage(s);
