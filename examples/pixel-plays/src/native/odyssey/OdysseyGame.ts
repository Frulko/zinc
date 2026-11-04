import { PixelGame } from '../game';
import { W, H, pix, zb, bakedPix, bakedZ, pendingShadows, configureRenderer, setLighting, copyInto, shadeEdges, project, unproject, rgb, sphere, hash } from '../renderer';
import { sound, setAmbience } from '../audio';
import { bakeSpace, drawStars, drawSun, inSlab } from './space';
import { bakeEarth, drawEarth } from './earth';
import { Ship, drawVessel, drawPod } from './ship';

const BASE_SPIN = .2;          // rad/s: one slow turn of the ship every half minute
const EARTH = { x: 252, y: 236, r: 84 };

export class OdysseyGame extends PixelGame {
  private ship: Ship = { x: -3.1, y: -.9, z: 3, roll: 0, time: 0, kind: 0 };
  private extra: number = 0;
  private eye: number = 0;
  private eyeUntil: number = -1;
  private lastX: number = -1;
  private dragging: boolean = false;
  private lastBlink: boolean = false;
  constructor() {
    super('odyssey', 'ODYSSÉE', 'Glisser : faire tourner le vaisseau · ← → : tourner · S : changer de vaisseau · Espace : allumer · R : recommencer');
    this.seasonNames = ['DISCOVERY', 'ENTERPRISE', 'FAUCON'];
    this.selectedSeason = 0;
    this.cropX = 15; this.cropY = 28; this.cropWidth = 330; this.cropHeight = 226;
  }
  override init(): void {
    configureRenderer(0, 1.3, -.12);
    setLighting([30, 34, 86], [255, 244, 214]);
    bakeSpace();
    bakeEarth(EARTH.x, EARTH.y, EARTH.r, -.42, inSlab);
    // the moon: the renderer's own sphere, placed from its screen position
    const m = unproject(300, 78);
    sphere(m.x, m.y, 0, 1.15, [168, 164, 160], 'rough');
    copyInto(bakedPix, pix); copyInto(bakedZ, zb);
    this.ship = { x: -3.1, y: -.9, z: 3, roll: 0, time: 0, kind: this.selectedSeason };
    this.extra = 0; this.eye = 0; this.eyeUntil = -1; this.dragging = false;
    setAmbience('space');
  }
  override season(index: i32): void {
    this.selectedSeason = index < 0 ? (this.selectedSeason + 1) % 3 : index;
    this.ship.kind = this.selectedSeason;
    sound('chime', .5);
  }
  private base(): number { return this.ship.kind > 0 ? .38 : BASE_SPIN; }
  override reset(): void { this.ship.roll = 0; this.extra = 0; }
  override update(dt: number): void {
    const ship = this.ship;
    ship.time += dt;
    ship.roll += (this.base() + this.extra) * dt;
    this.extra *= Math.max(0, 1 - dt * 1.1);
    this.eye = ship.time < this.eyeUntil ? 1 : 0;
    const turns = (this.base() + this.extra) * 60 / (Math.PI * 2);
    this.score = 'ORBITE BASSE · ROTATION ' + turns.toFixed(1).replace('.', ',') + ' tr/min';
    const kind = ship.kind;
    this.status = kind === 0 ? (this.eye > 0 ? 'Le voyant rouge de HAL s’illumine. Tout va bien, dit-il.' : 'Le vaisseau dérive en silence au-dessus de la Terre.')
      : kind === 1 ? (this.eye > 0 ? 'Les gondoles passent en rouge vif : prêt pour la distorsion.' : 'Un vaisseau d’exploration tourne lentement au-dessus de la Terre.')
      : (this.eye > 0 ? 'Les moteurs s’emballent : le Faucon est prêt à sauter.' : 'Un vieux cargo rond et rapiécé, encore en un seul morceau.');
  }
  override draw(): void {
    const ship = this.ship;
    const frame = Math.floor(ship.time * 12);
    copyInto(pix, bakedPix); copyInto(zb, bakedZ);
    pendingShadows.length = 0;
    drawEarth(ship.time * 1.4, ship.time * 2.6);
    drawStars(frame);
    drawSun(frame);
    // the pod circles the ship at a distance, tilted, a little behind and in front
    const a = ship.time * .33;
    if (ship.kind === 0) drawPod(this.ship.x + Math.cos(a) * 8.2, this.ship.y + Math.sin(a) * 4.6 - 2.2, this.ship.z + 1.4 + Math.sin(a * 1.7) * .8, a + 1.6);
    const blink = Math.floor(ship.time * 1.2) % 2 === 0;
    const lens = drawVessel(ship, blink, this.eye);
    shadeEdges();
    // the lens glows only while it faces us: its colour is still on screen
    const p = lens !== null ? project(lens[0], lens[1], lens[2]) : { sx: 0, sy: 0, d: 0 }, ix = Math.round(p.sx), iy = Math.round(p.sy);
    if (lens !== null && ix > 3 && ix < W - 3 && iy > 3 && iy < H - 3) {
      const c = pix[iy * W + ix];
      if ((c & 255) > 140 && (c >> 8 & 255) < 90) {
        const reach = this.eye > 0 ? 4 : 2;
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
          const d = Math.hypot(dx, dy);
          if (d > reach || d < 1.5) continue;
          if (hash(dx + ix, dy + iy + frame * (this.eye > 0 ? 1 : 0)) > .55) continue;
          pix[(iy + dy) * W + ix + dx] = d < 3 ? rgb(236, 70, 60) : rgb(130, 40, 56);
        }
      }
    }
  }
  override pointer(x: number, y: number, phase: i32): void {
    if (phase === 0) { this.dragging = true; this.lastX = x; }
    else if (phase === 1 && this.dragging) { this.extra = Math.max(-3, Math.min(3, this.extra + (x - this.lastX) * .05)); this.lastX = x; }
    else if (phase === 2 || phase === 3) this.dragging = false;
  }
  override key(name: string, down: boolean): void {
    if (!down) return;
    if (name === 'ArrowRight') this.extra = Math.min(3, this.extra + .5);
    else if (name === 'ArrowLeft') this.extra = Math.max(-3, this.extra - .5);
    else if (name === ' ') { this.eyeUntil = this.ship.time + 2.2; sound('chime', .7); }
  }
}
