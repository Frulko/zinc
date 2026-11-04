import { clamp } from '../renderer';

export const RUN_SECONDS = 45;
export const BOAT_Y = 4;
export const LOG_LENGTHS: number[] = [1.35, 2.05, 1.6, 2.3, .9, 1.75, 1.45];
export const LOG_RADII: number[] = [.23, .31, .25, .36, .40, .28, .32];
export interface RiverLog {
  active: boolean; variant: i32; model: i32; baseX: number; x: number; y: number;
  speed: number; seed: number; yaw: number; hit: boolean; passed: boolean;
}
export const river = {
  phase: 'ready', time: 0, elapsed: 0, x: 0, velocity: 0, target: 0,
  steering: false, left: false, right: false, lives: 3, avoided: 0,
  hits: 0, nextLog: 0, protectedUntil: 0, hitAt: -100, paddleAt: 0,
  seed: 72831 as u32, serial: 0, lastVariant: -1, season: 1 as i32,
};
export const logs: RiverLog[] = [];
for (let i = 0; i < 12; i++) logs.push({ active:false,variant:0,model:0,baseX:0,x:0,y:0,speed:0,seed:0,yaw:0,hit:false,passed:false });

function random(): number {
  river.seed = (Math.imul(river.seed as i32, 1664525) + 1013904223) as u32;
  return river.seed / 4294967296;
}
export function resetRiver(): void {
  river.phase = 'play'; river.elapsed = 0; river.x = 0; river.velocity = 0; river.target = 0;
  river.steering = false; river.left = false; river.right = false;
  river.lives = 3; river.avoided = 0; river.hits = 0; river.nextLog = .8;
  river.protectedUntil = 0; river.hitAt = -100; river.serial = 0; river.lastVariant = -1;
  river.seed = 72831;
  for (const log of logs) log.active = false;
}
export function steerRiver(x: number): void {
  if (!Number.isFinite(x)) return;
  river.steering = true;
  river.target = clamp(x, -4.8, 4.8);
}
export function spawnLog(): boolean {
  for (const log of logs) {
    if (log.active) continue;
    const variant = (river.lastVariant + 1 + Math.floor(random() * 6)) % 7;
    river.lastVariant = variant;
    const turn = random() < .5 ? 0 : 1;
    log.active = true; log.variant = variant as i32; log.model = (variant * 2 + turn) as i32;
    log.baseX = (random() - .5) * 8.2; log.x = log.baseX; log.y = -13;
    log.yaw = turn === 0 ? -.30 : .28;
    log.speed = 3.1 + river.elapsed / RUN_SECONDS * 1.8 + random() * .8;
    log.seed = river.serial++; log.hit = false; log.passed = false;
    return true;
  }
  return false;
}

function distanceToLog(px: number, py: number, log: RiverLog): number {
  const dx = Math.cos(log.yaw), dy = Math.sin(log.yaw);
  const along = clamp((px - log.x) * dx + (py - log.y) * dy, -LOG_LENGTHS[log.variant], LOG_LENGTHS[log.variant]);
  return Math.hypot(px - log.x - along * dx, py - log.y - along * dy);
}
export function logHitsBoat(log: RiverLog): boolean {
  const radius = LOG_RADII[log.variant] + .43;
  return distanceToLog(river.x, BOAT_Y - .75, log) < radius ||
         distanceToLog(river.x, BOAT_Y, log) < radius ||
         distanceToLog(river.x, BOAT_Y + .75, log) < radius;
}
export function advanceRiver(seconds: number): void {
  const dt = Math.max(0, Math.min(.04, seconds));
  river.time += dt;
  if (river.phase !== 'play') return;
  river.elapsed += dt;
  const keyboard = (river.right ? 1 : 0) - (river.left ? 1 : 0);
  const desired = keyboard !== 0 ? keyboard * 5.4 : river.steering ? clamp((river.target - river.x) * 6, -5.4, 5.4) : 0;
  river.velocity += (desired - river.velocity) * Math.min(1, dt * 8);
  river.x = clamp(river.x + river.velocity * dt, -4.8, 4.8);
  river.nextLog -= dt;
  if (river.nextLog <= 0) {
    spawnLog();
    river.nextLog = 1.65 - Math.min(.55, river.elapsed / RUN_SECONDS * .55);
  }
  for (const log of logs) {
    if (!log.active) continue;
    log.y += log.speed * dt;
    log.x = log.baseX + Math.sin(river.time * .7 + log.seed * 2) * .25;
    if (!log.hit && river.time >= river.protectedUntil && logHitsBoat(log)) {
      log.hit = true; river.lives--; river.hits++;
      river.hitAt = river.time; river.protectedUntil = river.time + 1.8;
      if (river.lives <= 0) { river.phase = 'over'; break; }
    }
    if (!log.passed && log.y > BOAT_Y + 2.7) {
      log.passed = true;
      if (!log.hit) river.avoided++;
    }
    if (log.y > 14) log.active = false;
  }
  if (river.elapsed >= RUN_SECONDS && river.lives > 0) river.phase = 'won';
}
