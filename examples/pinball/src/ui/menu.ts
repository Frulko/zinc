// Overlays on the table: the attract title, the initials entry, and the pause menu (resume, sound, tilt
// sensitivity, controls help, new game, quit). The menu is driven by the arrows / D-pad or the flipper buttons,
// confirmed with Space / Enter / A / the plunger, and answers taps on its items.
import { rrect, border, drawText, font, textWidth, lineHeight, quit } from 'zinc:gfx';
import { Controls } from '../input';
import { Game, PH_ATTRACT, PH_ENTRY, PH_OVER, C_GOLD, C_CYAN, C_PINK } from '../game/game';
import { setSound } from '../audio/sound';

const TILT_NAMES: string[] = ['LOW', 'NORMAL', 'HIGH'];
const HELP: string[] = [
  'FLIPPERS   Z / Left / A       / (slash) / Right / D',
  'PLUNGER    hold Space or Down, release to launch',
  'BUMP       X from the left, . from the right, Up',
  'MENU       Esc or P;  Enter starts, adds players',
  'PAD        L / R flippers, A plunger, B Y Up bump',
  'TOUCH      left / right half: flippers',
  '           side panel: plunger',
  '',
  'Rules: finish missions to rise in rank. Three',
  'wormhole shots start multiball: the ramp scores',
  'the jackpot. Top lanes raise the bonus multiplier.',
];

export class Menu {
  open: boolean = false;
  help: boolean = false;
  sel: i32 = 0;
  private itemY: number[] = [];
  private itemH: number = 0;
  private boxX: number = 0;
  private boxW: number = 0;

  constructor(public game: Game) {}

  private items(): string[] {
    const s = this.game.store.settings;
    return ['RESUME', `SOUND: ${s.sound ? 'ON' : 'OFF'}`, `TILT SENSITIVITY: ${TILT_NAMES[s.tilt]}`, 'CONTROLS & RULES', 'NEW GAME', 'QUIT'];
  }

  show(): void { this.open = true; this.help = false; this.sel = 0; }

  update(c: Controls, plungerEdge: boolean): void {
    if (this.help) { if (c.back || c.confirm || c.tap || plungerEdge || c.pause) this.help = false; return; }
    const n: i32 = this.items().length;
    if (c.back) { this.open = false; return; }
    if (c.up || c.leftPressed) this.sel = (this.sel + n - 1) % n;
    if (c.down || c.rightPressed) this.sel = (this.sel + 1) % n;
    let go = c.confirm || plungerEdge;
    if (c.tap) {
      for (let i: i32 = 0; i < this.itemY.length; i++) {
        if (c.tapX >= this.boxX && c.tapX < this.boxX + this.boxW && c.tapY >= this.itemY[i] && c.tapY < this.itemY[i] + this.itemH) { this.sel = i; go = true; }
      }
    }
    if (!go) return;
    const st = this.game.store;
    if (this.sel === 0) this.open = false;
    else if (this.sel === 1) { st.settings.sound = !st.settings.sound; setSound(st.settings.sound); st.saveSettings(); }
    else if (this.sel === 2) { st.settings.tilt = (st.settings.tilt + 1) % 3; st.saveSettings(); }
    else if (this.sel === 3) this.help = true;
    else if (this.sel === 4) { this.open = false; this.game.startGame(1); }
    else quit();
  }

  draw(x: number, y: number, w: number, h: number): void {
    rrect(x, y, w, h, 0, 0x000000, 150);
    const f = font('sans-bold', 18), title = font('sans-bold', 28);
    if (this.help) {
      const m = font('sans', 14);
      const lh = lineHeight(m);
      const bw = Math.min(w - 20, 440), bh = lh * HELP.length + 70;
      const bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
      this.box(bx, by, bw, bh);
      drawText(title, bx + 18, by + 12, 'CONTROLS', C_CYAN, 255, 2);
      for (let i: i32 = 0; i < HELP.length; i++) drawText(m, bx + 18, by + 56 + i * lh, HELP[i], 0xe6ecff, 255, 0);
      return;
    }
    const items = this.items();
    const lh = lineHeight(f) + 12;
    const bw = Math.min(w - 20, 340), bh = lh * items.length + 72;
    const bx = x + (w - bw) / 2, by = y + (h - bh) / 2;
    this.box(bx, by, bw, bh);
    drawText(title, bx + (bw - textWidth(title, 'PAUSED', 3)) / 2, by + 12, 'PAUSED', C_GOLD, 255, 3);
    this.itemY.length = 0; this.itemH = lh; this.boxX = bx; this.boxW = bw;
    for (let i: i32 = 0; i < items.length; i++) {
      const iy = by + 60 + i * lh;
      this.itemY.push(iy);
      if (i === this.sel) rrect(bx + 12, iy, bw - 24, lh - 4, 6, 0x2a3480, 255);
      drawText(f, bx + 26, iy + 5, items[i], i === this.sel ? 0xffffff : 0xaab4e0, 255, 1);
    }
  }

  private box(x: number, y: number, w: number, h: number): void {
    rrect(x, y, w, h, 12, 0x0c1030, 245);
    border(x, y, w, h, 12, 2, 0x9aa4c8, 255);
  }
}

/** Title and messages drawn over the table for the attract mode, game over and the initials entry. */
export function drawTableOverlay(g: Game, x: number, y: number, w: number, h: number): void {
  const big = font('sans-bold', 40), f = font('sans-bold', 18);
  const blink = Math.floor(g.time * 2) % 2 === 0;
  if (g.phase === PH_ATTRACT) {
    const t = 'NOVA PATROL';
    const tw = textWidth(big, t, 3);
    rrect(x + (w - tw) / 2 - 18, y + h * 0.3 - 10, tw + 36, 64, 14, 0x000000, 120);
    drawText(big, x + (w - tw) / 2 + 2, y + h * 0.3 + 2, t, 0x000000, 180, 3);
    drawText(big, x + (w - tw) / 2, y + h * 0.3, t, C_GOLD, 255, 3);
    if (blink) {
      const s = 'PRESS SPACE OR TAP TO PLAY';
      drawText(f, x + (w - textWidth(f, s, 1)) / 2, y + h * 0.3 + 58, s, 0xffffff, 255, 1);
    }
  } else if (g.phase === PH_OVER && g.messageT <= 0) {
    const t = 'GAME OVER';
    drawText(big, x + (w - textWidth(big, t, 3)) / 2, y + h * 0.38, t, C_PINK, 255, 3);
  } else if (g.phase === PH_ENTRY) {
    rrect(x, y, w, h, 0, 0x000000, 130);
    const t = 'NEW HIGH SCORE';
    drawText(big, x + (w - textWidth(big, t, 2)) / 2, y + h * 0.26, t, C_GOLD, 255, 2);
    const s = `${g.players[g.entryPlayer].score}`;
    drawText(f, x + (w - textWidth(f, s, 2)) / 2, y + h * 0.26 + 54, s, 0xffffff, 255, 2);
    const cw = 54, cx = x + (w - cw * 3 - 20) / 2, cy = y + h * 0.45;
    for (let i: i32 = 0; i < 3; i++) {
      const on = i === g.entryPos;
      const bx = cx + i * (cw + 10);
      rrect(bx, cy, cw, 66, 8, on ? 0x2a3480 : 0x10143a, 255);
      border(bx, cy, cw, 66, 8, 2, on && blink ? C_CYAN : 0x3a4378, 255);
      const l = String.fromCharCode(65 + g.entryName[i]);
      if (i <= g.entryPos) drawText(big, bx + (cw - textWidth(big, l, 0)) / 2, cy + 10, l, on ? C_CYAN : 0xffffff, 255, 0);
    }
    const hint = 'Flippers: letter    Plunger: next';
    drawText(f, x + (w - textWidth(f, hint, 0)) / 2, cy + 90, hint, 0xaab4e0, 255, 0);
  }
}
