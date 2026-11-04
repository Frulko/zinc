import { startGame, tickGame } from './game.js';

startGame();
let last = performance.now();
function frame(now) {
  tickGame(Math.min(0.04, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
console.log('pixel-plays: Balote ready; drag/release or arrows/Space; P pause, M sound');
