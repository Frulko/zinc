import { Worker, MessageEvent, ErrorEvent } from 'zinc:worker';
import { UNUSED_LAYOUT_MARKER, Child, Base, Label, Packet, makePair, joinOwned, inlineNumber } from './types';
const pair = makePair(20), other = makePair(30);
if (joinOwned('left', 'right') !== 'leftright' || joinOwned('up', 'down') !== 'updown') throw new Error('shared string helper lost');
if (inlineNumber(20) !== 24 || inlineNumber(30) !== 34) throw new Error('numeric helper lost');
const base: Base = pair[0], label: Label = pair[1];
if (!(base instanceof Child) || base.value !== 20 || (base as Child).extra !== 7 || label.label() !== 'kept' || other[1].value !== 31) throw new Error('live layout or dispatch lost');
if (base.constructor.name !== 'Child') throw new Error('class reflection lost');
const viewed: any = base;
viewed.extra = 9;
if ((base as Child).extra !== 9) throw new Error('Dyn field layout lost');
const parsed: any = JSON.parse('{"count":42,"nested":{"flag":true}}');
if (parsed.count !== 42 || parsed.nested.flag !== true) throw new Error('runtime Dyn allocation lost');
try { throw new Error('caught'); } catch (e) { if (e.message !== 'caught') throw e; }
const worker = new Worker<Packet, Packet>(new URL('./worker.ts', import.meta.url));
worker.onerror = (e: ErrorEvent) => { worker.terminate(); throw new Error(e.message); };
worker.onmessage = (e: MessageEvent<Packet>) => {
  worker.terminate();
  if (e.data.count !== 42 || e.data.maybe !== 3.5 || e.data.nested.flag !== true || e.data.nested.name !== 'native') throw new Error('native record layout lost');
  console.log('layout reachability ok');
};
worker.postMessage({ count: 41, maybe: 3.5, nested: { flag: true, name: 'native' } });
