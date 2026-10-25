// Exercise a real bumper hit, its powered kick and the game's visible/scoring feedback.
import { game } from '../src/main';
import { Controls } from '../../pinball/src/input';
import { BALL_R } from '../../pinball-kit/physics/bodies';

const controls = new Controls();
game.startGame(1);
const bumper = game.table.bumpers[0], ball = game.world.balls[0];
game.world.place(ball, bumper.x - bumper.r - BALL_R - 1, bumper.y);
ball.vx = 80;
for (let i = 0; i < 60 && game.bumperFlash[0] === 0; i++) game.update(1 / 240, controls);
if (game.bumperFlash[0] <= 0) throw new Error('bumper collision did not trigger flash/recoil');
if (game.player.score < 100) throw new Error('bumper collision did not score');
if (ball.vx > -(80 * bumper.mat.restitution + bumper.mat.kick * 0.75)) throw new Error(`bumper did not add its powered rebound: ${ball.vx},${ball.vy}`);
let sparks = 0;
for (const spark of game.fx.sparks) if (spark.age < 0.6) sparks++;
if (sparks === 0 || game.fx.shake <= 0) throw new Error('bumper collision did not trigger sparks/shake');
game.startGame(1);
const sling = game.table.slings[0];
game.world.place(ball, (sling.ax + sling.bx) / 2 + sling.nx * (BALL_R + sling.r + 0.8), (sling.ay + sling.by) / 2 + sling.ny * (BALL_R + sling.r + 0.8));
ball.vx = -sling.nx * 80; ball.vy = -sling.ny * 80;
for (let i = 0; i < 60 && game.slingFlash[0] === 0; i++) game.update(1 / 240, controls);
if (game.slingFlash[0] <= 0 || game.player.score < 50) throw new Error('slingshot did not flash or score');
if (ball.vx * sling.nx + ball.vy * sling.ny < 80 * sling.mat.restitution + sling.mat.kick * 0.75) throw new Error('slingshot did not add its powered rebound');

game.startGame(1);
const target = game.table.targets[0];
game.world.place(ball, target.ax + BALL_R + target.r + 1, (target.ay + target.by) / 2);
ball.vx = -80;
for (let i = 0; i < 60 && target.enabled; i++) game.update(1 / 240, controls);
if (target.enabled || game.player.score < 750) throw new Error('drop target did not fall or score');
console.log('pinball feedback: powered bumper/slingshot, target, score, flashes, sparks and shake passed');
