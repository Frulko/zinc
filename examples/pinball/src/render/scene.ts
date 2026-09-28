// One frame of the table: the baked art as a single image, then what moves or lights up, back to front:
// lit inserts and light chases, flash rings and sparks, drop targets, the spinner, the plunger, the flippers, balls
// on the playfield and bumper caps sorted by depth (a cap hides a ball behind it), the plastic ramp and the wire
// habitrail over them, balls riding the ramps, the apron, score popups. A bump or a tilt shakes all of it (one
// translate). Everything but the art is a few dozen commands; the frame diff of zinc:gfx rasterizes only the
// rectangles where they changed.
import { drawImage, createImage, destroyImage, beginImage, endImage, pixelScale, polygon, stroke, rrect, gradient, translate,
  drawText, font, textWidth } from 'zinc:gfx';
import { clock } from 'zinc:sys';
import { Camera } from './camera';
import { pts, disc, ring, cylinder, flat, face, mix, line3 } from './draw';
import { Inserts } from './inserts';
import { paintTable } from './art';
import { TRAIL, GLOW } from './quality';
import { Game, PH_ATTRACT, C_PINK } from '../game/game';
import { Rail, RAIL_RAMP, RAIL_WIRE, TABLE_W, TABLE_L, SHOOTER_X } from '../table/layout';
import { Ball, BALL_R, Ramp } from '../physics/bodies';
import { Flipper } from '../physics/flipper';
import { PLUNGER_TRAVEL } from '../physics/world';
import { MISSIONS, M_RAMP, M_SPINNER, M_HOLE } from '../game/missions';

/** Camera pose: looking up the table from the player's side, like standing at the cabinet. */
const PITCH: number = 0.78;
const DISTANCE: number = 64;

const BUMPER_COLORS: u32[] = [0xff3b8a, 0x3fe7ff, 0xffb13b];

/** A ramp rail with the height of every point (from the ramp's centreline), for drawing. */
class RampRail {
  zs: number[] = [];
  constructor(public rail: Rail, ramp: Ramp) {
    for (let i: i32 = 0; i < rail.xs.length; i++) this.zs.push(heightOn(ramp, rail.xs[i], rail.ys[i]));
  }
}

function heightOn(r: Ramp, x: number, y: number): number {
  let best: number = 1e9, z: number = 0;
  for (let i: i32 = 0; i + 1 < r.xs.length; i++) {
    const ax = r.xs[i], ay = r.ys[i], dx = r.xs[i + 1] - ax, dy = r.ys[i + 1] - ay;
    const l2 = dx * dx + dy * dy;
    let u = l2 > 1e-6 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
    u = Math.max(0, Math.min(1, u));
    const ex = ax + dx * u - x, ey = ay + dy * u - y, d2 = ex * ex + ey * ey;
    if (d2 < best) { best = d2; z = r.zs[i] + (r.zs[i + 1] - r.zs[i]) * u; }
  }
  return z;
}

class Trail {
  xs: number[] = [];
  ys: number[] = [];
  rs: number[] = [];
}

export class Scene {
  cam = new Camera();
  inserts: Inserts;
  private image: i32 = -1;
  private imageScale: i32 = 0;
  private rampRails: RampRail[] = [];
  private wireRails: RampRail[] = [];
  private trails: Trail[] = [];
  private targetH: number[] = [0.9, 0.9, 0.9];
  private sprites: number[] = [];

  /** The table's screen rectangle. */
  constructor(public game: Game, public x: number, public y: number, public w: number, public h: number) {
    const t = game.table;
    this.cam.aim(TABLE_W / 2, TABLE_L * 0.56, PITCH, DISTANCE);
    this.cam.fit(-1.1, -0.9, TABLE_W + 1.1, TABLE_L + 0.6, 1.5, x, y, w, h);
    this.inserts = new Inserts(t);
    this.inserts.project(this.cam);
    for (const r of t.rails) {
      if (r.style === RAIL_RAMP) this.rampRails.push(new RampRail(r, t.ramp));
      if (r.style === RAIL_WIRE) this.wireRails.push(new RampRail(r, t.wire));
    }
    for (let i: i32 = 0; i < t.world.balls.length; i++) this.trails.push(new Trail());
  }

  /** Bakes the static art at the current pixel density (again if the window moved to another screen). */
  private bake(): void {
    const s = pixelScale();
    if (s === this.imageScale && this.image >= 0) return;
    if (this.image >= 0) destroyImage(this.image);
    this.imageScale = s;
    const iw: i32 = Math.ceil(this.w * s), ih: i32 = Math.ceil(this.h * s);
    const t0 = clock();
    this.image = createImage(iw, ih);
    beginImage(this.image);
    paintTable(this.cam.scaledInto(s, this.x, this.y), this.game.table, this.inserts, iw, ih, s);
    endImage();
    console.log(`pinball: table art baked at ${iw}x${ih} px in ${Math.round(clock() - t0)} ms`);
  }

  draw(): void {
    this.bake();
    const g = this.game, t = g.table, cam = this.cam;
    translate(g.fx.shakeX, g.fx.shakeY);
    drawImage(this.image, this.x, this.y, this.w, this.h, 255, 0);
    this.drawInserts();
    g.fx.drawLow(cam);
    this.drawTargets();
    this.drawSpinner();
    this.drawPlunger();
    this.drawHole();
    this.drawFlipper(t.left);
    this.drawFlipper(t.right);
    this.drawSlingFlash();

    // balls on the playfield and bumper caps, far to near
    const balls = t.world.balls;
    this.sprites.length = 0;
    for (let i: i32 = 0; i < balls.length; i++) if (balls[i].active && balls[i].layer === 0) { this.sprites.push(balls[i].y); this.sprites.push(i); }
    for (let i: i32 = 0; i < 3; i++) { this.sprites.push(t.bumpers[i].y + 0.4); this.sprites.push(100 + i); }
    // insertion sort of (depth, id) pairs: a handful of items
    for (let i: i32 = 2; i < this.sprites.length; i += 2) {
      for (let j: i32 = i; j >= 2 && this.sprites[j - 2] > this.sprites[j]; j -= 2) {
        const d = this.sprites[j], id = this.sprites[j + 1];
        this.sprites[j] = this.sprites[j - 2]; this.sprites[j + 1] = this.sprites[j - 1];
        this.sprites[j - 2] = d; this.sprites[j - 1] = id;
      }
    }
    for (let i: i32 = 0; i < this.sprites.length; i += 2) {
      const id: i32 = Math.round(this.sprites[i + 1]);
      if (id >= 100) this.drawBumper(id - 100); else this.drawBall(balls[id], this.trails[id]);
    }
    this.drawRamp();
    for (let i: i32 = 0; i < balls.length; i++) if (balls[i].active && balls[i].layer > 0) this.drawBall(balls[i], this.trails[i]);
    this.drawWire();
    this.drawApron();
    g.fx.drawHigh(cam);
    if (g.tilted) this.tiltVeil();
    translate(0, 0);
  }

  // ---------------------------------------------------------------- lights

  private drawInserts(): void {
    const g = this.game, ins = this.inserts, p = g.player, cam = this.cam;
    if (g.tilted) return;   // a tilted table goes dark
    const blink = Math.floor(g.time * 4) % 2 === 0, fast = Math.floor(g.time * 8) % 2 === 0;
    if (g.chase > 0 || g.phase === PH_ATTRACT) {
      // chase: a wave running up the table through every insert
      const phase = g.time * 14;
      for (const i of ins.all) {
        const k = Math.sin(i.y * 0.55 + phase + (g.phase === PH_ATTRACT ? i.x * 0.3 : 0));
        if (k > 0.35) Inserts.drawLit(i, cam, GLOW, Math.min(1, (k - 0.35) * 2));
      }
      return;
    }
    for (let i: i32 = 0; i < 3; i++) if (p.lanes[i] || (g.laneFlash > 0 && fast)) Inserts.drawLit(ins.lanes[i], cam, GLOW, 1);
    for (let i: i32 = 0; i < 3; i++) if (!g.table.targets[i].enabled) Inserts.drawLit(ins.targets[i], cam, GLOW, 1);
    for (let i: i32 = 0; i < 8; i++) {
      if (i < p.rank) Inserts.drawLit(ins.ranks[i], cam, GLOW, 1);
      else if (i === p.rank && blink) Inserts.drawLit(ins.ranks[i], cam, GLOW, 0.8);
    }
    const done = p.missionsDone % 7;
    for (let i: i32 = 0; i < 7; i++) {
      if (i < done) Inserts.drawLit(ins.missions[i], cam, GLOW, 1);
      else if (i === done && blink) Inserts.drawLit(ins.missions[i], cam, GLOW, 0.8);
    }
    for (let i: i32 = 0; i < 4; i++) if (p.bonusX >= i + 2) Inserts.drawLit(ins.bonusX[i], cam, GLOW, 1);
    for (let i: i32 = 0; i < 3; i++) if (p.holeSinks % 3 > i || g.multiball) Inserts.drawLit(ins.holeProgress[i], cam, GLOW, 1);
    if ((g.ballSave > 0 && (g.ballSave > 2 ? blink : fast)) || p.extraBalls > 0) Inserts.drawLit(ins.shootAgain, cam, GLOW, 1);
    if (p.extraLit && blink) Inserts.drawLit(ins.extra, cam, GLOW, 1);
    const m = MISSIONS[p.mission].kind;
    if ((m === M_RAMP || g.rampFlash > 0) && blink) Inserts.drawLit(ins.rampArrow, cam, GLOW, 1);
    if (g.multiball && fast) Inserts.drawLit(ins.jackpot, cam, GLOW, 1);
    if (m === M_SPINNER && blink) Inserts.drawLit(ins.spinnerArrow, cam, GLOW, 1);
    if ((m === M_HOLE || p.extraLit || (p.holeSinks % 3 === 2 && !g.multiball)) && blink) Inserts.drawLit(ins.holeArrow, cam, GLOW, 1);
  }

  private drawSlingFlash(): void {
    const g = this.game, t = g.table;
    for (let i: i32 = 0; i < 2; i++) {
      const f = g.slingFlash[i];
      if (f <= 0) continue;
      const s = t.slings[i];
      line3(this.cam, [s.ax, s.bx], [s.ay, s.by], 0.4, null, 0.35 * this.cam.k, 0xffe08a, Math.round(255 * f));
    }
  }

  // ---------------------------------------------------------------- mechanisms

  private drawTargets(): void {
    const t = this.game.table, cam = this.cam;
    for (let i: i32 = 0; i < 3; i++) {
      const g = t.targets[i];
      const want = g.enabled ? 0.9 : 0;
      this.targetH[i] += (want - this.targetH[i]) * 0.35;
      const hgt = this.targetH[i];
      if (hgt < 0.03) continue;
      // a block standing in its slot: the front face towards the field, the near end, the top
      const x0 = g.ax - 0.14, x1 = g.ax + 0.14;
      face(cam, x1, g.by, x1, g.ay, 0, hgt, 0xffc21f, 255);
      face(cam, x0, g.ay, x1, g.ay, 0, hgt, 0x9a7410, 255);
      flat(cam, [x0, x1, x1, x0], [g.by, g.by, g.ay, g.ay], hgt, 0xfff0b0, 255);
      face(cam, x1 + 0.005, (g.ay + g.by) / 2 - 0.25, x1 + 0.005, (g.ay + g.by) / 2 + 0.25, hgt * 0.3, hgt * 0.7, 0x3a2a05, 255);
    }
  }

  private drawSpinner(): void {
    const t = this.game.table, cam = this.cam, sp = t.spinner;
    const a = this.game.spinnerAngle, dy = Math.sin(a) * 0.55, dz = Math.cos(a) * 0.55;
    const ax = sp.ax + 0.12, bx = sp.ax + sp.len - 0.12, y = sp.ay, z = 1.2;
    pts.length = 0;
    cam.project(ax, y + dy, z + dz); pts.push(cam.x); pts.push(cam.y);
    cam.project(bx, y + dy, z + dz); pts.push(cam.x); pts.push(cam.y);
    cam.project(bx, y - dy, z - dz); pts.push(cam.x); pts.push(cam.y);
    cam.project(ax, y - dy, z - dz); pts.push(cam.x); pts.push(cam.y);
    const front = Math.cos(a) > 0;
    polygon(pts, front ? 0xd8dde8 : 0x7a8298, 255);
    stroke(pts, 1.2, 0x3a4058, 255, true);
    line3(cam, [ax - 0.1, bx + 0.1], [y, y], z, null, 2, 0xe8ecf4, 255);
  }

  private drawPlunger(): void {
    const w = this.game.world, cam = this.cam;
    const tipY = w.plungerRestY + w.plungerPull * PLUNGER_TRAVEL;
    // spring (compressed as the plunger is pulled), rod, rubber tip
    pts.length = 0;
    const coils: i32 = 9;
    for (let i: i32 = 0; i <= coils * 2; i++) {
      const yy = tipY + 0.35 + (TABLE_L - tipY - 0.35) * i / (coils * 2);
      cam.project(SHOOTER_X + (i % 2 === 0 ? -0.32 : 0.32), yy, 0.45); pts.push(cam.x); pts.push(cam.y);
    }
    stroke(pts, 1.6, 0x9aa4bc, 255, false);
    line3(cam, [SHOOTER_X, SHOOTER_X], [tipY + 0.2, TABLE_L], 0.45, null, 0.22 * cam.k, 0xd8dde8, 255);
    cylinder(cam, SHOOTER_X, tipY + 0.25, 0.1, 0.8, 0.5, 0x7a1020, 255);
    disc(cam, SHOOTER_X, tipY + 0.25, 0.8, 0.5, 0xd8203a, 255);
    disc(cam, SHOOTER_X - 0.12, tipY + 0.12, 0.81, 0.18, 0xffb0b8, 180);
  }

  private drawHole(): void {
    const g = this.game, h = g.table.hole, cam = this.cam;
    if (g.holeFlash <= 0) return;
    const k = g.holeFlash;
    // the wormhole swirls while it holds the ball
    for (let arm: i32 = 0; arm < 3; arm++) {
      pts.length = 0;
      for (let i: i32 = 0; i <= 14; i++) {
        const a = arm * Math.PI * 2 / 3 + i * 0.35 - g.time * 9, r = 0.3 + i * 0.07;
        cam.project(h.x + Math.cos(a) * r, h.y + Math.sin(a) * r, 0.02); pts.push(cam.x); pts.push(cam.y);
      }
      stroke(pts, 2.5, C_PINK, Math.round(220 * Math.min(1, k)), false);
    }
    if (GLOW) disc(cam, h.x, h.y, 0.02, 1.4, C_PINK, Math.round(50 * Math.min(1, k)));
  }

  private drawFlipper(f: Flipper): void {
    const cam = this.cam, a = f.angle;
    const c = Math.cos(a), s = Math.sin(a);
    // outline in table space: the back half of the pivot circle, the front half of the tip circle
    const xs: number[] = [], ys: number[] = [];
    for (let i: i32 = 0; i <= 8; i++) { const t = a + Math.PI / 2 + Math.PI * i / 8; xs.push(f.px + Math.cos(t) * f.r0); ys.push(f.py + Math.sin(t) * f.r0); }
    for (let i: i32 = 0; i <= 6; i++) { const t = a - Math.PI / 2 + Math.PI * i / 6; xs.push(f.tipX + Math.cos(t) * f.r1); ys.push(f.tipY + Math.sin(t) * f.r1); }
    const sx: number[] = [], sy: number[] = [];
    for (let i: i32 = 0; i < xs.length; i++) { sx.push(xs[i] + 0.2); sy.push(ys[i] + 0.14); }
    flat(cam, sx, sy, 0, 0x000000, 90);
    flat(cam, xs, ys, 0, 0x2a1016, 255);
    pts.length = 0;
    for (let i: i32 = 0; i < xs.length; i++) { cam.project(xs[i], ys[i], 0.28); pts.push(cam.x); pts.push(cam.y); }
    stroke(pts, 0.26 * cam.k, 0xc81d34, 255, true);
    flat(cam, xs, ys, 0.55, 0xf2f4fa, 255);
    // a highlight along the upper edge, the pivot bolt
    const side: number = c > 0 ? 1 : -1;   // the perpendicular that points up the table
    const ux = s * side, uy = -c * side;
    const hx: number[] = [f.px + ux * f.r0 * 0.55 + c * 0.2, f.tipX + ux * f.r1 * 0.55 - c * 0.1];
    const hy: number[] = [f.py + uy * f.r0 * 0.55 + s * 0.2, f.tipY + uy * f.r1 * 0.55 - s * 0.1];
    line3(cam, hx, hy, 0.56, null, 1.5, 0xffffff, 200);
    disc(cam, f.px, f.py, 0.56, 0.2, 0x9aa4bc, 255);
    disc(cam, f.px, f.py, 0.57, 0.1, 0xe8ecf4, 255);
  }

  private drawBumper(i: i32): void {
    const g = this.game, b = g.table.bumpers[i], cam = this.cam;
    const f = g.bumperFlash[i];
    const col = BUMPER_COLORS[i];
    if (f > 0 && GLOW) disc(cam, b.x, b.y, 0.4, 1.3 + f * 0.6, col, Math.round(70 * f));
    cylinder(cam, b.x, b.y, 0.32, 1.05, 0.86, mix(mix(col, 0x000000, 0.45), 0xffffff, f * 0.5), 255);
    disc(cam, b.x, b.y, 1.05, 0.86, mix(col, 0xffffff, 0.15 + f * 0.7), 255);
    ring(cam, b.x, b.y, 1.05, 0.86, 1.5, mix(col, 0xffffff, 0.6), 255);
    // a star on the cap
    pts.length = 0;
    for (let k: i32 = 0; k < 10; k++) {
      const r = k % 2 === 0 ? 0.55 : 0.24, t = -Math.PI / 2 + k * Math.PI / 5;
      cam.project(b.x + Math.cos(t) * r, b.y + Math.sin(t) * r, 1.06); pts.push(cam.x); pts.push(cam.y);
    }
    polygon(pts, mix(0xffffff, col, 0.3 - f * 0.3), 230);
    disc(cam, b.x - 0.3, b.y - 0.35, 1.07, 0.22, 0xffffff, 120 + Math.round(100 * f));
  }

  // ---------------------------------------------------------------- balls

  private drawBall(b: Ball, tr: Trail): void {
    const cam = this.cam;
    // shadow on the playfield (under a ramp, it falls on the playfield below)
    cam.project(b.x + 0.22 + b.z * 0.32, b.y + 0.16 + b.z * 0.22, 0);
    const rs = BALL_R * cam.k;
    rrect(cam.x - rs * 1.05, cam.y - rs * 0.62, rs * 2.1, rs * 1.24, rs * 0.62, 0x000000, Math.round(Math.max(40, 110 - b.z * 20)));
    cam.project(b.x, b.y, b.z + BALL_R);
    const x = cam.x, y = cam.y, r = BALL_R * cam.k;
    // motion trail at speed
    if (TRAIL > 0) {
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (!b.held && speed > 70) {
        const n = tr.xs.length;
        for (let i: i32 = 0; i < n; i++) {
          const k = (i + 1) / (n + 1);
          const rr = tr.rs[i] * (0.45 + 0.5 * k);
          rrect(tr.xs[i] - rr, tr.ys[i] - rr, rr * 2, rr * 2, rr, 0x9fd8ff, Math.round(70 * k * Math.min(1, (speed - 70) / 80)));
        }
      }
      tr.xs.push(x); tr.ys.push(y); tr.rs.push(r);
      if (tr.xs.length > TRAIL) { tr.xs.shift(); tr.ys.shift(); tr.rs.shift(); }
    }
    // chrome sphere: dark rim, a light-to-dark body, the playfield reflected below, specular highlights
    rrect(x - r, y - r, r * 2, r * 2, r, 0x23262f, 255);
    gradient(x - r * 0.93, y - r * 0.93, r * 1.86, r * 1.86, r * 0.93, 0xf6f8fc, 0x566078, true, 255);
    rrect(x - r * 0.78, y + r * 0.08, r * 1.56, r * 0.62, r * 0.31, 0x2a2a7a, 90);
    rrect(x - r * 0.72, y - r * 0.78, r * 0.98, r * 0.74, r * 0.37, 0xffffff, 70);
    rrect(x - r * 0.52, y - r * 0.6, r * 0.46, r * 0.34, r * 0.17, 0xffffff, 240);
  }

  // ---------------------------------------------------------------- ramps, apron

  private drawRamp(): void {
    const cam = this.cam;
    if (this.rampRails.length < 2) return;
    const a = this.rampRails[0], b = this.rampRails[1];
    // support posts
    for (let i: i32 = 2; i < a.rail.xs.length - 2; i += 5) {
      cam.project(a.rail.xs[i], a.rail.ys[i], 0);
      line3(cam, [a.rail.xs[i], a.rail.xs[i]], [a.rail.ys[i], a.rail.ys[i]], 0, [0, a.zs[i]], 0.12 * cam.k, 0x6c7690, 255);
    }
    // translucent floor between the rails
    pts.length = 0;
    for (let i: i32 = 0; i < a.rail.xs.length; i++) { cam.project(a.rail.xs[i], a.rail.ys[i], a.zs[i]); pts.push(cam.x); pts.push(cam.y); }
    for (let i: i32 = b.rail.xs.length - 1; i >= 0; i--) { cam.project(b.rail.xs[i], b.rail.ys[i], b.zs[i]); pts.push(cam.x); pts.push(cam.y); }
    polygon(pts, 0x2fb8ff, 70);
    // walls: a clear plastic band, bright top edges
    for (const r of this.rampRails) {
      for (let i: i32 = 0; i + 1 < r.rail.xs.length; i++) {
        pts.length = 0;
        cam.project(r.rail.xs[i], r.rail.ys[i], r.zs[i]); pts.push(cam.x); pts.push(cam.y);
        cam.project(r.rail.xs[i + 1], r.rail.ys[i + 1], r.zs[i + 1]); pts.push(cam.x); pts.push(cam.y);
        cam.project(r.rail.xs[i + 1], r.rail.ys[i + 1], r.zs[i + 1] + 0.55); pts.push(cam.x); pts.push(cam.y);
        cam.project(r.rail.xs[i], r.rail.ys[i], r.zs[i] + 0.55); pts.push(cam.x); pts.push(cam.y);
        polygon(pts, 0x7fe0ff, 45);
      }
      line3(cam, r.rail.xs, r.rail.ys, 0.55, r.zs, 2, 0xc8f4ff, 230);
      line3(cam, r.rail.xs, r.rail.ys, 0, r.zs, 1.5, 0x5fc8f0, 200);
    }
  }

  private drawWire(): void {
    const cam = this.cam;
    for (const r of this.wireRails) {
      line3(cam, r.rail.xs, r.rail.ys, 0.02, r.zs, 2.2, 0x3a4058, 255);
      line3(cam, r.rail.xs, r.rail.ys, 0, r.zs, 1.4, 0xe8ecf4, 255);
      line3(cam, r.rail.xs, r.rail.ys, 0.5, r.zs, 1.4, 0xe8ecf4, 255);
    }
    if (this.wireRails.length < 2) return;
    // hoops tying the four wires together
    const a = this.wireRails[0], b = this.wireRails[1];
    for (let i: i32 = 0; i < a.rail.xs.length; i++) {
      pts.length = 0;
      cam.project(a.rail.xs[i], a.rail.ys[i], a.zs[i] + 0.5); pts.push(cam.x); pts.push(cam.y);
      cam.project(a.rail.xs[i], a.rail.ys[i], a.zs[i]); pts.push(cam.x); pts.push(cam.y);
      cam.project(b.rail.xs[i], b.rail.ys[i], b.zs[i]); pts.push(cam.x); pts.push(cam.y);
      cam.project(b.rail.xs[i], b.rail.ys[i], b.zs[i] + 0.5); pts.push(cam.x); pts.push(cam.y);
      stroke(pts, 1.4, 0xb8c0d4, 255, false);
      line3(cam, [a.rail.xs[i], a.rail.xs[i]], [a.rail.ys[i], a.rail.ys[i]], 0, [0, a.zs[i]], 1.2, 0x6c7690, 200);
    }
  }

  private drawApron(): void {
    const cam = this.cam;
    const xs: number[] = [0.25, 6.0, 7.3, 12.3, 13.6, 19.1, 19.1, 0.25], ys: number[] = [40.35, 40.35, 41.2, 41.2, 40.35, 40.35, TABLE_L + 0.3, TABLE_L + 0.3];
    flat(cam, xs, ys, 0.5, 0x0d1230, 255);
    pts.length = 0;
    for (let i: i32 = 0; i < 6; i++) { cam.project(xs[i], ys[i], 0.5); pts.push(cam.x); pts.push(cam.y); }
    stroke(pts, 2.5, 0x9aa4bc, 255, false);
    stroke(pts, 1, 0xffffff, 200, false);
    const f = font('sans-bold', 12);
    cam.project(3.4, 41.4, 0.5);
    drawText(f, cam.x - textWidth(f, 'NOVA PATROL', 1) / 2, cam.y - 7, 'NOVA PATROL', 0x7fe0ff, 220, 1);
    cam.project(16.3, 41.4, 0.5);
    drawText(f, cam.x - textWidth(f, '3 BALLS', 1) / 2, cam.y - 7, '3 BALLS', 0xffd23f, 200, 1);
  }

  private tiltVeil(): void {
    rrect(this.x, this.y, this.w, this.h, 0, 0x000000, 110);
    const f = font('sans-bold', 40);
    const s = 'TILT';
    const blink = Math.floor(this.game.time * 3) % 2 === 0;
    if (blink) drawText(f, this.x + (this.w - textWidth(f, s, 4)) / 2, this.y + this.h * 0.42, s, 0xff3b3b, 255, 4);
  }
}
