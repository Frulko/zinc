// One screen's half of the table: its baked picture, then what moves or lights up over it. The top screen holds the upper half (lanes,
// bumpers, the wormhole, the targets, the spinner, the ramp's top) in stereo 3D; the bottom one the lower half (slingshots, flippers, the
// plunger, the drain). A ball near the cut is drawn by both, so it rolls from one screen to the other.
// Everything here is a command the 3DS's GPU replay draws: images, rectangles, text, and shapes that do not change from frame to frame
// (each is rasterized once into the shape atlas): lamps at their place, discs on whole pixels, the flippers at one of FLIP_STEPS angles.
import { recoil } from '../../pinball-kit/feedback';
import { interpolate } from '../../pinball-kit/clock';
import { drawImage, image, rect, rrect, polygon, translate, drawText, font, textWidth, pixelScale } from 'zinc:gfx';
import { Camera } from '../../pinball/src/render/camera';
import { pts, keepPts } from '../../pinball/src/render/draw';
import { Inserts, Insert } from '../../pinball/src/render/inserts';
import { Game, PH_ATTRACT } from '../../pinball/src/game/game';
import { MISSIONS, M_RAMP, M_SPINNER, M_HOLE } from '../../pinball/src/game/missions';
import { Flipper } from '../../pinball-kit/physics/flipper';
import { BALL_R } from '../../pinball-kit/physics/bodies';
import { PLUNGER_TRAVEL } from '../../pinball-kit/physics/world';
import { SHOOTER_X, TABLE_L } from '../../pinball/src/table/layout';
import { Eyes } from '../../n3ds-kit/stereo';
import { topDown, bakeHalf } from './art';
import { SPLIT, DEPTH_CAP, DEPTH_PER_INCH, DEPTH_POPUP, PINK, CYAN } from './constants';

const FLIP_STEPS: i32 = 10;          // the flipper drawn at 11 angles from rest to up
const POPUP_LIFE = 1.1, SPARK_LIFE = 0.6;   // as examples/pinball/src/render/fx.ts
const ball = image('kenney/ballGrey.png');
const star = image('kenney/particleSmallStar.png');
const bumperCap = image('bumper-cap.png');
const popupFont = font('sans-bold', 12);

/** A flipper's outline at an angle: the back half of its pivot circle, the front half of its tip (as the desktop scene draws it), grown by g. */
function flipperOutline(cam: Camera, f: Flipper, a: number, g: number): number[] {
  const c = Math.cos(a), s = Math.sin(a), tx = f.px + c * f.len, ty = f.py + s * f.len;
  pts.length = 0;
  for (let i: i32 = 0; i <= 8; i++) { const t = a + Math.PI / 2 + Math.PI * i / 8; cam.project(f.px + Math.cos(t) * (f.r0 + g), f.py + Math.sin(t) * (f.r0 + g), 0); pts.push(Math.round(cam.x)); pts.push(Math.round(cam.y)); }
  for (let i: i32 = 0; i <= 6; i++) { const t = a - Math.PI / 2 + Math.PI * i / 6; cam.project(tx + Math.cos(t) * (f.r1 + g), ty + Math.sin(t) * (f.r1 + g), 0); pts.push(Math.round(cam.x)); pts.push(Math.round(cam.y)); }
  return keepPts();
}

export class Half {
  cam: Camera;
  inserts: Inserts;
  art: i32 = -1;
  private rubber: number[][][] = [[], []];   // per flipper, per step: the red rubber, then the white body
  private body: number[][][] = [[], []];
  private slings: number[][] = [];
  private flippers: Flipper[];

  /** `lower`: the bottom screen's half. */
  constructor(public game: Game, public lower: boolean, public w: number, public h: number) {
    this.cam = topDown(this.centre(), w / 2, h / 2, 1);
    const t = game.table;
    this.inserts = new Inserts(t);
    this.inserts.project(this.cam);
    const flips: Flipper[] = [t.left, t.right];
    this.flippers = flips;
    for (let k: i32 = 0; k < 2; k++) {
      const f = flips[k];
      for (let i: i32 = 0; i <= FLIP_STEPS; i++) {
        const a = f.rest + (f.up - f.rest) * i / FLIP_STEPS;
        this.rubber[k].push(flipperOutline(this.cam, f, a, 0.1));
        this.body[k].push(flipperOutline(this.cam, f, a, -0.05));
      }
    }
    for (const s of t.slings) {   // the kicking edge of a slingshot, as a thin band that flashes
      pts.length = 0;
      const nx = s.nx * 0.3, ny = s.ny * 0.3;
      this.cam.project(s.ax, s.ay, 0); pts.push(Math.round(this.cam.x)); pts.push(Math.round(this.cam.y));
      this.cam.project(s.bx, s.by, 0); pts.push(Math.round(this.cam.x)); pts.push(Math.round(this.cam.y));
      this.cam.project(s.bx + nx, s.by + ny, 0); pts.push(Math.round(this.cam.x)); pts.push(Math.round(this.cam.y));
      this.cam.project(s.ax + nx, s.ay + ny, 0); pts.push(Math.round(this.cam.x)); pts.push(Math.round(this.cam.y));
      this.slings.push(keepPts());
    }

  }

  /** The table y at the screen's centre. */
  centre(): number { return this.lower ? SPLIT * 1.5 : SPLIT * 0.5; }
  /** Whether the table row y (with a margin of m inches) shows on this screen. */
  shows(y: number, m: number): boolean { return this.lower ? y > SPLIT - m : y < SPLIT + m; }

  bake(): void { if (this.art < 0) this.art = bakeHalf(this.game.table, this.centre(), this.w, this.h, pixelScale()); }

  /** The frame of this screen; `eyes` on the top screen (stereo), null on the bottom one. */
  draw(eyes: Eyes | null): void {
    const g = this.game;
    const sx = Math.round(g.fx.shakeX), sy = Math.round(g.fx.shakeY);
    translate(sx, sy);
    drawImage(this.art, 0, 0, this.w, this.h, 255, 0);
    this.lights();
    if (this.lower) this.lowerParts(); else this.upperParts(eyes, sx, sy);
    this.balls(eyes, sx, sy);
    this.effects(eyes, sx, sy);
    translate(0, 0);
  }

  /** A lit lamp, when its outline is on this screen (a shape wholly above or below the surface is one the GPU replay cannot place). */
  private lit(i: Insert, level: number): void {
    let y0: number = 1e9, y1: number = -1e9;
    for (let k: i32 = 1; k < i.screen.length; k += 2) { y0 = Math.min(y0, i.screen[k]); y1 = Math.max(y1, i.screen[k]); }
    if (y1 < 1 || y0 > this.h - 1) return;
    Inserts.drawLit(i, this.cam, false, level);   // ponytail: no glow halos on the 3DS (a second shape per lamp)
  }

  /** The lamps, from the game's state (the desktop scene's rules). */
  private lights(): void {
    const g = this.game, ins = this.inserts, p = g.player;
    if (g.tilted) return;
    const blink = Math.floor(g.time * 4) % 2 === 0, fast = Math.floor(g.time * 8) % 2 === 0;
    if (g.chase > 0 || g.phase === PH_ATTRACT) {   // a wave running up the table
      const phase = g.time * 14;
      for (const i of ins.all) {
        const k = Math.sin(i.y * 0.55 + phase + (g.phase === PH_ATTRACT ? i.x * 0.3 : 0));
        if (k > 0.35) this.lit(i, Math.min(1, (k - 0.35) * 2));
      }
      return;
    }
    for (let i: i32 = 0; i < 3; i++) if (p.lanes[i] || (g.laneFlash > 0 && fast)) this.lit(ins.lanes[i], 1);
    for (let i: i32 = 0; i < 3; i++) if (!g.table.targets[i].enabled) this.lit(ins.targets[i], 1);
    for (let i: i32 = 0; i < 8; i++) {
      if (i < p.rank) this.lit(ins.ranks[i], 1);
      else if (i === p.rank && blink) this.lit(ins.ranks[i], 0.8);
    }
    const done = p.missionsDone % 7;
    for (let i: i32 = 0; i < 7; i++) {
      if (i < done) this.lit(ins.missions[i], 1);
      else if (i === done && blink) this.lit(ins.missions[i], 0.8);
    }
    for (let i: i32 = 0; i < 4; i++) if (p.bonusX >= i + 2) this.lit(ins.bonusX[i], 1);
    for (let i: i32 = 0; i < 3; i++) if (p.holeSinks % 3 > i || g.multiball) this.lit(ins.holeProgress[i], 1);
    if ((g.ballSave > 0 && (g.ballSave > 2 ? blink : fast)) || p.extraBalls > 0) this.lit(ins.shootAgain, 1);
    if (p.extraLit && blink) this.lit(ins.extra, 1);
    const m = MISSIONS[p.mission].kind;
    if ((m === M_RAMP || g.rampFlash > 0) && blink) this.lit(ins.rampArrow, 1);
    if (g.multiball && fast) this.lit(ins.jackpot, 1);
    if (m === M_SPINNER && blink) this.lit(ins.spinnerArrow, 1);
    if ((m === M_HOLE || p.extraLit || (p.holeSinks % 3 === 2 && !g.multiball)) && blink) this.lit(ins.holeArrow, 1);
  }

  /** The drop targets, the spinner's blade, the wormhole's glow and the pop bumpers' caps (out of the screen). */
  private upperParts(eyes: Eyes | null, sx: number, sy: number): void {
    const g = this.game, t = g.table, cam = this.cam;
    for (const tg of t.targets) {
      if (!tg.enabled) continue;
      cam.project(tg.ax - 0.14, tg.by, 0);
      const x0 = cam.x, y0 = cam.y;
      cam.project(tg.ax + 0.14, tg.ay, 0);
      rect(x0, y0, cam.x - x0, cam.y - y0, 0xffc21f);
      rect(cam.x - 1, y0, 1, cam.y - y0, 0xfff0b0);
    }
    const sp = t.spinner, blade = Math.abs(Math.cos(g.spinnerAngle)) * 0.5 + 0.06;
    cam.project(sp.ax + 0.12, sp.ay - blade, 0);
    const bx = cam.x, by = cam.y;
    cam.project(sp.ax + sp.len - 0.12, sp.ay + blade, 0);
    rect(bx, by, cam.x - bx, cam.y - by, Math.cos(g.spinnerAngle) > 0 ? 0xd8dde8 : 0x7a8298);
    if (g.holeFlash > 0) {
      cam.project(t.hole.x, t.hole.y, 0);
      rrect(Math.round(cam.x) - 11, Math.round(cam.y) - 11, 22, 22, 11, PINK, Math.round(160 * Math.min(1, g.holeFlash)));
    }
    const d = eyes !== null ? eyes.shift(DEPTH_CAP) : 0;
    translate(sx + d, sy);
    for (let i: i32 = 0; i < 3; i++) {
      const b = t.bumpers[i], f = g.bumperFlash[i];
      cam.project(b.x, b.y, 0);
      const x = Math.round(cam.x), y = Math.round(cam.y);
      if (f > 0) rrect(x - 12, y - 12, 24, 24, 12, CYAN, Math.round(f * 130));
      const drop = Math.round(recoil(f) * 2);
      drawImage(bumperCap, x - 11, y - 11 + drop, 22, 22, 255, 0);
    }
    translate(sx, sy);
  }

  /** The slingshots' flash, the flippers and the plunger. */
  private lowerParts(): void {
    const g = this.game, t = g.table, w = g.world, cam = this.cam;
    for (let i: i32 = 0; i < 2; i++) if (g.slingFlash[i] > 0) polygon(this.slings[i], 0xffe08a, Math.round(255 * g.slingFlash[i]));
    const flips = this.flippers;
    for (let k: i32 = 0; k < 2; k++) {
      const step: i32 = Math.round(Math.max(0, Math.min(1, flips[k].lift())) * FLIP_STEPS);
      polygon(this.rubber[k][step], 0xc81d34, 255);
      polygon(this.body[k][step], 0xf2f4fa, 255);
    }
    const tipY = w.plungerRestY + w.plungerPull * PLUNGER_TRAVEL;
    cam.project(SHOOTER_X, tipY, 0);
    const px = Math.round(cam.x), py = Math.round(cam.y);
    cam.project(SHOOTER_X, TABLE_L, 0);
    rect(px - 1, py + 4, 3, cam.y - py - 4, 0xd8dde8);
    rrect(px - 5, py, 10, 6, 3, 0xd8203a, 255);
  }

  /** The balls: on the playfield, on the ramp (bigger, out of the screen as they climb). */
  private balls(eyes: Eyes | null, sx: number, sy: number): void {
    const cam = this.cam, alpha = this.game.alpha();
    for (const b of this.game.world.balls) {
      if (!b.active || !this.shows(b.y, 1)) continue;
      cam.project(interpolate(b.previousX, b.x, alpha), interpolate(b.previousY, b.y, alpha), interpolate(b.previousZ, b.z, alpha) + BALL_R);
      const r = BALL_R * cam.k + 0.5;
      const d = eyes !== null ? eyes.shift(b.z * DEPTH_PER_INCH) : 0;
      drawImage(ball, cam.x - r + d, cam.y - r, r * 2, r * 2, 255, 0);
    }
  }

  /** Sparks and score popups (the popups out of the screen). */
  private effects(eyes: Eyes | null, sx: number, sy: number): void {
    const fx = this.game.fx, cam = this.cam;
    for (const s of fx.sparks) {
      if (s.age >= SPARK_LIFE || !this.shows(s.y, 0.5)) continue;
      cam.project(s.x, s.y, s.z);
      drawImage(star, Math.round(cam.x) - 3, Math.round(cam.y) - 3, 6, 6, Math.round(255 * (1 - s.age / SPARK_LIFE)), 0);
    }
    const d = eyes !== null ? eyes.shift(DEPTH_POPUP) : 0;
    for (const p of fx.popups) {
      if (p.age >= POPUP_LIFE || !this.shows(p.y, 1)) continue;
      const k = p.age / POPUP_LIFE;
      cam.project(p.x, p.y - k * 1.5, 0);
      const wdt = textWidth(popupFont, p.text, 0);
      drawText(popupFont, Math.round(cam.x - wdt / 2) + d, Math.round(cam.y - 8), p.text, p.color, Math.round(255 * Math.min(1, (1 - k) * 2.5)), 0);
    }
  }
}

