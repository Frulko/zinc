// Soak test: ten minutes of play by the attract-mode player at 60 fps, headless. Reports balls that sit still
// outside the plunger and the flipper cradles for 3 s (a stuck ball), then the score and the progress reached.
//   zinc run examples/pinball/tools/soak.ts
import { Game, PH_PLAY } from '../src/game/game';
import { Store } from '../src/game/store';
import { Controls } from '../src/input';

const g = new Game(new Store(false));
g.startGame(1);
g.autopilot = true;
g.player.extraBalls = 999;
g.autoLaunch();
const c = new Controls();
const slow: number[] = [0, 0, 0];
const dt = 1 / 60;
for (let frame = 0; frame < 60 * 600; frame++) {
  g.update(dt, c);
  for (const b of g.world.balls) {
    if (!b.active || b.held) { slow[b.id] = 0; continue; }
    const v = Math.hypot(b.vx, b.vy);
    const onPlunger = b.x > 19.1 && b.y > 38;
    const cradled = b.y > 34.5 && b.y < 38.5 && (b.x < 7.5 || b.x > 12.1);
    if (v < 2 && !onPlunger && !cradled) slow[b.id] += dt; else slow[b.id] = 0;
    if (slow[b.id] > 3 && slow[b.id] < 3 + dt * 1.5) console.log(`stuck? frame ${frame} ball ${b.id} at ${b.x.toFixed(2)},${b.y.toFixed(2)} layer ${b.layer}`);
    if (onPlunger && v < 1 && g.phase === PH_PLAY && frame % 600 === 0) console.log(`ball waiting on plunger at frame ${frame}`);
  }
}
const p = g.player;
console.log(`10 min: score ${p.score} rank ${p.rank} missions ${p.missionsDone} mission ${p.mission} progress ${p.progress} ball ${p.ball} extra ${p.extraBalls} holes ${p.holeSinks}`);
