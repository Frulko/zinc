// zinc:signals: typed signals / slots. Order of slots, disconnect during an emit, once, queued delivery, `using`
// scopes, a promise of the next value, and triggers without a value.
import { Signal, Trigger, Connection } from 'zinc:signals';

class Sensor {
  readonly reading = new Signal<number>();
  readonly done = new Trigger();
  measure(v: number): void { this.reading.emit(v); }
}

const s = new Sensor();
const log: string[] = [];
const a = s.reading.connect((v: number) => log.push(`a${v}`));
let b: Connection | null = null;
b = s.reading.connect((v: number) => { log.push(`b${v}`); if (v === 2) a.disconnect(); });   // disconnects a slot during an emit
s.reading.once((v: number) => log.push(`once${v}`));
s.measure(1);
s.measure(2);
s.measure(3);
console.log(log.join(' '), 'slots', s.reading.count, 'a connected', a.connected);

// a slot connected during an emit waits for the next emit
const late: number[] = [];
const adder = s.reading.connect((v: number) => { if (v === 4) s.reading.connect((w: number) => late.push(w)); });
s.measure(4);
s.measure(5);
console.log('late', late.join(','));
adder.disconnect();

// `using`: disconnected at the end of the block
{
  using scoped = s.reading.connect((v: number) => console.log('scoped', v));
  s.measure(6);
}
s.measure(7);
console.log('slots after scope', s.reading.count);

// triggers, queued delivery and the next value as a promise
let ticks = 0;
s.done.connect(() => { ticks++; });
s.done.emit();
s.reading.emitQueued(8);
console.log('queued not yet', ticks);
async function main(): Promise<void> {
  const v = await s.reading.next();
  console.log('next', v, 'ticks', ticks);
  s.reading.clear();
  console.log('cleared', s.reading.count);
}
main();
s.measure(9);
