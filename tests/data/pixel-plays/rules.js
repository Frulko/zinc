import './seed.js';
import { G, startGame, update, makeBall, stepPhysics, atRest, endFrame, resetMatch } from '../../../examples/pixel-plays/src/game.js';
import { view } from '../../../examples/pixel-plays/src/view.js';
function assert(ok, message) {
  if (!ok) throw new Error(message);
}
function stepUntil(condition, message) {
  for (let i = 0; i < 6000 && !condition(); i++) update(1 / 60);
  assert(condition(), message);
}
startGame();
stepUntil(() => G.phase === 'aim' && G.team === 0, 'jack never settled');
for (let i = 0; i < 35; i++) view.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
view.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
stepUntil(() => G.balls.length === 1, 'keyboard did not launch');
assert(G.left[0] === 3 && G.balls[0].vx < 0, 'launch did not consume a ball or move toward jack');
stepUntil(() => G.phase === 'aim' && G.team === 0 || G.phase === 'frame-end', 'bot never returned control');
assert(G.balls.some(ball => ball.team === 1), 'bot did not play');
// Play the remainder through the same keyboard release until scoring occurs.
for (let i = 0; i < 20000 && G.phase !== 'frame-end' && G.phase !== 'over'; i++) {
  if (G.phase === 'aim' && G.team === 0) {
    G.power = 0.7;
    view.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
  }
  update(1 / 60);
}
assert(G.phase === 'frame-end' || G.phase === 'over', 'round never completed');
assert(G.left[0] === 0 && G.left[1] === 0 && G.score[0] + G.score[1] > 0, 'invalid round score');
// An isolated collision exchanges momentum and resolves the overlap.
G.jack = null;
G.balls = [makeBall(0, 0, .3, 0, .3, 1), makeBall(.55, 0, .3, 1, .3, 1)];
G.balls[0].vx = 2;
stepPhysics(1 / 240);
assert(G.balls[1].vx > 1 && G.balls[0].vx < 1, 'collision lost momentum transfer');
G.balls = [makeBall(11.8, 0, .3, 0, .3, 1)];
G.balls[0].vx = 4;
stepPhysics(1 / 60);
assert(G.balls[0].vx < 0 && G.balls[0].x <= 11.7, 'court rebound failed');
for (let i = 0; i < 600; i++) stepPhysics(1 / 60);
assert(atRest(), 'friction never stops ball');
G.jack = makeBall(0, 0, .16, -1, .16, .25);
G.balls = [makeBall(.5,0,.3,0,.3,1), makeBall(1,0,.3,0,.3,1), makeBall(2,0,.3,1,.3,1)];
G.score = [3, 0];
endFrame();
assert(G.score[0] === 5 && G.phase === 'over', 'closest balls / first-to-five scoring failed');
resetMatch();
assert(G.score[0] === 0 && G.score[1] === 0 && G.balls.length === 0 && G.left[0] === 4, 'restart failed');
console.log('pixel-plays rules: keyboard, bot, full round, collision, rebound, rest, score and restart PASS');
