// zinc:physics3d on every engine (tests/t1/physics3d.sh): bodies of each shape drop and bounce on a floor, a mesh and a
// height field; a hinge and a slider run their motors; a sensor, a ray and a swept sphere report; then the same world is
// played twice from the start and once from a saved state. The output is integers (1/10000 of a unit), so it reads the
// same from the interpreter, a compiled program and QuickJS, and it must equal tests/data/physics3d/drop.out.
import { World, Shape, Body, Constraint, Motion, Motor, ContactKind, version } from 'zinc:physics3d';

function r(v: number): number { return Math.round(v * 10000); }
function line(name: string, b: Body): string { return `${name} ${r(b.x)} ${r(b.y)} ${r(b.z)} | ${r(b.qx)} ${r(b.qy)} ${r(b.qz)} ${r(b.qw)} | ${r(b.vx)} ${r(b.vy)} ${r(b.vz)}`; }

class Scene {
  world: World;
  names: string[] = [];
  bodies: Body[] = [];
  flap: Body;
  piston: Body;
  hinge: Constraint;
  slider: Constraint;
  added: number = 0;
  removed: number = 0;
  sensed: number = 0;
  hardest: number = 0;
  log: string[] = [];

  constructor() {
    const w = new World({ gravity: [0, -9.81, 0] });
    this.world = w;
    w.body(Shape.box(20, 0.5, 20), { motion: Motion.Static, position: [0, -0.5, 0], friction: 0.6 });
    // a ramp of two triangles, and a bumpy field
    w.body(Shape.mesh([-8, 0, -2, -4, 0, -2, -4, 2, 2, -8, 2, 2], [0, 2, 1, 0, 3, 2]), { motion: Motion.Static });
    const heights: number[] = [];
    for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) heights.push(0.3 * Math.sin(i * 0.9) * Math.cos(j * 0.7) + 0.3);
    w.body(Shape.heightField(heights, 8, [4, 0, -3], [1, 1, 1]), { motion: Motion.Static });

    this.drop('sphere', Shape.sphere(0.5), [0, 4, 0], 0.7);
    this.drop('box', Shape.box(0.4, 0.3, 0.5), [1.5, 5, 0.2], 0.3);
    this.drop('capsule', Shape.capsule(0.4, 0.25), [-1.5, 6, -0.3], 0.2);
    this.drop('cylinder', Shape.cylinder(0.3, 0.4), [0.2, 7, 1.5], 0.1);
    this.drop('hull', Shape.convexHull([0, 0.6, 0, -0.5, -0.3, -0.5, 0.5, -0.3, -0.5, 0.5, -0.3, 0.5, -0.5, -0.3, 0.5]), [-0.4, 8, -1.4], 0.4);
    this.drop('onramp', Shape.sphere(0.3), [-6, 4, 0.5], 0.2);
    this.drop('onfield', Shape.sphere(0.3), [7.4, 3, 0.6], 0.5);
    // two spheres thrown at each other
    this.drop('left', Shape.sphere(0.3), [-3, 1, 6], 0.9).setVelocity(6, 0, 0);
    this.drop('right', Shape.sphere(0.3), [3, 1, 6], 0.9).setVelocity(-6, 0, 0);

    // a flap on a hinge driven to a speed, a piston on a slider driven to a position
    this.flap = w.body(Shape.box(1, 0.1, 0.3), { position: [0, 2, -8], sleeping: false });
    this.hinge = w.hinge(this.flap, null, [-1, 2, -8], [0, 0, 1], { min: -1, max: 1 });
    this.hinge.motor(Motor.Velocity, 2, 20000);
    this.piston = w.body(Shape.box(0.3, 0.3, 0.3), { position: [4, 2, -8], sleeping: false, gravityFactor: 0 });
    this.slider = w.slider(this.piston, null, [4, 2, -8], [1, 0, 0], { min: -2, max: 2 });
    this.slider.motor(Motor.Position, 1.5, 0, 4, 1);

    // a sensor box above the floor in the middle
    w.body(Shape.box(1, 0.5, 1), { motion: Motion.Static, position: [0, 0.5, 0], sensor: true, events: true });
    w.optimize();
  }

  drop(name: string, shape: Shape, at: number[], restitution: number): Body {
    const b = this.world.body(shape, { position: at, restitution, events: true, tag: this.bodies.length });
    this.names.push(name);
    this.bodies.push(b);
    return b;
  }

  step(n: number): void {
    for (let i = 0; i < n; i++) {
      this.world.step(1 / 120);
      for (const c of this.world.contacts) {
        if (c.sensor) { if (c.kind === ContactKind.Added) this.sensed++; continue; }
        if (c.kind === ContactKind.Added) { this.added++; if (c.impulse > this.hardest) this.hardest = c.impulse; }
        else if (c.kind === ContactKind.Removed) this.removed++;
      }
    }
  }

  report(title: string): string {
    const out: string[] = [title];
    for (let i = 0; i < this.bodies.length; i++) out.push(line(this.names[i], this.bodies[i]));
    out.push(line('flap', this.flap));
    out.push(line('piston', this.piston));
    out.push(`hinge at ${r(this.hinge.value())} slider at ${r(this.slider.value())}`);
    out.push(`contacts added ${this.added} removed ${this.removed} sensed ${this.sensed} hardest ${Math.round(this.hardest)} awake ${this.world.activeCount()}`);
    return out.join('\n');
  }
}

function play(): string {
  const s = new Scene();
  s.step(120);
  const mid = s.report('after 120 steps');
  s.step(480);
  const end = s.report('after 600 steps');
  const down = s.world.rayCast(1.5, 10, 0.2, 0, -20, 0);
  const sweep = s.world.shapeCast(Shape.sphere(0.2), [-10, 0.4, 6], [0, 0, 0, 1], 20, 0, 0);
  const rays = `ray ${down === null ? 'nothing' : `${r(down.fraction)} at ${r(down.y)} normal ${r(down.ny)}`}; sweep ${sweep === null ? 'nothing' : `${r(sweep.fraction)} at ${r(sweep.x)} normal ${r(sweep.nx)}`}`;
  s.world.destroy();
  return `${mid}\n${end}\n${rays}`;
}

console.log(`jolt ${version()}`);
const first = play();
console.log(first);
console.log(`replay from the start: ${play() === first ? 'identical' : 'DIFFERENT'}`);

// a saved state, played on, restored and played on again
const s = new Scene();
s.step(300);
const state = s.world.saveState();
s.step(300);
const once = s.report('x');
s.world.restoreState(state);
s.added = 0; s.removed = 0; s.sensed = 0; s.hardest = 0;
const at300 = line('sphere', s.bodies[0]);
s.step(300);
const twice = s.report('x');
// the counters restart at the restore, so only the bodies are compared
const bodiesOf = (t: string): string => t.slice(0, t.lastIndexOf('\n'));
console.log(`state of ${state.length > 1000 ? 'more than 1000' : 'too few'} bytes; ${at300}`);
console.log(`replay from the saved state: ${bodiesOf(once) === bodiesOf(twice) ? 'identical' : 'DIFFERENT'}`);

// bodies leave and enter the world, layers stop colliding, a kinematic body carries a load
const w = new World();
w.body(Shape.box(10, 0.5, 10), { motion: Motion.Static, position: [0, -0.5, 0] });
const ball = w.body(Shape.sphere(0.5), { position: [0, 0.5, 0], layer: 1 });
const ghost = w.body(Shape.sphere(0.5), { position: [3, 0.5, 0], layer: 2 });
w.setLayersCollide(2, 0, false);
const lift = w.body(Shape.box(1, 0.1, 1), { motion: Motion.Kinematic, position: [-4, 0.1, 0] });
const load = w.body(Shape.box(0.3, 0.3, 0.3), { position: [-4, 0.5, 0], sleeping: false });
ball.setEnabled(false);
for (let i = 0; i < 120; i++) { lift.moveTo(-4, 0.1 + (i + 1) / 120, 0, 0, 0, 0, 1, 1 / 120); w.step(1 / 120); }
console.log(`out of the world ${r(ball.y)}; through the floor ${ghost.y < -1 ? 'yes' : 'no'}; lifted ${r(lift.y)} ${load.y > 1.3 ? 'with its load' : 'alone'}`);
ball.setEnabled(true);
ball.applyImpulse(0, ball.mass() * 5, 0);
console.log(`back in, pushed up at ${r(ball.vy)}`);
for (let i = 0; i < 60; i++) w.step(1 / 120);
console.log(`after half a second ${ball.y > 0.5 ? 'above' : 'on'} the floor`);
ghost.destroy();
w.destroy();
try { Shape.box(1, 0, 1); } catch (e) { console.log(`refused: ${(e as Error).message}`); }
