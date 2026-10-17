// The scene both the web page (main.tsx) and the native run (native.ts, tests/t1/web_physics2d.sh) play: a ball of radius 0.5 dropped from y = 5 with a bounce
// onto a static ground, 120 steps of 1/60 s. Returns "box2d version, ball x y angle vy, contacts, awake" with the numbers rounded to 1/1000.
import { World, Shape, Motion, version } from 'zinc:physics2d';

function r(v: number): number { return Math.round(v * 1000) / 1000; }

export function simulate(): string {
  const w = new World();
  w.body(Shape.box(10, 0.5), { motion: Motion.Static, position: [0, -0.5], events: true });
  const ball = w.body(Shape.circle(0.5), { position: [0.2, 5], restitution: 0.4, events: true });
  let began = 0;
  for (let i = 0; i < 120; i++) {
    w.step(1 / 60);
    for (const c of w.contacts) if (c.kind === 0) began++;
  }
  return `box2d ${version()}, ball ${r(ball.x)} ${r(ball.y)} ${r(ball.angle)} ${r(ball.vy)}, contacts ${began}`;
}
