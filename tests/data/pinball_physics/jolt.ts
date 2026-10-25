import { args } from 'zinc:sys';
import { loadTable } from '../../../examples/pinball-kit/format/table';
import { openTable } from '../../../examples/pinball-kit/format/source';
import { JoltPhysics, Part } from '../../../examples/pinball-kit/physics3d';

function check(ok: boolean, message: string): void { if (!ok) throw new Error(message); }
const folder = args()[0];
// Use a clear board to measure physics independently of any table's score rules or art.
for (const rate of [240, 960]) {
  const table = loadTable(openTable(folder)), t = table.def;
  t.physics.rate = rate;
  t.walls = []; t.ramps = []; t.floors = []; t.models = [];
  t.bumpers = []; t.slingshots = []; t.targets = []; t.gates = []; t.flippers = [];
  const ph = new JoltPhysics(table, 2);
  ph.putBall(0, 20, 40, t.physics.ball.radius, 0, 0, 0);
  for (let i = 0; i < rate; i++) ph.step();
  const b = ph.balls[0];
  check(b.vy > 65 && b.vy < 90 && Math.abs(b.vz) < 2, 'smooth rolling gravity');
  ph.putBall(0, 20, 50, t.physics.ball.radius, 650, 0, 0);
  ph.putBall(1, 30, 50, t.physics.ball.radius, -650, 0, 0);
  for (let i = 0; i < Math.round(rate * 0.0125); i++) ph.step();
  check(ph.balls[0].vx < 0 && ph.balls[1].vx > 0, 'fast 3D multiball');
  ph.removeBall(1);
  ph.putBall(0, 5, 50, t.physics.ball.radius, -650, 0, 0);
  for (let i = 0; i < Math.round(rate * 0.05); i++) ph.step();
  check(ph.balls[0].x > 0 && ph.balls[0].vx > 0, 'fast 3D cabinet collision');
  ph.destroy();
}

// Flipper shots remain useful at the format's lowest rate as well as its default.
let slow = 0, fast = 0;
for (const rate of [240, 960]) {
  const table = loadTable(openTable(folder));
  table.def.physics.rate = rate;
  const ph = new JoltPhysics(table, 1);
  ph.putBall(0, 6.4, 74, 1.37, 0, 20, 0);
  let peak = 0, flips = 0;
  for (let i = 0; i < rate * 1.4; i++) {
    ph.pressFlipper(0, i >= Math.round(rate * 0.9));
    ph.step();
    for (const touch of ph.touches) {
      check(touch.speed > 0, 'only approaching contacts are impacts');
      if (touch.part === Part.Flipper) flips++;
    }
    peak = Math.max(peak, ph.balls[0].speed());
  }
  check(flips > 0 && peak > 250 && peak <= table.def.physics.maxSpeed + 1, 'flipper contact and power');
  if (rate === 240) slow = peak; else fast = peak;
  ph.destroy();
}
check(Math.abs(slow - fast) / fast < 0.2, 'flipper power across rates');
console.log('pinball Jolt: rolling, multiball, cabinet, contacts, flipper rates passed');
