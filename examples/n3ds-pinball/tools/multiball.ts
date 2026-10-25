// Runs the real two-screen application with three balls, without requiring a player to unlock multiball.
import { stereoDepth } from 'zinc:hardware';
import { clock } from 'zinc:sys';
import { game } from '../src/main';
import { MAX_SPEED } from '../../pinball-kit/physics/world';

game.startGame(1);
game.autopilot = true;
game.player.extraBalls = 99;
game.startMultiball();
game.ballSave = 120;
for (let i: i32 = 0; i < 3; i++) {
  const b = game.world.balls[i];
  game.world.place(b, 7 + i * 3, 12 + i * 5);
  b.vx = i === 1 ? -35 : 35;
  b.vy = -55;
}
console.log(`pinball probe: ${game.world.activeBalls()} balls served`);

let wallAnchor: number = -1, gameAnchor: number = 0;
setInterval(() => {
  const now = clock();
  // Ignore the initial board bake; thereafter gameplay must track elapsed time in flat and stereo mode.
  if (wallAnchor >= 0 && Math.abs((game.time - gameAnchor) - (now - wallAnchor) / 1000) > 0.25) throw new Error('game clock drifts from elapsed time');
  wallAnchor = now; gameAnchor = game.time;
  for (const b of game.world.balls) {
    if (!b.active) continue;
    if (!(b.x >= 0 && b.x <= 21 && b.y >= 0 && b.y <= 42)) throw new Error('ball outside the cabinet or non-finite');
    if (!(b.vx * b.vx + b.vy * b.vy <= MAX_SPEED * MAX_SPEED + 1)) throw new Error('ball speed limit exceeded');
  }
  console.log(`pinball probe: ${game.time.toFixed(1)} s, ${game.world.activeBalls()} balls, stereo ${stereoDepth().toFixed(1)}, score ${game.player.score}`);
}, 5000);
