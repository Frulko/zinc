// The side panels and the message band. On the top screen: the score, the ball and the player on the left; the rank and the mission on the
// right; the game's messages in a band out of the screen. On the bottom screen: the tilt meter on the left, the plunger's strip on the right
// (the stylus pulls it there). The strings are rebuilt only when what they show changes.
import { rect, rrect, drawText, font, textWidth, width, height } from 'zinc:gfx';
import { Game, PH_ATTRACT, PH_PLAY, PH_ENTRY, PH_OVER, BALLS_PER_GAME } from '../../pinball/src/game/game';
import { MISSIONS, RANKS } from '../../pinball/src/game/missions';
import { Eyes } from '../../n3ds-kit/stereo';
import { TOP_PANEL_W, BOTTOM_PANEL_W, DEPTH_BAND, INK, PANEL, WHITE, DIM, CYAN, GOLD, RED, GREEN } from './constants';

const small = font('sans', 10), bold = font('sans-bold', 12), big = font('sans-bold', 18);

function centred(f: i32, x: number, w: number, y: number, s: string, color: u32): void {
  drawText(f, Math.round(x + (w - textWidth(f, s, 0)) / 2), y, s, color, 255, 0);
}

export class Panels {
  private key = '';
  private score = ''; private ballLine = ''; private playerLine = ''; private rank = ''; private mission1 = ''; private mission2 = '';
  private progress = '';
  paused = false;

  constructor(public game: Game) {}

  /** The texts of the panels, again when the state they show changed. */
  private refresh(): void {
    const g = this.game, p = g.player, m = MISSIONS[p.mission];
    const key = `${p.score}/${p.ball}/${g.current}/${g.players.length}/${p.rank}/${p.mission}/${p.progress}`;
    if (key === this.key) return;
    this.key = key;
    this.score = `${p.score}`;
    this.ballLine = `BALL ${Math.min(p.ball, BALLS_PER_GAME)} / ${BALLS_PER_GAME}`;
    this.playerLine = g.players.length > 1 ? `PLAYER ${g.current + 1} / ${g.players.length}` : '';
    this.rank = RANKS[p.rank];
    const space = m.name.indexOf(' ');
    this.mission1 = space > 0 ? m.name.substring(0, space) : m.name;
    this.mission2 = space > 0 ? m.name.substring(space + 1) : '';
    this.progress = `${p.progress} / ${m.count}`;
  }

  top(eyes: Eyes): void {
    const g = this.game, w = width(), pw = TOP_PANEL_W;
    this.refresh();
    rect(0, 0, pw, height(), PANEL);
    rect(w - pw, 0, pw, height(), PANEL);
    rect(8, 6, pw - 16, 2, CYAN);
    rect(w - pw + 8, 6, pw - 16, 2, GOLD);
    rrect(4, 25, pw - 8, 24, 4, INK, 255);
    centred(small, 0, pw, 14, 'SCORE', DIM);
    centred(bold, 0, pw, 28, this.score, GOLD);
    if (g.phase !== PH_ATTRACT) {
      centred(small, 0, pw, 60, this.ballLine, WHITE);
      if (this.playerLine !== '') centred(small, 0, pw, 76, this.playerLine, WHITE);
    }
    centred(small, w - pw, pw, 14, 'RANK', DIM);
    centred(small, w - pw, pw, 30, this.rank, CYAN);
    centred(small, w - pw, pw, 60, 'MISSION', DIM);
    centred(small, w - pw, pw, 76, this.mission1, 0xff8a2a);
    centred(small, w - pw, pw, 90, this.mission2, 0xff8a2a);
    centred(small, w - pw, pw, 108, this.progress, WHITE);
    const mission = MISSIONS[g.player.mission], progress = Math.min(1, g.player.progress / mission.count);
    rect(w - pw + 8, 126, pw - 16, 3, INK);
    if (progress > 0) rect(w - pw + 8, 126, (pw - 16) * progress, 3, GOLD);
    if (g.multiball) centred(small, w - pw, pw, 140, 'MULTIBALL', g.time % 0.5 < 0.25 ? GOLD : RED);
    if (g.ballSave > 0) centred(small, 0, pw, 140, 'BALL SAVE', g.time % 0.5 < 0.25 ? GREEN : WHITE);
    this.band(eyes);
  }

  /** The game's messages, the attract mode's call, the initials: a band out of the screen at the top screen's foot. */
  private band(eyes: Eyes): void {
    const g = this.game, d = eyes.shift(DEPTH_BAND), w = width();
    let a = '', b = '', color: u32 = GOLD;
    if (this.paused) { a = 'PAUSED'; b = 'START: play on'; color = WHITE; }
    else if (g.phase === PH_ATTRACT) {
      if (g.time % 2 < 1.4) { a = 'NOVA PATROL DS'; b = 'START or tap the bottom screen'; color = CYAN; }
      else { a = 'PRESS START'; b = 'L / R flippers   B pulls the plunger'; }
    } else if (g.phase === PH_ENTRY) {
      a = `HIGH SCORE  ${g.entryNameText()}`;
      b = 'L / R: letter   B: next';
    } else if (g.tilted) { a = 'TILT'; color = RED; }
    else if (g.messageT > 0) { a = g.message; b = g.message2; }
    else if (g.phase === PH_OVER) { a = 'GAME OVER'; color = RED; }
    if (a === '') return;
    const y = height() - 52;
    rrect(TOP_PANEL_W + d, y, w - 2 * TOP_PANEL_W, 44, 0, INK, 210);
    centred(big, TOP_PANEL_W + d, w - 2 * TOP_PANEL_W, y + 4, a, color);
    if (b !== '') centred(small, TOP_PANEL_W + d, w - 2 * TOP_PANEL_W, y + 27, b, WHITE);
  }

  bottom(fps: string): void {
    const g = this.game, w = width(), h = height(), pw = BOTTOM_PANEL_W;
    rect(0, 0, pw, h, PANEL);
    rect(w - pw, 0, pw, h, PANEL);
    // the tilt meter fills from the foot; DANGER past the warning
    const tilt = Math.min(1, g.tiltMeter / 3.1);
    rect(8, 40, pw - 16, 150, INK);
    rect(8, 40 + 150 * (1 - tilt), pw - 16, 150 * tilt, g.danger > 0 ? RED : GREEN);
    centred(small, 0, pw, 196, 'TILT', DIM);
    centred(small, 0, pw, 218, fps, DIM);
    // the plunger's strip: how far it is pulled
    rect(w - pw + 8, 40, pw - 16, 150, INK);
    rect(w - pw + 8, 40, pw - 16, 150 * g.world.plungerPull, GOLD);
    centred(small, w - pw, pw, 196, 'PULL', DIM);
    if (g.phase === PH_PLAY && !g.launched) centred(small, w - pw, pw, 20, 'v', g.time % 0.5 < 0.25 ? GOLD : DIM);
  }
}
