import './seed.js';
import { G, startGame, tickGame } from '../../../examples/pixel-plays/src/game.js';
startGame();
let frame = 0;
let pausedTime = 0;
function assert(ok, message) {
  if (!ok) throw new Error('frame ' + frame + ': ' + message);
}
function run() {
  tickGame(1 / 60);
  if (frame === 140) assert(G.phase === 'aim' && G.team === 0, 'jack not ready');
  if (frame === 153) assert(G.power > .3 && G.pointer !== null, 'mouse drag did not set power');
  if (frame === 180) {
    assert(G.balls.some(ball => ball.team === 0) && G.left[0] === 3, 'mouse release did not launch');
    console.log('pixel-plays input: mouse launch PASS');
  }
  if (frame === 186) pausedTime = G.time;
  if (frame === 490) {
    assert(G.time === pausedTime, 'pause advanced simulation');
    console.log('pixel-plays input: 300 paused frames PASS');
  }
  if (frame === 510) assert(G.time > pausedTime, 'resume did not advance');
  if (frame === 550) {
    // A new turn fixture isolates keyboard input from the bot timing.
    G.phase = 'aim'; G.team = 0; G.power = 0; G.balls = []; G.left = [4,4];
  }
  if (frame === 580) {
    assert(G.balls.length === 1 && G.left[0] === 3, 'host keyboard did not launch');
    console.log('pixel-plays input: keyboard launch PASS');
    G.phase = 'aim'; G.team = 0; G.power = 0; G.balls = []; G.left = [4,4];
  }
  if (frame === 593) assert(G.pointer !== null && G.power > .3, 'touch did not drag');
  if (frame === 620) {
    assert(G.balls.length === 1 && G.left[0] === 3, 'touch release did not launch');
    console.log('pixel-plays input: touch launch PASS');
  }
  frame++;
  requestAnimationFrame(run);
}
requestAnimationFrame(run);
