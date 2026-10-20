// zinc:physics2d on every engine (tests/t1/physics2d.sh): bodies of each shape drop and bounce in a box made of a chain
// and a floor; two balls meet head on; a flipper on a revolute joint swings on its motor and a plunger on a prismatic
// joint springs back; a sensor, contact events and a ray report; then the same world is played again from the start.
// The output is integers (1/10000 of a unit), so it reads the same from the interpreter, a compiled program and QuickJS,
// and it must equal tests/data/physics2d/drop.out.
import { World, Shape, Body, Joint, Motion, Motor, ContactKind, version } from 'zinc:physics2d';

function r(v: number): number { return Math.round(v * 10000); }
function line(name: string, b: Body): string { return `${name} ${r(b.x)} ${r(b.y)} ${r(b.angle)} | ${r(b.vx)} ${r(b.vy)} ${r(b.w)}`; }

class Scene {
  world: World;
  names: string[] = [];
  bodies: Body[] = [];
  flipper: Body;
  plunger: Body;
  hinge: Joint;
  slide: Joint;
  added: number = 0;
  removed: number = 0;
  sensed: number = 0;
  left: number = 0;
  hardest: number = 0;

  constructor() {
    const w = new World();
    this.world = w;
    // a floor, and walls as one chain around the box (solid on the inside: the points go clockwise)
    w.body(Shape.box(10, 0.5), { motion: Motion.Static, position: [0, -0.5], friction: 0.6 });
    w.body(Shape.chain([-10, 0, -10, 12, 10, 12, 10, 0], true), { motion: Motion.Static, restitution: 0.3 });

    this.drop('circle', Shape.circle(0.5), [0, 4], 0.7);
    this.drop('box', Shape.box(0.4, 0.3), [1.5, 5], 0.3).setAngularVelocity(2);
    this.drop('capsule', Shape.capsule(-0.4, 0, 0.4, 0, 0.25), [-1.5, 6], 0.2);
    this.drop('triangle', Shape.polygon([0, 0.6, -0.5, -0.3, 0.5, -0.3]), [-0.4, 8], 0.4);
    this.drop('rounded', Shape.box(0.3, 0.3, 0, 0, 0, 0.1), [0.3, 9.5], 0.1);
    // two balls thrown at each other
    this.drop('left', Shape.circle(0.3), [-6, 1], 0.9).setVelocity(6, 0);
    this.drop('right', Shape.circle(0.3), [-2, 1.05], 0.9).setVelocity(-6, 0);

    // a flipper turning on a motor between its limits, a plunger springing back to its rest
    this.flipper = w.body(Shape.box(1, 0.1), { position: [6, 3], sleeping: false });
    this.hinge = w.revolute(this.flipper, null, [5, 3], { min: -0.5, max: 0.5 });
    this.hinge.motor(Motor.Velocity, 10, 500);
    this.plunger = w.body(Shape.box(0.2, 0.5), { position: [8, 2], sleeping: false, gravityScale: 0 });
    this.slide = w.prismatic(this.plunger, null, [8, 2], [0, 1], { min: -1, max: 0.2 });
    this.slide.motor(Motor.Position, 0, 0, 4, 0.3);
    this.plunger.setPosition(8, 1.2);

    // a sensor across the middle of the floor
    w.body(Shape.box(1, 0.25), { motion: Motion.Static, position: [0, 0.25], sensor: true });
  }

  drop(name: string, shape: Shape, at: number[], restitution: number): Body {
    const b = this.world.body(shape, { position: at, restitution, events: true, tag: this.bodies.length });
    this.names.push(name);
    this.bodies.push(b);
    return b;
  }

  step(n: number): void {
    for (let i = 0; i < n; i++) {
      if (i % 60 === 30) this.hinge.motor(Motor.Velocity, (i % 120) < 60 ? -10 : 10, 500);
      this.world.step(1 / 120);
      for (const c of this.world.contacts) {
        if (c.sensor) { if (c.kind === ContactKind.Added) this.sensed++; else this.left++; continue; }
        if (c.kind === ContactKind.Added) { this.added++; if (c.impulse > this.hardest) this.hardest = c.impulse; }
        else if (c.kind === ContactKind.Removed) this.removed++;
      }
    }
  }

  report(title: string): string {
    const out: string[] = [title];
    for (let i = 0; i < this.bodies.length; i++) out.push(line(this.names[i], this.bodies[i]));
    out.push(line('flipper', this.flipper));
    out.push(line('plunger', this.plunger));
    out.push(`hinge at ${r(this.hinge.value())} slide at ${r(this.slide.value())}`);
    out.push(`contacts added ${this.added} removed ${this.removed} sensed ${this.sensed} left ${this.left} hardest ${r(this.hardest)} awake ${this.world.awakeCount()}`);
    return out.join('\n');
  }
}

function play(): string {
  const s = new Scene();
  s.step(120);
  const mid = s.report('after 120 steps');
  s.step(480);
  const end = s.report('after 600 steps');
  const down = s.world.rayCast(1.5, 11, 0, -20);
  const across = s.world.rayCast(-9, 0.1, 18, 0, 1);   // layer 0 only
  const rays = `ray ${down === null ? 'nothing' : `${r(down.fraction)} at ${r(down.y)} normal ${r(down.ny)} tag ${down.body === null ? -1 : down.body.tag}`}; ` +
    `across ${across === null ? 'nothing' : `${r(across.fraction)} at ${r(across.x)} normal ${r(across.nx)}`}`;
  s.world.destroy();
  return `${mid}\n${end}\n${rays}`;
}

console.log(`box2d ${version()}`);
const first = play();
console.log(first);
console.log(`replay from the start: ${play() === first ? 'identical' : 'DIFFERENT'}`);

// bodies leave and enter the simulation, layers miss each other, a kinematic body carries a load
const w = new World();
w.body(Shape.box(10, 0.5), { motion: Motion.Static, position: [0, -0.5] });
const ball = w.body(Shape.circle(0.5), { position: [0, 0.5] });
const ghost = w.body(Shape.circle(0.5), { position: [3, 0.5], layer: 2, mask: 0xfffffffe });
const lift = w.body(Shape.box(1, 0.1), { motion: Motion.Kinematic, position: [-4, 0.1] });
const load = w.body(Shape.box(0.3, 0.3), { position: [-4, 0.5], sleeping: false });
ball.setEnabled(false);
for (let i = 0; i < 120; i++) { lift.moveTo(-4, 0.1 + (i + 1) / 120, 0, 1 / 120); w.step(1 / 120); }
console.log(`out of the world ${r(ball.y)}; through the floor ${ghost.y < -1 ? 'yes' : 'no'}; lifted ${r(lift.y)} ${load.y > 1.3 ? 'with its load' : 'alone'}`);
ball.setEnabled(true);
ball.applyImpulse(0, ball.mass() * 5);
console.log(`back in, pushed up at ${r(ball.vy)}, mass ${r(ball.mass())}`);
for (let i = 0; i < 60; i++) w.step(1 / 120);
console.log(`after half a second ${ball.y > 0.5 ? 'above' : 'on'} the floor`);
ghost.destroy();
w.destroy();
try { Shape.box(1, 0); new World().body(Shape.box(1, 0)); } catch (e) { console.log(`refused: ${(e as Error).message}`); }
