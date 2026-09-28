// breakout: a playable brick breaker on zinc:gfx, from a desktop window down to a PlayStation.
// Left / Right, A / D or the mouse move the paddle; Space / Enter or a click serves; Esc quits.
import { onFrame } from 'zinc:gfx';
import { Game } from './game/game';
import { readControls } from './input';
import { draw } from './render';

const game = new Game();

onFrame((dt: number) => {
  game.update(dt, readControls());
  draw(game);
});

console.log('breakout ready:', game.bricks.length, 'bricks');
