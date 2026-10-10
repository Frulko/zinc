// One shot on a table, without a window: the ball is put at a place with a velocity, the game runs for some seconds
// with no hand on the controls, and the events are printed with where the ball went. For tuning a table (does a shot
// at this speed make the ramp?) and for the tests of the game (tests/t1/pinball3d.sh).
//   zinc run examples/pinball3d/tools/probe.ts -- <table> <x> <y> <z> <vx> <vy> <vz> <seconds> [left@<s>] [right@<s>] [bump@<s>]
// The ball's place is its centre, in table coordinates (centimetres, y down the table, z up; cm/s). left@0.4 presses
// the left flipper button 0.4 s after the start and holds it for 0.2 s; bump@1 bumps the table from the left at 1 s,
// and again every 0.2 s until the end.
import { args, exit } from 'zinc:sys';
import { loadTable } from '../src/format/table';
import { openTable } from '../src/format/source';
import { Game, Controls } from '../src/game';

function main(): i32 {
  const a = args();
  if (a.length < 8) { console.log('usage: probe.ts -- <table> <x> <y> <z> <vx> <vy> <vz> <seconds>'); return 2; }
  const n: number[] = [];
  for (let i = 1; i < 8; i++) n.push(parseFloat(a[i]));
  const game = new Game(loadTable(openTable(a[0])));
  const hands = new Controls();
  game.placeBall(n[0], n[1], n[2], n[3], n[4], n[5]);
  const ball = game.physics.balls[0];
  let top = n[2], shown = 0, fastest = 0, leftAt = -1, rightAt = -1, bumpAt = -1;
  for (let i = 8; i < a.length; i++) {
    if (a[i].startsWith('left@')) leftAt = parseFloat(a[i].slice(5));
    else if (a[i].startsWith('right@')) rightAt = parseFloat(a[i].slice(6));
    else if (a[i].startsWith('bump@')) bumpAt = parseFloat(a[i].slice(5));
  }
  const steps: i32 = Math.round(n[6] / game.dt());
  for (let i = 0; i < steps; i++) {
    const now = i * game.dt();
    hands.left = leftAt >= 0 && now >= leftAt && now < leftAt + 0.2;
    hands.right = rightAt >= 0 && now >= rightAt && now < rightAt + 0.2;
    hands.nudgeLeft = bumpAt >= 0 && now >= bumpAt && (now - bumpAt) % 0.2 < 0.05;
    game.step(hands);
    if (ball.live && ball.z > top) top = ball.z;
    if (ball.live && now > 0.05 && ball.speed() > fastest) fastest = ball.speed();
    // the log of the game starts again with each game: print what is new
    for (; shown < game.rules.log.length; shown++) console.log(game.rules.log[shown]);
  }
  const r = (v: number): string => v.toFixed(1);
  console.log(`after ${n[6]} s: highest ${r(top)}, fastest ${r(fastest)}, ${ball.live ? `ball at ${r(ball.x)} ${r(ball.y)} ${r(ball.z)} going ${r(ball.vx)} ${r(ball.vy)} ${r(ball.vz)}` : 'no ball on the table'}, score ${game.rules.score}`);
  return 0;
}
exit(main());
