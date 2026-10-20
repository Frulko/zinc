import { clear, onFrame } from 'zinc:gfx';
import { FruitScene } from '../../../examples/leapmotion/src/scene3d';
import { Game, Fruit } from '../../../examples/leapmotion/src/model';
const view = new FruitScene(), game = new Game();
game.running = true;
for (let i = 0; i < 5; i++) {
  game.fruits.push(new Fruit(150 + i * 150, 180, 0, 0, i, 44));
  const half = new Fruit(150 + i * 150, 370, 0, 0, i, 42);
  half.cut = true; half.split = 0.32; half.angle = 0.6; game.fruits.push(half);
}
onFrame((_dt: number) => { clear(0x101719); view.draw(game, 0); });
console.log('leapmotion fruit geometry ready');
