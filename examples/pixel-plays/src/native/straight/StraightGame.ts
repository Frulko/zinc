import { PixelGame } from '../game';
import { unproject, project, R2, W, H, PX, PY, configureRenderer, setVegetation, setPixelOrigin } from '../renderer';
import { sound, setAmbience } from '../audio';
import {
  g, startGame, startWorld, walk, walkAuto, beginExit, crossExit, lookahead, needsJump, prune, dirty, setOrigin, xOf, yOf, SPEED, endingsFound, END_NAMES,
  KIND_BEACH, KIND_JUNGLE, VIEW_X, VIEW_Y, VIEW_W, VIEW_H, worldVersion,
} from './state';
import { PirateWorld, initModels, tileBounds } from './scenery';
import { ScrollLayer, BakeJob } from '../scroll';
import { drawScene, composeFade, GULL_CYCLE } from './render';

const FADE_SECONDS = .8;
const AHEAD = 70;            // chunks are baked this far (pixels) beyond the window, in the direction the pirate walks
const DEAD_X = 26, DEAD_Y = 14;   // the camera stands still while the pirate stays this close to its centre

export class StraightGame extends PixelGame {
  private left: boolean = false;
  private right: boolean = false;
  private up: boolean = false;
  private down: boolean = false;
  private pointing: boolean = false;
  private lastCycle: number = 0;
  private stepClock: number = 0;
  private layer: ScrollLayer = new ScrollLayer(new PirateWorld(), 128, 96, 12);
  private camX: number = 0;
  private camY: number = 0;
  private job: BakeJob | null = null;
  private jobWorld: number = -1;
  private loadedVersion: number = -1;
  private loadedX: number = 1e9;
  private loadedY: number = 1e9;
  private lastKind: string = '';
  private pointX: number = 0;
  private pointY: number = 0;
  constructor() {
    super('straight', 'DROIT DEVANT', 'Flèches / ZQSD : marcher · Glisser : guider le pirate · Entrée : recommencer');
    this.cropX = VIEW_X; this.cropY = VIEW_Y; this.cropWidth = VIEW_W; this.cropHeight = VIEW_H;
  }
  override init(): void {
    configureRenderer(-28, 1.3, -.12);
    setVegetation([[30, 58, 46], [44, 80, 50], [66, 104, 54], [104, 136, 60], [150, 168, 72]], [30, 66, 50], [54, 100, 56], [104, 142, 66]);
    initModels();
    this.left = false; this.right = false; this.up = false; this.down = false; this.pointing = false;
    this.restart();
  }
  override reset(): void { if (g.end > -1) this.again(); }
  /** A new world around the pirate: the first picture is baked at once, the rest ahead. */
  private restart(): void {
    startGame(); startWorld();
    this.layer = new ScrollLayer(new PirateWorld(), 128, 96, 12);
    this.job = null; this.loadedVersion = -1;
    this.follow(true);
    this.bakeNow();
    this.lastKind = '';
  }
  private again(): void {
    if (endingsFound() === 4 && !g.complete) { g.complete = true; g.completeTimeout = 1; sound('cheer', .9); return; }
    if (g.complete && g.completeTimeout > 0) return;
    if (g.complete) { g.complete = false; g.endings = [false, false, false, false]; }
    sound('screen', .4);
    this.restart();
  }
  /** The camera follows the pirate in whole pixels, with a dead zone; `snap` puts it right on him. */
  private follow(snap: boolean): void {
    setOrigin(g.tile.u0, g.tile.v0);
    const p = project(xOf(g.u, g.v), yOf(g.u, g.v), 0);
    setOrigin(0, 0);
    const px = p.sx + PX, py = p.sy + PY;   // the layer pixel of the pirate
    const tx = px - (VIEW_X + VIEW_W / 2), ty = py - (VIEW_Y + VIEW_H * .6);
    if (snap) { this.camX = Math.round(tx); this.camY = Math.round(ty); return; }
    this.camX = Math.round(Math.min(Math.max(this.camX, tx - DEAD_X), tx + DEAD_X));
    this.camY = Math.round(Math.min(Math.max(this.camY, ty - DEAD_Y), ty + DEAD_Y));
  }
  /** The world changed: bake again what the placed and removed tiles cover. */
  private refresh(): void {
    for (const t of dirty) {
      const b = tileBounds(t);
      this.layer.invalidate(b[0] - 130, b[1] - 130, b[2] + 130, b[3] + 130);
    }
    dirty.length = 0;
    this.job = null;
  }
  /** Bakes now every chunk the pirate can see: a first picture, or a jump hidden by the mist. */
  private bakeNow(): void {
    this.refresh();
    for (const c of this.layer.missing(this.camX + VIEW_X, this.camY + VIEW_Y, VIEW_W, VIEW_H, 0)) this.layer.bake(c[0], c[1]);
  }
  /** One slice of the bake ahead: the closest missing chunk of the window and a margin around it. */
  private bakeAhead(): void {
    if (dirty.length > 0) this.refresh();
    if (this.job !== null && this.jobWorld !== worldVersion) this.job = null;
    if (this.job === null) {
      const need = this.layer.missing(this.camX, this.camY, W, H, AHEAD);
      if (need.length === 0) { this.layer.drop(this.camX, this.camY, W, H, 400); return; }
      this.job = new BakeJob(need[0][0], need[0][1]); this.jobWorld = worldVersion;
    }
    if (this.layer.slice(this.job)) this.job = null;
  }
  override update(dt: number): void {
    if (g.complete) g.completeTimeout -= dt;
    if (g.phase === 'glide') {
      // a jump (back to the beach, a way back onto tiles in view): the walk goes on while the mist thickens, the world changes behind it
      g.time += dt; g.glide += dt / FADE_SECONDS; g.moving = true;
      if (!g.switched && g.glide >= .5) {
        crossExit(g.exitCode); g.switched = true;
        this.follow(true); this.bakeNow();
      }
      g.u += (g.dir === 1 ? 1 : g.dir === 3 ? -1 : 0) * SPEED * dt;
      g.v += (g.dir === 2 ? 1 : g.dir === 0 ? -1 : 0) * SPEED * dt;
      this.stepClock += dt;
      if (this.stepClock > .24) { this.stepClock = 0; g.events.push('step'); }
      if (g.glide >= 1) { g.glide = -1; g.moving = false; g.phase = g.win || g.backToBeach ? 'auto' : 'play'; }
    } else if (g.phase === 'play') {
      let du = (this.right ? 1 : 0) - (this.left ? 1 : 0), dv = (this.down ? 1 : 0) - (this.up ? 1 : 0);
      if (this.pointing && du === 0 && dv === 0) {
        const p = unproject(this.pointX, this.pointY);   // where the finger is on the screen, in the world as it is now
        const tu = (p.x - p.y) / R2 - g.tile.u0, tv = (p.x + p.y) / R2 - g.tile.v0;
        du = Math.abs(tu - g.u) < .3 ? 0 : tu > g.u ? 1 : -1;
        dv = Math.abs(tv - g.v) < .3 ? 0 : tv > g.v ? 1 : -1;
      }
      const code = walk(dt, du, dv);
      if (code >= 0) {
        if (needsJump(code)) beginExit(code);
        else { crossExit(code); if (g.win || g.backToBeach) g.phase = 'auto'; }
      } else lookahead();
    } else if (g.phase === 'auto') walkAuto(dt);
    else g.time += dt;
    if (g.phase !== 'glide' || g.switched) this.follow(false);
    this.bakeAhead();
    if (g.tile.kind !== this.lastKind) { this.lastKind = g.tile.kind; setAmbience(g.tile.kind === KIND_BEACH ? 'harbor' : 'jungle'); }
    const cycle = g.time % GULL_CYCLE;
    if (g.beach && (cycle < this.lastCycle || (this.lastCycle < 23 && cycle >= 23))) g.events.push('bird');
    this.lastCycle = cycle;
    this.sounds();
    this.words();
  }
  private sounds(): void {
    for (const e of g.events) {
      if (e === 'pickup') sound('point', .5);
      else if (e === 'screen') sound('throw', .35);
      else if (e === 'win') sound('cheer', .9);
      else if (e === 'empty') sound('soft', .6);
      else if (e === 'hit') sound('wood', .8);
      else if (e === 'step') sound('soft', .22);
      else if (e === 'wave') sound('splash', .3);
      else if (e === 'bird') sound('bird', .4);
    }
    g.events = [];
  }
  private words(): void {
    const found: string[] = [];
    for (let i = 0; i < 4; i++) if (g.endings[i]) found.push(END_NAMES[i]);
    this.score = 'FINS ' + endingsFound() + '/4' + (found.length > 0 ? ' · ' + found.join(' · ') : '');
    this.actionLabel = g.end > -1 ? 'REJOUER [ENTRÉE]' : '';
    if (g.complete) { this.status = 'Toutes les fins sont trouvées ! Entrée recommence tout, fins comprises.'; return; }
    if (g.end > -1) {
      this.status = g.end === 3 ? 'Le trésor ! Il suffisait d’aller tout droit, avec la pelle.'
        : g.end === 0 ? 'Le chemin secret… vous trichez avec panache.'
        : g.end === 1 ? 'Le coffre est vide : vous vous êtes perdu en route.' : 'Oublié quelque chose ? La pelle était sur la plage.';
      return;
    }
    if (g.tile.kind === KIND_BEACH && g.beach && g.tile.shovel) this.status = 'Le trésor est tout droit, vers l’est. Une pelle est plantée dans le sable.';
    else if (g.tile.kind === KIND_BEACH) this.status = 'La plage, encore. Cette fois, tout droit.';
    else if (g.tile.kind === KIND_JUNGLE && g.lost) this.status = 'Les sentiers se ressemblent… vous êtes perdu.';
    else this.status = 'Tout droit : ' + g.straight + ' sur 6. Les sentiers de côté mènent ailleurs.';
  }
  override draw(): void {
    setPixelOrigin(this.camX, this.camY);
    if (this.layer.version !== this.loadedVersion || this.camX !== this.loadedX || this.camY !== this.loadedY) {
      this.layer.load(this.camX, this.camY, VIEW_X - 8, VIEW_Y - 12, VIEW_X + VIEW_W + 8, VIEW_Y + VIEW_H + 8);
      this.loadedVersion = this.layer.version; this.loadedX = this.camX; this.loadedY = this.camY;
    }
    drawScene(this.layer, this.camX, this.camY);
    if (g.glide >= 0) composeFade(g.glide);
  }
  override pointer(x: number, y: number, phase: i32): void {
    if (phase === 0 || phase === 1) {
      this.pointX = x; this.pointY = y; this.pointing = true;   // kept on the screen: the world scrolls under the finger
    } else this.pointing = false;
  }
  override key(name: string, down: boolean): void {
    if (name === 'ArrowLeft' || name === 'a' || name === 'A' || name === 'q' || name === 'Q') this.left = down;
    else if (name === 'ArrowRight' || name === 'd' || name === 'D') this.right = down;
    else if (name === 'ArrowUp' || name === 'w' || name === 'W' || name === 'z' || name === 'Z') this.up = down;
    else if (name === 'ArrowDown' || name === 's' || name === 'S') this.down = down;
    else if (down && (name === 'Enter' || name === ' ') && g.end > -1) this.again();
    if (down) this.pointing = false;
  }
}
