// The bots a host adds while few people play: each turns towards the nearest player it sees, closes in, and shoots when its aim is
// near enough (a little late and a little off, so they can be beaten); with nobody in sight it wanders and turns at the walls.
import { World, Player } from './world';
import { MOVE_SPEED, TURN_SPEED } from './constants';

export const BOT_NAMES: string[] = ['Blob', 'Splash', 'Drip', 'Smudge', 'Dot'];

function wrap(a: number): number {
  let r = a;
  while (r > Math.PI) r -= Math.PI * 2;
  while (r < -Math.PI) r += Math.PI * 2;
  return r;
}

export class BotMind { turnFor = 0; turnDir = 1.0; }

export function thinkBot(world: World, p: Player, mind: BotMind, dt: number): void {
  if (p.dead || world.pause > 0) return;
  let target: Player | null = null;
  let best = 1e9;
  for (const o of world.players) {
    if (o === p || o.dead) continue;
    const dx = o.x - p.x, dy = o.y - p.y, d = dx * dx + dy * dy;
    if (d < best && world.sees(p.x, p.y, o.x, o.y)) { best = d; target = o; }
  }
  const speed = MOVE_SPEED * 0.75 * dt;
  if (target !== null) {
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    const diff = wrap(want - p.angle);
    const turn = TURN_SPEED * 0.7 * dt;
    p.angle += Math.max(-turn, Math.min(turn, diff));
    if (best > 6) world.slide(p, Math.cos(p.angle) * speed, Math.sin(p.angle) * speed);
    else world.slide(p, -Math.sin(p.angle) * speed * mind.turnDir, Math.cos(p.angle) * speed * mind.turnDir);   // circle-strafe close up
    if (Math.abs(diff) < 0.14 && world.random() < 0.06) world.fire(p);
    if (world.random() < 0.01) mind.turnDir = -mind.turnDir;
    return;
  }
  if (mind.turnFor > 0) {
    mind.turnFor -= dt;
    p.angle += TURN_SPEED * 0.6 * dt * mind.turnDir;
    return;
  }
  const nx = Math.cos(p.angle) * speed, ny = Math.sin(p.angle) * speed;
  if (world.blocked(p.x + nx * 8, p.y + ny * 8) || world.random() < 0.004) {
    mind.turnFor = 0.3 + world.random() * 0.6;
    mind.turnDir = world.random() < 0.5 ? -1.0 : 1.0;
  }
  world.slide(p, nx, ny);
}
