// QuickJS workload "physics" of docs/reports/quickjs-aot-jit-and-ffi.md: matter-js 0.20 (unmodified UMD build), 300 bodies piled in a box,
// Engine.update at 60 Hz. bench/qjs/fetch-matter first (matter-js is not vendored).
import Matter from './matter.mjs';
const steps = globalThis.ZN_FRAMES ?? 120;
const { Engine, Bodies, Composite } = Matter;
const engine = Engine.create();
const wall = (x, y, w, h) => Bodies.rectangle(x, y, w, h, { isStatic: true });
Composite.add(engine.world, [wall(400, 610, 810, 20), wall(-10, 300, 20, 620), wall(810, 300, 20, 620)]);
for (let k = 0; k < 300; k++) {
  const x = 100 + (k % 20) * 30, y = 50 - Math.floor(k / 20) * 30;
  Composite.add(engine.world, k % 2 ? Bodies.circle(x, y, 12) : Bodies.rectangle(x, y, 22, 22));
}
const t0 = performance.now();
for (let s = 0; s < steps; s++) Engine.update(engine, 1000 / 60);
const ms = (performance.now() - t0) / steps;
let sy = 0;
for (const b of Composite.allBodies(engine.world)) sy += b.position.y;
console.log('physics: ' + steps + ' steps, ' + ms.toFixed(3) + ' ms/step, sum y ' + sy.toFixed(3));
