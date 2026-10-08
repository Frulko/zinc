// The scenes: each draws itself and reads the input for one frame, and names the scene to go to next ('' to stay).
import { clear, rrect, gradient, width, height, isDown, wasPressed, pointerDown, pointerX, pointerY, Btn, font, drawText, textWidth, image, drawImage } from 'zinc:gfx';
import { World, PLAYER, COIN } from './world';
import { best, record } from './save';

export interface Scene { update(dt: number): string; }

const BG = 0x14213d, INK = 0xffffff, MUTED = 0x9fb3c8, GOLD = 0xf9c74f;
const title = font('sans-bold', 40), body = font('sans', 18), hud = font('sans-bold', 18);
const player = image('player.svg'), coin = image('coin.svg');

function centered(f: i32, y: number, s: string, color: u32): void { drawText(f, (width() - textWidth(f, s, 0)) / 2, y, s, color, 255, 0); }
function started(): boolean { return wasPressed(Btn.Start) || wasPressed(Btn.A) || pointerDown(); }

export class TitleScene implements Scene {
  update(dt: number): string {
    gradient(0, 0, width(), height(), 0, BG, 0x0b132b, true, 255);
    drawImage(player, (width() - 64) / 2, height() / 2 - 150, 64, 64, 255, 0);
    centered(title, height() / 2 - 70, 'Coin Rush', INK);
    centered(body, height() / 2 - 10, 'Collect the coins before the time runs out', MUTED);
    centered(body, height() / 2 + 40, 'Press Enter, Space or click to start', GOLD);
    centered(body, height() - 48, `Best: ${best()}`, MUTED);
    return started() ? 'play' : '';
  }
}

export class PlayScene implements Scene {
  world: World = new World(width(), height(), 7);
  restart(): void { this.world = new World(width(), height(), 7); }
  update(dt: number): string {
    const w = this.world;
    let dx = (isDown(Btn.Right) ? 1 : 0) - (isDown(Btn.Left) ? 1 : 0), dy = (isDown(Btn.Down) ? 1 : 0) - (isDown(Btn.Up) ? 1 : 0);
    if (pointerDown()) {   // the pointer: head for it
      const px = pointerX() - (w.x + PLAYER / 2), py = pointerY() - (w.y + PLAYER / 2), d = Math.sqrt(px * px + py * py);
      if (d > 4) { dx = px / d; dy = py / d; }
    }
    const going = w.step(dx, dy, dt);
    clear(BG);
    rrect(0, 0, width(), 40, 0, 0x0b132b, 255);
    drawText(hud, 16, 10, `Score ${w.score}`, INK, 255, 0);
    const t = `${Math.ceil(w.time)} s`;
    drawText(hud, width() - 16 - textWidth(hud, t, 0), 10, t, w.time < 5 ? 0xf94144 : INK, 255, 0);
    for (const c of w.coins) drawImage(coin, c.x, c.y, COIN, COIN, 255, 0);
    drawImage(player, w.x, w.y, PLAYER, PLAYER, 255, 0);
    return going ? '' : 'over';
  }
}

export class OverScene implements Scene {
  score: i32 = 0;
  newBest: boolean = false;
  enter(score: i32): void { this.score = score; this.newBest = record(score); }
  update(dt: number): string {
    clear(BG);
    centered(title, height() / 2 - 80, 'Time!', INK);
    centered(body, height() / 2 - 16, `${this.score} coin(s)`, GOLD);
    centered(body, height() / 2 + 14, this.newBest ? 'A new best score' : `Best: ${best()}`, MUTED);
    centered(body, height() / 2 + 56, 'Press Enter, Space or click to play again', MUTED);
    return started() ? 'play' : '';
  }
}
