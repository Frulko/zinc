// A small solar system with PixiJS: sprites in a tree of containers, a blur filter for the glow of the sun, and planets that hear the pointer.
// Run it:  zinc run examples/js-pixi --engine quickjs      (point at a planet: it grows; click it: it stops, click again: it goes on)
import { Application, BlurFilter, Container, Graphics, Sprite } from 'pixi.js';

const app = new Application();
await app.init({ resizeTo: window, background: 0x0b1026, antialias: true, preference: 'webgl' });
document.body.appendChild(app.canvas);

// One white disc, drawn once into a texture: every star, planet and moon is a sprite of it, with its own size and tint.
const disc = app.renderer.generateTexture(new Graphics().circle(0, 0, 32).fill(0xffffff));
function ball(radius, tint) {
  const sprite = new Sprite(disc);
  sprite.anchor.set(0.5);
  sprite.scale.set(radius / 32);
  sprite.tint = tint;
  return sprite;
}

const sky = new Container(), system = new Container();
app.stage.addChild(sky, system);
for (let i = 0; i < 300; i++) {   // the stars, spread evenly around the centre (the golden angle): the same sky at every run
  const star = ball(0.6 + i % 3 * 0.4, 0xffffff), far = 600 * Math.sqrt(i / 300);
  star.position.set(far * Math.cos(i * 2.39996), far * Math.sin(i * 2.39996));
  star.alpha = 0.3 + i % 5 * 0.15;
  sky.addChild(star);
}

// The sun: a blurred disc behind a sharp one.
const glow = ball(24, 0xff9a3c);
glow.filters = [new BlurFilter({ strength: 8 })];
system.addChild(glow, ball(16, 0xffd84a));

// A planet sits in an `orbit`, a container that turns around the sun; its moon sits in a second container that turns around the planet.
//               distance, radius, colour, seconds for one turn, where it starts (in turns), has a moon
const PLANETS = [[32, 4, 0xc9b29b, 4, 0.1], [52, 7, 0x4fa3e3, 9, 0.55, true], [76, 6, 0xd9603b, 15, 0.8], [104, 11, 0xe8c27a, 30, 0.3, true]];
const orbits = [];
for (const [distance, radius, colour, seconds, start, hasMoon] of PLANETS) {
  const path = new Graphics().circle(0, 0, distance).stroke({ color: 0xffffff, alpha: 0.12, width: 1 });
  const orbit = new Container(), planet = ball(radius, colour);
  orbit.rotation = start * 2 * Math.PI;
  planet.x = distance;
  orbit.addChild(planet);
  if (hasMoon) {
    const around = new Container();
    around.x = distance;
    around.addChild(ball(2, 0xdddddd)).x = radius + 5;
    orbit.addChild(around);
    orbits.push({ container: around, seconds: seconds / 6, planet });
  }
  system.addChild(path, orbit);
  orbits.push({ container: orbit, seconds, planet });

  planet.eventMode = 'static';   // it hears the pointer
  planet.cursor = 'pointer';
  planet.on('pointerover', () => planet.scale.set(1.4 * radius / 32));
  planet.on('pointerout', () => planet.scale.set(radius / 32));
  planet.on('pointertap', () => { planet.stopped = !planet.stopped; planet.alpha = planet.stopped ? 0.5 : 1; });
}

app.ticker.add(ticker => {
  const { width, height } = app.screen;
  system.position.set(width / 2, height / 2);
  system.scale.set(Math.min(width, height) / 240);   // the whole system fits the window
  sky.position.set(width / 2, height / 2);
  for (const { container, seconds, planet } of orbits) if (!planet.stopped) container.rotation += 2 * Math.PI * ticker.deltaMS / 1000 / seconds;
});
