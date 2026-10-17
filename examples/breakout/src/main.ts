// breakout: a playable brick breaker on zinc:gfx, from a desktop window down to a PlayStation, in Kenney's sprites (src/skin.ts) where the
// target bakes them, else in the original look (src/render.ts). Left / Right, A / D or the mouse move the paddle; Space / Enter or a click serves; Esc quits.
import { onFrame } from 'zinc:gfx';
import { Game } from './game/game';
import { readControls } from './input';
import { draw } from './render';
import { drawSkin, skinLoaded } from './skin';

const game = new Game();
const kenney = skinLoaded();

onFrame((dt: number) => {
  game.update(dt, readControls());
  if (kenney) drawSkin(game);
  else draw(game);
});

console.log('breakout ready:', game.bricks.length, 'bricks');
