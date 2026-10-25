// The bottom screen (320x240, the stylus): the lives, coins, score and time; the whole level as a map with the hero, the critters, the coins
// and the part the top screen shows; holding the stylus on the map moves the top screen's camera there (a look ahead), letting go brings it
// back to the hero. A tap anywhere starts a game. The map is drawn once into an image; a frame adds a few rectangles and three lines of text.
import { clear, text, rect, createImage, beginImage, endImage, drawImage, resetTransform, pointerDown, pointerX, pointerY } from 'zinc:gfx';
import { atlas } from 'zinc:sprite';
import { World, Phase, CELL } from '../../platformer/src/world';
import { View } from '../../platformer/src/render';
import { INK, WHITE, GOLD, RED, GREEN, DIM, PANEL, SKY, EARTH, CLOUD_C, SPIKE_C, PIXEL, MAP_X, MAP_Y, MAP_W, MAP_H } from './constants';

const art = atlas('game');
const heart = art.frame('heart'), heartEmpty = art.frame('heart_empty'), coinIcon = art.frame('coin_0');
const SOLID = 1, CLOUD = 2, SPIKES = 3;   // the Collisions layer's values (world.ts)

export class Bottom {
  map: i32 = -1;
  k = 1;                 // map pixels per level pixel
  peeking = false;       // the stylus holds the map
  peekX = 0; peekY = 0;  // the level point it holds
  tapped = false;        // a new touch this frame (starts a game)
  private down = false;
  private key = ''; private line = '';

  /** The level's Collisions layer as a map image, row by row in runs of one value. */
  build(world: World): void {
    const walls = world.walls, k = MAP_W / world.width;
    this.k = k;
    this.map = createImage(MAP_W, MAP_H);
    resetTransform();
    beginImage(this.map);
    clear(SKY);
    const c = CELL * k;
    for (let r = 0; r < walls.rows; r++) {
      let start = 0;
      for (let col = 1; col <= walls.cols; col++) {
        const v = walls.value(start, r);
        if (col < walls.cols && walls.value(col, r) === v) continue;
        if (v === SOLID || v === CLOUD || v === SPIKES)
          rect(start * c, r * c, (col - start) * c, v === SOLID ? c : c * 0.5, v === SOLID ? EARTH : v === CLOUD ? CLOUD_C : SPIKE_C);
        start = col;
      }
    }
    endImage();
  }

  /** Reads the stylus: a tap, and where it holds the map. */
  input(world: World): void {
    const d = pointerDown(), px = pointerX(), py = pointerY();
    this.tapped = d && !this.down;
    this.down = d;
    this.peeking = d && world.phase === Phase.Play && px >= MAP_X && px < MAP_X + MAP_W && py >= MAP_Y - 10 && py < MAP_Y + MAP_H + 10;
    if (this.peeking) { this.peekX = (px - MAP_X) / this.k; this.peekY = Math.max(0, Math.min(MAP_H, py - MAP_Y)) / this.k; }
  }

  draw(world: World, view: View): void {
    clear(INK);
    if (world.phase === Phase.Title) { this.title(world); return; }
    // the header: hearts, coins, score, time
    for (let i = 0; i < 3; i++) (i < world.lives ? heart : heartEmpty).draw(8 + i * 18, 10, 0, 0, 255, PIXEL);
    coinIcon.draw(66, 10, 0, 0, 255, PIXEL);
    const key = `${world.taken}/${world.score}/${Math.floor(world.time)}`;
    if (key !== this.key) { this.key = key; this.line = `${world.taken}/${world.coins.length}  SCORE ${world.score}  TIME ${Math.floor(world.time)}`; }
    text(84, 14, this.line, WHITE, 1);
    // the map, the view's frame, the coins, the critters, the flag and the hero
    rect(MAP_X - 2, MAP_Y - 2, MAP_W + 4, MAP_H + 4, PANEL);
    drawImage(this.map, MAP_X, MAP_Y, MAP_W, MAP_H, 255, 0);
    const k = this.k, vx = MAP_X + Math.round(view.camX * k), vy = MAP_Y + Math.round(view.camY * k);
    const vw = Math.round(view.w * k), vh = Math.round(view.h * k);
    rect(vx, vy, vw, 1, INK); rect(vx, vy + vh - 1, vw, 1, INK); rect(vx, vy, 1, vh, INK); rect(vx + vw - 1, vy, 1, vh, INK);
    for (const c of world.coins) if (!c.taken) rect(MAP_X + Math.round(c.x * k), MAP_Y + Math.round(c.y * k), 2, 2, GOLD);
    for (const e of world.enemies) if (e.alive) rect(MAP_X + Math.round(e.x * k), MAP_Y + Math.round(e.y * k), 3, 3, RED);
    rect(MAP_X + Math.round(world.goalX * k) + 2, MAP_Y + Math.round(world.goalY * k), 2, 10, GREEN);
    const h = world.hero;
    rect(MAP_X + Math.round(h.x * k) - 1, MAP_Y + Math.round(h.y * k) - 1, 5, 6, WHITE);
    rect(MAP_X + Math.round(h.x * k), MAP_Y + Math.round(h.y * k), 3, 4, RED);
    text(MAP_X, MAP_Y + MAP_H + 8, this.peeking ? 'looking around: let go, back to the hero' : 'stylus on the map: look around', DIM, 1);
    // how far along the level, and the controls
    const along = Math.max(0, Math.min(1, h.x / world.goalX));
    rect(MAP_X, 150, MAP_W, 8, PANEL);
    rect(MAP_X, 150, Math.round(MAP_W * along), 8, GREEN);
    text(MAP_X, 164, 'to the flag', DIM, 1);
    text(MAP_X, 192, 'D-PAD move   A / B jump   Y run', WHITE, 1);
    text(MAP_X, 206, 'START pause', WHITE, 1);
    if (world.phase === Phase.Won || world.phase === Phase.Over) text(MAP_X, 222, 'tap or START: the title', GOLD, 1);
  }

  private title(world: World): void {
    text(16, 20, 'MEADOW RUN', GOLD, 3);
    text(16, 52, 'two screens, one meadow', WHITE, 1);
    text(16, 80, 'collect the coins, stomp the', WHITE, 1);
    text(16, 92, 'critters, reach the flag', WHITE, 1);
    text(16, 120, 'D-PAD / CIRCLE PAD  move', GREEN, 1);
    text(16, 132, 'A / B  jump (hold: higher)', GREEN, 1);
    text(16, 144, 'Y / X  run      START  pause', GREEN, 1);
    text(16, 156, 'stylus on the map: look ahead', GREEN, 1);
    text(16, 176, '3D slider up: the coins come out', DIM, 1);
    if (Math.floor(world.steps / 30) % 2 === 0) text(16, 208, 'TAP THE SCREEN OR PRESS START', GOLD, 1);
  }
}
