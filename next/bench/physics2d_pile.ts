// The step time of zinc:physics2d (ZN-583.01): 2,000 bodies, boxes and circles, dropped into a pit where they pile up
// and never sleep, stepped at 60 Hz with 4 sub-steps. The time is that of world.step() as a program pays it: the native
// step, then the state of the 2,000 bodies read back into their fields. The same file runs on the interpreter, compiled
// (zinc build) and on QuickJS (zinc run --engine quickjs):   zinc run bench/physics2d_pile.ts [-- bodies]
import { World, Shape, Motion } from 'zinc:physics2d';
import { args } from 'zinc:sys';

const N: i32 = args().length > 0 ? parseInt(args()[0], 10) : 2000;
const WARM = 300, MEASURED = 600;

const w = new World({ sleeping: false });
// a pit 40 wide: a floor and two walls
w.body(Shape.box(21, 0.5), { motion: Motion.Static, position: [0, -0.5], friction: 0.6 });
w.body(Shape.box(0.5, 30), { motion: Motion.Static, position: [-20.5, 30] });
w.body(Shape.box(0.5, 30), { motion: Motion.Static, position: [20.5, 30] });
const box = Shape.box(0.25, 0.25), ball = Shape.circle(0.3);
let n = 0;
for (let y = 0; n < N; y++) {
  for (let x = 0; x < 50 && n < N; x++) {
    // a slanted grid, so that the columns topple into a heap instead of standing
    w.body(n % 2 === 0 ? box : ball, { position: [(x - 24.5) * 0.75 + (y % 3) * 0.13, 0.5 + y * 0.7], friction: 0.6, restitution: 0.1 });
    n++;
  }
}

for (let i = 0; i < WARM; i++) w.step(1 / 60);
let total = 0, worst = 0;
for (let i = 0; i < MEASURED; i++) {
  const t0 = performance.now();
  w.step(1 / 60);
  const t = performance.now() - t0;
  total += t;
  if (t > worst) worst = t;
}
console.log(`physics2d_pile: ${N} bodies, ${w.awakeCount()} awake, ${(total / MEASURED).toFixed(3)} ms per step (worst ${worst.toFixed(3)}), over ${MEASURED} steps after ${WARM}`);
w.destroy();
