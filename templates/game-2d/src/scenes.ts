// Scene hooks update the game and draw it; main.ts owns transitions between hooks.
import { clear, rrect, gradient, width, height, isDown, wasPressed, pointerDown, pointerX, pointerY, Btn, font, drawText, textWidth } from 'zinc:gfx';
import { load } from 'zinc:audio';
import { Scene, Sprite } from 'zinc:game';
import { left, right, up, down, start } from './input';
import { atlas } from 'zinc:sprite';
import { World, PLAYER, COIN } from './world';
import { best, record } from './save';

export enum NextScene { Stay, Play, Over }

export class GameScene extends Scene {
  next: NextScene = NextScene.Stay;
  enter(): void { this.next = NextScene.Stay; }
}

const BG = 0x14213d, INK = 0xffffff, MUTED = 0x9fb3c8, GOLD = 0xf9c74f;
const title = font('sans-bold', 40), body = font('sans', 18), hud = font('sans-bold', 18);
const sprites = atlas('sprites');   // the SVGs of assets/ in one texture: the "sprite" rule of zinc.json
const player = new Sprite(sprites.frame('player.svg')), coin = new Sprite(sprites.frame('coin.svg'));
coin.width = COIN; coin.height = COIN;
const ding = load('coin.wav');   // a sound of assets/ (WAV, FLAC, MP3 or OGG); a run without audio output plays nothing

function centered(f: i32, y: number, s: string, color: u32): void { drawText(f, (width() - textWidth(f, s, 0)) / 2, y, s, color, 255, 0); }
function started(): boolean { return start.pressed || wasPressed(Btn.Start) || wasPressed(Btn.A) || pointerDown(); }

export class TitleScene extends GameScene {
  update(dt: number): void { this.next = started() ? NextScene.Play : NextScene.Stay; }
  draw(): void {
    gradient(0, 0, width(), height(), 0, BG, 0x0b132b, true, 255);
    player.x = (width() - 64) / 2; player.y = height() / 2 - 150;
    player.width = 64; player.height = 64; player.draw();
    centered(title, height() / 2 - 70, 'Coin Rush', INK);
    centered(body, height() / 2 - 10, 'Collect the coins before the time runs out', MUTED);
    centered(body, height() / 2 + 40, 'Press Enter, Space or click to start', GOLD);
    centered(body, height() - 48, `Best: ${best()}`, MUTED);
  }
}

export class PlayScene extends GameScene {
  world: World = new World(width(), height(), 7);
  enter(): void { super.enter(); this.world = new World(width(), height(), 7); }
  update(dt: number): void {
    const w = this.world;
    let dx = (isDown(Btn.Right) ? 1 : right.value) - (isDown(Btn.Left) ? 1 : left.value), dy = (isDown(Btn.Down) ? 1 : down.value) - (isDown(Btn.Up) ? 1 : up.value);
    if (pointerDown()) {   // the pointer: head for it
      const px = pointerX() - (w.x + PLAYER / 2), py = pointerY() - (w.y + PLAYER / 2), d = Math.sqrt(px * px + py * py);
      if (d > 4) { dx = px / d; dy = py / d; }
    }
    const had = w.score;
    const going = w.step(dx, dy, dt);
    if (w.score > had) ding.play();   // every coin rings, over the one before
    this.next = going ? NextScene.Stay : NextScene.Over;
  }
  draw(): void {
    const w = this.world;
    clear(BG);
    rrect(0, 0, width(), 40, 0, 0x0b132b, 255);
    drawText(hud, 16, 10, `Score ${w.score}`, INK, 255, 0);
    const t = `${Math.ceil(w.time)} s`;
    drawText(hud, width() - 16 - textWidth(hud, t, 0), 10, t, w.time < 5 ? 0xf94144 : INK, 255, 0);
    for (const c of w.coins) { coin.x = c.x; coin.y = c.y; coin.draw(); }
    player.x = w.x; player.y = w.y; player.width = PLAYER; player.height = PLAYER; player.draw();
  }
}

export class OverScene extends GameScene {
  play: PlayScene;
  constructor(play: PlayScene) { super(); this.play = play; }
  score: i32 = 0;
  newBest: boolean = false;
  enter(): void { super.enter(); this.score = this.play.world.score; this.newBest = record(this.score); }
  update(dt: number): void { this.next = started() ? NextScene.Play : NextScene.Stay; }
  draw(): void {
    clear(BG);
    centered(title, height() / 2 - 80, 'Time!', INK);
    centered(body, height() / 2 - 16, `${this.score} coin(s)`, GOLD);
    centered(body, height() / 2 + 14, this.newBest ? 'A new best score' : `Best: ${best()}`, MUTED);
    centered(body, height() / 2 + 56, 'Press Enter, Space or click to play again', MUTED);
  }
}
