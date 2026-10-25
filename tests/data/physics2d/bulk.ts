// Compare the old three-call protocol with the packed protocol on identical Box2D worlds.
import { World, Shape, Motion } from 'zinc:physics2d';
import P from '../../../plugins/physics2d/native/physics2d.spec';
import { allocations } from 'zinc:sys';
function check(ok: boolean, text: string): void { if (!ok) throw new Error(text); }
const a = new World({ sleeping: false }), b = new World({ sleeping: false });
for (const w of [a,b]) {
  w.body(Shape.box(10, 0.5), { motion: Motion.Static, position: [0,-1], events: true });
  w.body(Shape.circle(0.5), { position: [0,5], restitution: 0.8, sleeping: false, events: true });
}
let legacyAlloc = 0, packedAlloc = 0, contactRecords = 0;
for (let frame = 0; frame < 1200; frame++) {
  let start = allocations();
  P.step(a.handle, 1 / 240, 1);
  const moved = P.moved(a.handle), events = P.events(a.handle);
  legacyAlloc += allocations() - start;
  start = allocations();
  const packed = P.stepState(b.handle, 1 / 240, 1);
  packedAlloc += allocations() - start;
  check(packed[0] === moved.length && packed.length === 1 + moved.length + events.length, 'packed lengths');
  for (let i = 0; i < moved.length; i++) if (i % 7 !== 0) check(moved[i] === packed[1+i], 'identical body state');
  for (let i = 0; i < events.length; i++) if (i % 9 !== 1 && i % 9 !== 2) check(events[i] === packed[1+moved.length+i], 'identical contact state');
  contactRecords += events.length / 9;
}
check(contactRecords > 0, 'contact records exercised');
check(packedAlloc < legacyAlloc, 'packed protocol reduces runtime allocations');
console.log(`physics2d bulk: identical state/events, allocations ${legacyAlloc} -> ${packedAlloc}`);
a.destroy(); b.destroy();
