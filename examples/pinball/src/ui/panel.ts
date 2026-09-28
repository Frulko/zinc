// The side panel, after the right-hand panel of the classic desktop pinball: the game's emblem, player and ball,
// the score on a seven-segment display, the rank with its pips, the mission and its progress (or the message of
// the moment), bonus and ball saver state, and the controls. In attract mode it lists the high scores. Every
// command repeats frame to frame unless a number changes, so the frame diff leaves the panel alone.
import { rrect, gradient, border, polygon, stroke, drawText, font, textWidth, lineHeight } from 'zinc:gfx';
import { TOUCH } from 'zinc:platform';
import { Game, PH_ATTRACT, PH_ENTRY, PH_OVER, PH_BONUS, BALLS_PER_GAME, C_GOLD, C_CYAN, C_PINK, C_GREEN } from '../game/game';
import { MISSIONS, RANKS } from '../game/missions';
import { mix } from '../render/draw';

const INK: u32 = 0xe6ecff, DIM: u32 = 0x8b95c9, FRAME: u32 = 0x9aa4c8;
const seg: number[] = [];

/** Seven-segment digit masks (a b c d e f g). */
const DIGITS: i32[] = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

export class Panel {
  constructor(public game: Game, public x: number, public y: number, public w: number, public h: number) {}

  draw(): void {
    const g = this.game, x = this.x, w = this.w, h = this.h;
    const pad = Math.round(w * 0.05);
    // frame: dark blue metal with a chrome border
    gradient(x, 0, w, h, 0, 0x151a3a, 0x07081a, true, 255);
    border(x + 3, 3, w - 6, h - 6, 10, 2, FRAME, 200);
    border(x + 7, 7, w - 14, h - 14, 8, 1, 0x3a4378, 255);
    let cy = pad;
    cy = this.emblem(x + pad, cy, w - pad * 2);
    cy += Math.round(h * 0.02);
    cy = this.scoreBox(x + pad, cy, w - pad * 2);
    cy += Math.round(h * 0.025);
    if (g.phase === PH_ATTRACT) this.highScores(x + pad, cy, w - pad * 2);
    else {
      cy = this.rankBox(x + pad, cy, w - pad * 2);
      cy += Math.round(h * 0.02);
      this.missionBox(x + pad, cy, w - pad * 2, h - cy - pad - this.helpHeight());
    }
    this.help(x + pad, h - pad - this.helpHeight());
  }

  private emblem(x: number, y: number, w: number): number {
    const title = font('sans-bold', 40), sub = font('sans-bold', 16);
    const cx = x + w / 2;
    // a ringed planet behind the name
    const r = 26;
    rrect(cx - r, y + 4, r * 2, r * 2, r, 0x1f3aa0, 255);
    rrect(cx - r * 0.8, y + 4 + r * 0.1, r * 1.3, r * 1.3, r * 0.65, 0x3f6bd8, 255);
    rrect(cx - r * 0.55, y + 4 + r * 0.25, r * 0.6, r * 0.5, r * 0.25, 0x9fc0ff, 200);
    seg.length = 0;
    for (let i: i32 = 0; i <= 24; i++) { const a = Math.PI * 2 * i / 24; seg.push(cx + Math.cos(a) * r * 1.9); seg.push(y + 4 + r + Math.sin(a) * r * 0.45 - Math.cos(a) * 6); }
    stroke(seg, 2.5, 0xc8d6ff, 170, true);
    const t = 'NOVA', t2 = 'P A T R O L';
    const ty = y + r * 2 - 14;
    drawText(title, cx - textWidth(title, t, 6) / 2 + 2, ty + 2, t, 0x000000, 160, 6);
    drawText(title, cx - textWidth(title, t, 6) / 2, ty, t, 0xffd23f, 255, 6);
    drawText(sub, cx - textWidth(sub, t2, 2) / 2, ty + lineHeight(title) - 2, t2, C_CYAN, 255, 2);
    return ty + lineHeight(title) + lineHeight(sub);
  }

  private scoreBox(x: number, y: number, w: number): number {
    const g = this.game, p = g.player;
    const small = font('sans-bold', 14);
    const lh = lineHeight(small);
    const label = g.phase === PH_ATTRACT ? 'DEMO' : `PLAYER ${g.current + 1}`;
    const ball = g.phase === PH_ATTRACT ? 'PRESS START' : `BALL ${Math.min(p.ball, BALLS_PER_GAME)}${p.extraBalls > 0 ? ' +EB' : ''}`;
    drawText(small, x + 2, y, label, C_GOLD, 255, 1);
    drawText(small, x + w - textWidth(small, ball, 1) - 2, y, ball, C_GOLD, 255, 1);
    y += lh + 4;
    const dh = Math.round(w * 0.17);
    rrect(x, y, w, dh + 16, 6, 0x020604, 255);
    border(x, y, w, dh + 16, 6, 1.5, 0x3a4378, 255);
    this.sevenSeg(x + 10, y + 8, w - 20, dh, p.score);
    y += dh + 22;
    // other players' scores
    if (g.players.length > 1) {
      const f = font('sans', 14);
      let col = 0;
      for (let i: i32 = 0; i < g.players.length; i++) {
        if (i === g.current) continue;
        const s = `P${i + 1} ${g.players[i].score}`;
        drawText(f, x + 2 + col * (w / 3), y, s, DIM, 255, 0);
        col++;
      }
      y += lineHeight(f) + 2;
    }
    return y;
  }

  /** Ten digits, leading zeros unlit; a dim ghost of every segment under the lit ones. */
  private sevenSeg(x: number, y: number, w: number, h: number, value: i32): void {
    const n: i32 = 10;
    const cw = w / n, dw = cw * 0.72, t = Math.max(2, dw * 0.16);
    let v = value;
    const digits: i32[] = [];
    for (let i: i32 = 0; i < n; i++) { digits.push(v % 10); v = Math.floor(v / 10); }
    let started = false;
    for (let i: i32 = n - 1; i >= 0; i--) {
      const d = digits[i];
      if (d !== 0 || i === 0) started = true;
      const mask = started ? DIGITS[d] : 0;
      const dx = x + (n - 1 - i) * cw + (cw - dw) / 2;
      for (let sgi: i32 = 0; sgi < 7; sgi++) {
        const on = ((mask >> sgi) & 1) === 1;
        this.segment(dx, y, dw, h, t, sgi, on ? 0x5cff8a : 0x0a1c10, 255);
      }
      if (i % 3 === 0 && i > 0) rrect(dx + dw + (cw - dw) / 2 - t / 2, y + h - t, t, t, t / 2, started ? 0x5cff8a : 0x0a1c10, 255);
    }
  }

  /** One segment as a slanted hexagon (a top, b upper right, c lower right, d bottom, e lower left, f upper left, g middle). */
  private segment(x: number, y: number, w: number, h: number, t: number, i: i32, color: u32, alpha: i32): void {
    const hh = h / 2, sl = w * 0.12;   // italic slant
    let x0: number = 0, y0: number = 0, x1: number = 0, y1: number = 0;
    if (i === 0) { x0 = 0; y0 = 0; x1 = w; y1 = 0; }
    else if (i === 1) { x0 = w; y0 = 0; x1 = w; y1 = hh; }
    else if (i === 2) { x0 = w; y0 = hh; x1 = w; y1 = h; }
    else if (i === 3) { x0 = 0; y0 = h; x1 = w; y1 = h; }
    else if (i === 4) { x0 = 0; y0 = hh; x1 = 0; y1 = h; }
    else if (i === 5) { x0 = 0; y0 = 0; x1 = 0; y1 = hh; }
    else { x0 = 0; y0 = hh; x1 = w; y1 = hh; }
    const horiz = y0 === y1;
    const g = t * 0.55, k = t / 2;
    seg.length = 0;
    const px = (u: number, v: number): void => { seg.push(x + u + sl * (1 - v / h)); seg.push(y + v); };
    if (horiz) { px(x0 + g, y0); px(x0 + g + k, y0 - k); px(x1 - g - k, y0 - k); px(x1 - g, y0); px(x1 - g - k, y0 + k); px(x0 + g + k, y0 + k); }
    else { px(x0, y0 + g); px(x0 + k, y0 + g + k); px(x0 + k, y1 - g - k); px(x0, y1 - g); px(x0 - k, y1 - g - k); px(x0 - k, y0 + g + k); }
    polygon(seg, color, alpha);
  }

  private rankBox(x: number, y: number, w: number): number {
    const g = this.game, p = g.player;
    const f = font('sans-bold', 16), small = font('sans', 12);
    drawText(small, x + 2, y, 'RANK', DIM, 255, 2);
    y += lineHeight(small);
    drawText(f, x + 2, y, RANKS[p.rank], C_CYAN, 255, 1);
    const bx = `BONUS ${p.bonusX}X`;
    drawText(f, x + w - textWidth(f, bx, 1) - 2, y, bx, C_GREEN, 255, 1);
    y += lineHeight(f) + 4;
    const pw = (w - 7 * 4) / 8;
    for (let i: i32 = 0; i < 8; i++) {
      const on = i <= p.rank;
      rrect(x + i * (pw + 4), y, pw, 6, 3, on ? mix(0x3fe7ff, 0xffffff, i === p.rank ? 0.4 : 0) : 0x1a2250, 255);
    }
    return y + 10;
  }

  private missionBox(x: number, y: number, w: number, h: number): void {
    const g = this.game, p = g.player;
    const big = font('sans-bold', 24), f = font('sans-bold', 16), small = font('sans', 14);
    rrect(x, y, w, h, 8, 0x0a0d24, 255);
    border(x, y, w, h, 8, 1.5, 0x3a4378, 255);
    const ix = x + 12;
    let cy = y + 10;
    if (g.messageT > 0 || g.phase === PH_BONUS || g.phase === PH_OVER || g.phase === PH_ENTRY) {
      const flash = Math.floor(g.time * 6) % 2 === 0;
      let m = g.message, m2 = g.message2;
      if (g.phase === PH_ENTRY) { m = 'HIGH SCORE'; m2 = `Player ${g.entryPlayer + 1}: enter your initials`; }
      else if (g.phase === PH_OVER && g.messageT <= 0) { m = 'GAME OVER'; m2 = ''; }
      drawText(big, ix, cy, m, flash ? C_GOLD : 0xffffff, 255, 1);
      cy += lineHeight(big) + 2;
      if (m2.length > 0) this.wrap(small, ix, cy, w - 24, m2, INK);
      return;
    }
    const m = MISSIONS[p.mission];
    drawText(small, ix, cy, 'MISSION', DIM, 255, 2);
    cy += lineHeight(small);
    drawText(f, ix, cy, m.name, C_PINK, 255, 1);
    cy += lineHeight(f) + 2;
    cy = this.wrap(small, ix, cy, w - 24, `${m.goal}: ${p.progress} / ${m.count}`, INK);
    // progress bar
    const bw = w - 24;
    rrect(ix, cy + 4, bw, 6, 3, 0x1a2250, 255);
    rrect(ix, cy + 4, Math.max(6, bw * p.progress / m.count), 6, 3, C_PINK, 255);
    cy += 16;
    const status: string[] = [];
    if (g.ballSave > 0) status.push('BALL SAVE');
    if (g.multiball) status.push('MULTIBALL');
    if (p.extraLit) status.push('EXTRA BALL LIT');
    if (g.danger > 0) status.push('DANGER');
    const lh = lineHeight(small);
    if (status.length > 0) { drawText(small, ix, cy, status.join('  '), g.danger > 0 ? 0xff3b3b : C_GREEN, 255, 1); cy += lh + 4; }
    // the figures of the ball in play, while there is room
    const lines: string[] = [`Bonus ${g.bonus} x ${p.bonusX}`, `Next: ${MISSIONS[(p.mission + 1) % MISSIONS.length].name}`];
    if (g.multiball) lines.unshift(`Jackpot ${g.jackpot}`);
    if (p.holeSinks % 3 > 0 && !g.multiball) lines.push(`Wormhole ${p.holeSinks % 3} / 3 for multiball`);
    const best = g.store.scores[0];
    lines.push(`Best: ${best.name} ${best.score}`);
    for (const l of lines) {
      if (cy + lh > y + h - 6) break;
      drawText(small, ix, cy, l, DIM, 255, 0);
      cy += lh;
    }
  }

  private highScores(x: number, y: number, w: number): void {
    const f = font('sans-bold', 16), small = font('sans', 14);
    drawText(small, x + 2, y, 'HIGH SCORES', DIM, 255, 2);
    y += lineHeight(small) + 4;
    const sc = this.game.store.scores;
    for (let i: i32 = 0; i < sc.length; i++) {
      const c = i === 0 ? C_GOLD : INK;
      drawText(f, x + 2, y, `${i + 1}.  ${sc[i].name}`, c, 255, 1);
      const s = `${sc[i].score}`;
      drawText(f, x + w - textWidth(f, s, 1) - 2, y, s, c, 255, 1);
      y += lineHeight(f) + 3;
    }
  }

  private helpHeight(): number { return lineHeight(font('sans', 12)) * 3 + 4; }

  private help(x: number, y: number): void {
    const f = font('sans', 12);
    const lh = lineHeight(f);
    const lines: string[] = TOUCH
      ? ['Touch left / right: flippers', 'Touch this panel: plunger', 'Keys: Z  /  Space  Esc']
      : ['Z and / : flippers    Space: plunger', 'X  .  Up: bump the table', 'Enter: start    Esc: menu'];
    for (let i: i32 = 0; i < lines.length; i++) drawText(f, x + 2, y + i * lh, lines[i], DIM, 255, 0);
  }

  /** Word-wrapped text; returns the y below it. */
  private wrap(f: i32, x: number, y: number, w: number, s: string, color: u32): number {
    const words = s.split(' ');
    let lineText = '';
    const lh = lineHeight(f);
    for (const word of words) {
      const next = lineText.length > 0 ? `${lineText} ${word}` : word;
      if (textWidth(f, next, 0) > w && lineText.length > 0) {
        drawText(f, x, y, lineText, color, 255, 0);
        y += lh; lineText = word;
      } else lineText = next;
    }
    if (lineText.length > 0) { drawText(f, x, y, lineText, color, 255, 0); y += lh; }
    return y;
  }
}
