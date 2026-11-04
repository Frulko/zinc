import { ok, equal } from 'zinc:assert';
import { g, startGame, walk, walkAuto, beginExit, takeExit, endingsFound } from '../../../examples/pixel-plays/src/native/straight/state';

// Leave the scene by `code` the way the game does: start, let the mist cover the picture, switch.
function leave(code: i32): void { beginExit(code); takeExit(code); g.glide = -1; g.phase = g.win || g.backToBeach ? 'auto' : 'play'; g.moving = false; }
function finish(): void { for (let i = 0; i < 4000 && g.end === -1; i++) walkAuto(.016); }
function takeShovel(): void { g.u = 3.4; g.v = -1.6; walk(.01, 1, 0); }

// 1. The shovel from the beach, then six exits to the right: the treasure.
startGame(); takeShovel();
ok(g.shovel, 'the shovel is picked up');
for (let i = 0; i < 6; i++) leave(1);
ok(g.win && g.tile.kind === 'treasure', 'six straight exits reach the island');
finish();
equal(g.end, 3, 'ending: the treasure');

// 2. The same walk without the shovel.
startGame();
for (let i = 0; i < 6; i++) leave(1);
finish();
equal(g.end, 2, 'ending: forgot the shovel');

// 3. A side exit loses the pirate for good unless he finds the beach again: the count restarts.
startGame(); takeShovel();
leave(1); leave(1); leave(3);
ok(g.lost || g.beach, 'a left exit gets him lost');
ok(g.straight === 0 || g.beach, 'the straight count restarts');
ok(!g.neverLost || g.beach, 'and the walk is no longer clean');

// 4. The secret path: up up down down left right left right.
startGame();
leave(1);
for (const code of [0, 0, 2, 2, 3, 1, 3, 1]) leave(code);
ok(g.win && g.cheated, 'the secret path opens the island');
finish();
equal(g.end, 0, 'ending: the cheater');
equal(endingsFound(), 3, 'three endings found so far, kept across games');

// 5. Walking: the track is open, the wall is not, a gap leads out.
startGame(); g.beach = false; leave(1);
g.tile.north = 1; g.tile.south = 1;
g.u = 0; g.v = 0; walk(.1, 0, -1);
ok(g.v < 0 && g.v > -1, 'the pirate walks on the track');
g.u = 0; g.v = -3.0; for (let i = 0; i < 10; i++) walk(.05, 0, -1);
ok(g.v > -3.2, 'a wall stops him outside the gap');
g.u = -3.5; g.v = -3.0; let out = -1; for (let i = 0; i < 80 && out < 0; i++) out = walk(.05, 0, -1);
equal(out, 0, 'the gap leads out of the scene');
console.log('straight-rules: PASS');
