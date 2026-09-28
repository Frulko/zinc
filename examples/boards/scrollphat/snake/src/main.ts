// snake: an auto-playing snake on the Scroll pHAT's 11x5 LEDs. The food blinks so it stands out from the body (the
// LEDs are all the same colour); when the snake is stuck it blinks, shows its length, and a new game starts.
// Space (Mac) restarts.
import { onFrame, clear, rect, width, height, wasPressed, Btn } from 'zinc:gfx';
import { drawText, textWidth, FONT_3X5 } from 'zinc:pixelfont';
import { Snake } from './snake';

const STEPS_PER_SECOND = 7;
const W = width(), H = height();
const game = new Snake(W, H);
let stepIn = 0, blink = 0, over = 0, best: i32 = 0;

onFrame((dt: number) => {
  blink += dt;
  if (wasPressed(Btn.A)) { game.reset(); over = 0; }
  if (game.alive) {
    stepIn -= dt;
    if (stepIn <= 0) {
      stepIn = 1 / STEPS_PER_SECOND;
      game.tick();
      if (!game.alive) {
        best = Math.max(best, game.body.length);
        console.log(`snake: length ${game.body.length} (best ${best})`);
      }
    }
  } else {
    over += dt;
    if (over > 3) { game.reset(); over = 0; }
  }

  clear(0x000000);
  if (!game.alive && over > 1) {  // the score, then a new game
    const s = `${game.body.length}`;
    drawText(Math.floor((W - textWidth(s, FONT_3X5) + 1) / 2), 0, s, 0xffffff, FONT_3X5, 0, W);
    return;
  }
  const bodyOn = game.alive || Math.floor(over * 6) % 2 === 0;  // a dead snake blinks
  if (bodyOn) for (const c of game.body) rect(c % W, Math.floor(c / W), 1, 1, 0xffffff);
  if (game.food >= 0 && Math.floor(blink * 4) % 2 === 0) rect(game.food % W, Math.floor(game.food / W), 1, 1, 0xffffff);
});
