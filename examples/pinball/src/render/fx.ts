// Short-lived effects in table coordinates: score popups that float up and fade, flash rings that grow from a
// bumper or a target, sparks, and the screen shake of a bump or a tilt. The game adds them; the scene draws them.
// Pools of fixed size (quality.ts sets how many sparks), nothing allocated per frame.
import { drawText, font, textWidth, stroke, rrect } from 'zinc:gfx';
import { Camera } from './camera';
import { MAX_SPARKS } from './quality';

class Popup { x: number = 0; y: number = 0; age: number = 9; text: string = ''; color: u32 = 0; big: boolean = false; }
class Ring { x: number = 0; y: number = 0; z: number = 0; age: number = 9; color: u32 = 0; size: number = 1; }
class Spark { x: number = 0; y: number = 0; z: number = 0; vx: number = 0; vy: number = 0; vz: number = 0; age: number = 9; color: u32 = 0; }

const POPUP_LIFE: number = 1.1;
const RING_LIFE: number = 0.45;
const SPARK_LIFE: number = 0.6;
const CIRCLE_N: i32 = 18;
const cosT: number[] = [], sinT: number[] = [];
for (let i: i32 = 0; i <= CIRCLE_N; i++) { cosT.push(Math.cos(Math.PI * 2 * i / CIRCLE_N)); sinT.push(Math.sin(Math.PI * 2 * i / CIRCLE_N)); }

export class Effects {
  popups: Popup[] = [];
  rings: Ring[] = [];
  sparks: Spark[] = [];
  private nextPopup: i32 = 0;
  private nextRing: i32 = 0;
  private nextSpark: i32 = 0;
  /** Screen shake: amplitude in pixels, decaying. */
  shake: number = 0;
  shakeX: number = 0;
  shakeY: number = 0;
  private time: number = 0;
  private pts: number[] = [];

  constructor() {
    for (let i: i32 = 0; i < 12; i++) this.popups.push(new Popup());
    for (let i: i32 = 0; i < 12; i++) this.rings.push(new Ring());
    for (let i: i32 = 0; i < MAX_SPARKS; i++) this.sparks.push(new Spark());
  }

  popup(text: string, x: number, y: number, color: u32, big: boolean): void {
    const p = this.popups[this.nextPopup];
    this.nextPopup = (this.nextPopup + 1) % this.popups.length;
    p.text = text; p.x = x; p.y = y; p.color = color; p.age = 0; p.big = big;
  }

  ring(x: number, y: number, z: number, size: number, color: u32): void {
    const r = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % this.rings.length;
    r.x = x; r.y = y; r.z = z; r.size = size; r.color = color; r.age = 0;
  }

  burst(x: number, y: number, z: number, n: i32, speed: number, color: u32): void {
    for (let i: i32 = 0; i < n && this.sparks.length > 0; i++) {
      const s = this.sparks[this.nextSpark];
      this.nextSpark = (this.nextSpark + 1) % this.sparks.length;
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.6);
      s.x = x; s.y = y; s.z = z; s.vx = Math.cos(a) * v; s.vy = Math.sin(a) * v; s.vz = 4 + Math.random() * 8;
      s.age = 0; s.color = color;
    }
  }

  bump(amount: number): void { this.shake = Math.max(this.shake, amount); }

  update(dt: number): void {
    this.time += dt;
    for (const p of this.popups) p.age += dt;
    for (const r of this.rings) r.age += dt;
    for (const s of this.sparks) {
      if (s.age >= SPARK_LIFE) continue;
      s.age += dt;
      s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.vz -= 40 * dt;
      if (s.z < 0) { s.z = 0; s.vz = -s.vz * 0.4; }
    }
    this.shake *= Math.exp(-dt * 9);
    if (this.shake < 0.3) this.shake = 0;
    this.shakeX = Math.sin(this.time * 71) * this.shake;
    this.shakeY = Math.cos(this.time * 53) * this.shake * 0.6;
  }

  /** Rings and sparks: on the playfield, under the balls. */
  drawLow(cam: Camera): void {
    for (const r of this.rings) {
      if (r.age >= RING_LIFE) continue;
      const k = r.age / RING_LIFE;
      const rad = r.size * (0.6 + k * 1.4);
      this.pts.length = 0;
      for (let i: i32 = 0; i <= CIRCLE_N; i++) { cam.project(r.x + cosT[i] * rad, r.y + sinT[i] * rad, r.z); this.pts.push(cam.x); this.pts.push(cam.y); }
      stroke(this.pts, 2.5 * (1 - k) + 1, r.color, Math.round(230 * (1 - k)), true);
    }
    for (const s of this.sparks) {
      if (s.age >= SPARK_LIFE) continue;
      cam.project(s.x, s.y, s.z);
      const sz = Math.max(1.5, 0.12 * cam.k);
      rrect(cam.x - sz / 2, cam.y - sz / 2, sz, sz, sz / 2, s.color, Math.round(255 * (1 - s.age / SPARK_LIFE)));
    }
  }

  /** Score popups: above everything on the table. */
  drawHigh(cam: Camera): void {
    const small = font('sans-bold', 16), large = font('sans-bold', 24);
    for (const p of this.popups) {
      if (p.age >= POPUP_LIFE) continue;
      const k = p.age / POPUP_LIFE;
      cam.project(p.x, p.y, 1.5 + k * 3);
      const f = p.big ? large : small;
      const w = textWidth(f, p.text, 0);
      const a: i32 = Math.round(255 * Math.min(1, (1 - k) * 2.5));
      drawText(f, cam.x - w / 2 + 1, cam.y - 8 + 1, p.text, 0x000000, a / 2, 0);
      drawText(f, cam.x - w / 2, cam.y - 8, p.text, p.color, a, 0);
    }
  }
}
