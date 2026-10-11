// The step time of zinc:physics3d (ZN-583.02): 1,000 bodies, boxes and spheres, dropped into a pit where they pile up and
// never sleep, stepped at 60 Hz. The time is that of world.step() as a program pays it: the native step, then the state
// of the 1,000 bodies read back into their fields. The same file runs on the interpreter, compiled (zinc build) and on
// QuickJS (zinc run --engine quickjs):   zinc run bench/physics3d_pile.ts [-- bodies [threads]]   (threads: 0, the
// default, one per core of the machine; 1 the calling thread alone)
import { World, Shape, Body, Motion } from 'zinc:physics3d';
import { args } from 'zinc:sys';

const N: i32 = args().length > 0 ? parseInt(args()[0], 10) : 1000;
const THREADS: i32 = args().length > 1 ? parseInt(args()[1], 10) : 0;
const WARM = 300, MEASURED = 600;

const w = new World({ maxBodies: N + 16, maxBodyPairs: 65536, maxContacts: 65536, sleeping: false, threads: THREADS });
w.body(Shape.box(12, 0.5, 12), { motion: Motion.Static, position: [0, -0.5, 0], friction: 0.5 });
for (let i = 0; i < 4; i++) {
  const side = i < 2, at = i % 2 === 0 ? -6.5 : 6.5;
  w.body(side ? Shape.box(0.5, 6, 7) : Shape.box(7, 6, 0.5), { motion: Motion.Static, position: side ? [at, 6, 0] : [0, 6, at] });
}
const box = Shape.box(0.25, 0.25, 0.25), ball = Shape.sphere(0.3);
const pile: Body[] = [];
let n = 0;
for (let y = 0; n < N; y++) {
  for (let z = 0; z < 10 && n < N; z++) {
    for (let x = 0; x < 10 && n < N; x++) {
      // a slanted grid, so that the columns topple into a heap instead of standing
      pile.push(w.body(n % 2 === 0 ? box : ball, { position: [(x - 4.5) * 1.1 + (y % 3) * 0.13, 0.5 + y * 0.75, (z - 4.5) * 1.1 + (y % 2) * 0.17], friction: 0.5, restitution: 0.1 }));
      n++;
    }
  }
}
w.optimize();

for (let i = 0; i < WARM; i++) w.step(1 / 60);
let total = 0, worst = 0;
for (let i = 0; i < MEASURED; i++) {
  const t0 = performance.now();
  w.step(1 / 60);
  const t = performance.now() - t0;
  total += t;
  if (t > worst) worst = t;
}
// where the pile ended: the same for any number of threads and on every run (ZN-583, deterministic replay)
let hash = 0;
for (const b of pile) for (const v of [b.x, b.y, b.z, b.qx, b.qy, b.qz, b.qw]) hash = (hash * 31 + Math.round(v * 1e6)) % 1000000007;
console.log(`physics3d_pile: ${N} bodies, ${w.activeCount()} awake, threads ${THREADS}, ${(total / MEASURED).toFixed(3)} ms per step (worst ${worst.toFixed(3)}), over ${MEASURED} steps after ${WARM}; positions ${hash}`);
w.destroy();
