// zinc:map: interactive vector maps. Mapbox Vector Tiles from an offline z/x/y.pbf directory and/or an online source
// (zinc:net, with an on-disk cache), drawn with a MapLibre style subset. The C++ engine renders each tile once into a
// cached image, so panning costs blits; labels are placed on screen each frame with collision.
// Gestures: drag (with inertia), wheel / trackpad pinch, double-click or double-tap, two-finger pan and pinch zoom.
// Font sizes baked for labels: text-xs text-sm text-base text-lg text-xl (the resource baker reads this comment).
import Engine from './native/map.spec';
import { OSM_STYLE } from './style';
import { exists, readText, writeText, mkdir } from 'zinc:fs';
import { fetch } from 'zinc:net';
import { isDown, Btn } from 'zinc:gfx';
import { Gestures } from 'zinc:gestures';

/** The bundled OSM-like style (JSON). */
export const DEFAULT_STYLE = OSM_STYLE;

/** Letters baked into the label fonts beyond ASCII (the resource baker reads string literals). */
export const LABEL_CHARS = 'àáâãäåæçèéêëìíîïñòóôõöøœùúûüýÿÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØŒÙÚÛÜÝßăąćčďđęěğıłńňőřśşšţťůűźżžĂĄĆČĎĐĘĚĞİŁŃŇŐŘŚŞŠŢŤŮŰŹŻŽ’–';

/** Web Mercator: longitude/latitude <-> world coordinates in 0..1. */
export function lonToX(lon: number): number { return (lon + 180) / 360; }
export function latToY(lat: number): number {
  const s = Math.sin(lat * Math.PI / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}
export function xToLon(x: number): number { return x * 360 - 180; }
export function yToLat(y: number): number {
  const n = Math.PI - 2 * Math.PI * y;
  return 180 / Math.PI * Math.atan2(0.5 * (Math.exp(n) - Math.exp(-n)), 1);
}
/** Ground resolution (metres per pixel) at a latitude and zoom, 512 px tiles. */
export function metersPerPixel(lat: number, zoom: number): number {
  return 40075016.686 * Math.cos(lat * Math.PI / 180) / (512 * Math.pow(2, zoom));
}

export interface MapOptions {
  /** Offline tiles: directory holding z/x/y.pbf (uncompressed, see tools/fetch-tiles.mjs). "" = none. */
  tiles: string;
  /** Online tiles: "https://.../{z}/{x}/{y}.pbf" or a TileJSON URL. "" = offline only. */
  url: string;
  /** Directory for downloaded tiles ("" = no disk cache). */
  cache: string;
  /** Zoom range of the tile source; deeper zooms overzoom the maxZoom tiles. */
  sourceMinZoom: i32;
  sourceMaxZoom: i32;
  /** Style JSON; DEFAULT_STYLE when "". */
  style: string;
}

export class MapView {
  /** Centre in Web Mercator world coordinates (0..1) and zoom. */
  x = 0.5;
  y = 0.5;
  zoom = 2;
  minZoom = 0;
  maxZoom = 19;
  /** True while the map moves (drag, inertia, animation): tiles are scaled with the fast filter. */
  moving = false;
  /** Tiles still loading or rendering after the last draw. */
  pending: i32 = 0;
  readonly gestures = new Gestures();

  private opts: MapOptions;
  private tileUrl = '';
  private inflight: i32 = 0;
  private vx = 0;
  private vy = 0;
  private still = 0;
  private animT = -1;
  private fromX = 0;
  private fromY = 0;
  private fromZ = 0;
  private toX = 0;
  private toY = 0;
  private toZ = 0;
  private vw = 0;
  private vh = 0;

  constructor(opts: MapOptions) {
    this.opts = opts;
    const err = Engine.setStyle(opts.style === '' ? DEFAULT_STYLE : opts.style);
    if (err !== '') console.error(`zinc:map: ${err}`);
    Engine.setSourceZoom(opts.sourceMinZoom, opts.sourceMaxZoom);
    if (opts.url.includes('{z}')) this.tileUrl = opts.url;
  }

  get lat(): number { return yToLat(this.y); }
  get lon(): number { return xToLon(this.x); }

  setView(lat: number, lon: number, zoom: number): void {
    this.x = lonToX(lon); this.y = latToY(lat); this.zoom = this.clampZoom(zoom);
    this.animT = -1; this.vx = 0; this.vy = 0;
  }
  /** Animated move (about 0.8 s). */
  flyTo(lat: number, lon: number, zoom: number): void {
    this.animate(lonToX(lon), latToY(lat), this.clampZoom(zoom));
  }
  /** Animated zoom by `dz` keeping the screen point (fx, fy) fixed. */
  zoomAround(dz: number, fx: number, fy: number): void {
    const z = this.clampZoom(Math.round(this.zoom + dz));
    const k = 1 / (512 * Math.pow(2, this.zoom)) - 1 / (512 * Math.pow(2, z));
    this.animate(this.x + (fx - this.vw / 2) * k, this.y + (fy - this.vh / 2) * k, z);
  }

  /** Input, inertia, animation and tile loading for the viewport (x, y, w, h). */
  update(dt: number, x: number, y: number, w: number, h: number): void {
    this.vw = w; this.vh = h;
    const g = this.gestures;
    g.update(dt, x, y, w, h);
    const fx = g.x - x, fy = g.y - y;
    let interacting = g.active || g.scale !== 1;
    if (g.active || g.scale !== 1) this.animT = -1;
    if (g.active) { this.panBy(g.dx, g.dy); this.vx = 0; this.vy = 0; }
    if (g.scale !== 1) this.zoomAt(Math.log(g.scale) / Math.log(2), fx, fy);
    if (g.released && !g.tap) { this.vx = g.vx; this.vy = g.vy; }
    if (g.doubleTap) this.zoomAround(1, fx, fy);
    // keyboard: arrows pan, Q/E zoom
    const kx = (isDown(Btn.Left) ? 1 : 0) - (isDown(Btn.Right) ? 1 : 0), ky = (isDown(Btn.Up) ? 1 : 0) - (isDown(Btn.Down) ? 1 : 0);
    if (kx !== 0 || ky !== 0) { this.panBy(kx * 400 * dt, ky * 400 * dt); interacting = true; this.animT = -1; }
    if (isDown(Btn.R)) { this.zoomAt(1.5 * dt, w / 2, h / 2); interacting = true; }
    if (isDown(Btn.L)) { this.zoomAt(-1.5 * dt, w / 2, h / 2); interacting = true; }
    // inertia
    if (!g.active && (this.vx !== 0 || this.vy !== 0)) {
      this.panBy(this.vx * dt, this.vy * dt);
      const decay = Math.exp(-4 * dt);
      this.vx *= decay; this.vy *= decay;
      if (Math.abs(this.vx) + Math.abs(this.vy) < 20) { this.vx = 0; this.vy = 0; }
    }
    // animation (fly / zoom steps)
    if (this.animT >= 0) {
      this.animT = Math.min(1, this.animT + dt / 0.8);
      const t = this.animT < 0.5 ? 2 * this.animT * this.animT : 1 - Math.pow(-2 * this.animT + 2, 2) / 2;
      this.x = this.fromX + (this.toX - this.fromX) * t;
      this.y = this.fromY + (this.toY - this.fromY) * t;
      this.zoom = this.fromZ + (this.toZ - this.fromZ) * t;
      if (this.animT >= 1) this.animT = -1;
    }
    // at rest, settle on an integer zoom: tiles are then blitted 1:1 (sharp and fast)
    this.still = interacting || this.vx !== 0 || this.vy !== 0 || this.animT >= 0 ? 0 : this.still + dt;
    if (this.still > 0.3 && Math.abs(this.zoom - Math.round(this.zoom)) > 0.001) this.zoomAround(Math.round(this.zoom) - this.zoom, g.x - x, g.y - y);
    this.moving = this.still === 0;
    this.pump();
  }

  /** Draws the map into the viewport. */
  draw(x: number, y: number, w: number, h: number): void {
    this.pending = Engine.draw(this.x, this.y, this.zoom, x, y, w, h, this.moving);
  }

  /** Renderer statistics since the last call (tiles rendered, time, labels). */
  stats(): string { return Engine.stats(); }

  private clampZoom(z: number): number { return Math.max(this.minZoom, Math.min(this.maxZoom, z)); }
  private animate(x: number, y: number, z: number): void {
    this.fromX = this.x; this.fromY = this.y; this.fromZ = this.zoom;
    this.toX = x; this.toY = y; this.toZ = z;
    this.animT = 0; this.vx = 0; this.vy = 0;
  }
  /** Moves the map by a screen offset (px). */
  panBy(dx: number, dy: number): void {
    const s = 512 * Math.pow(2, this.zoom);
    this.x -= dx / s; this.y -= dy / s;
    this.x -= Math.floor(this.x);
    this.y = Math.max(0, Math.min(1, this.y));
  }
  private zoomAt(dz: number, fx: number, fy: number): void {
    const z = this.clampZoom(this.zoom + dz);
    const k = 1 / (512 * Math.pow(2, this.zoom)) - 1 / (512 * Math.pow(2, z));
    this.x += (fx - this.vw / 2) * k; this.y += (fy - this.vh / 2) * k;
    this.zoom = z;
  }

  // ---- tile loading: offline directory, then disk cache, then network (2 requests at a time)
  private pump(): void {
    for (let i = 0; i < 8; i++) {
      if (this.inflight >= 2) return;
      const key = Engine.nextRequest();
      if (key === '') return;
      const file = `${this.opts.tiles}/${key}.pbf`, cached = `${this.opts.cache}/${key}.pbf`;
      if (this.opts.tiles !== '' && exists(file)) Engine.provide(key, readText(file));
      else if (this.opts.cache !== '' && exists(cached)) Engine.provide(key, readText(cached));
      else if (this.opts.url === '') Engine.provide(key, '');
      else { this.inflight++; this.download(key); }
    }
  }
  private async download(key: string): Promise<void> {
    try {
      if (this.tileUrl === '') await this.resolve();
      const p = key.split('/');
      const r = await fetch(this.tileUrl.replace('{z}', p[0]).replace('{x}', p[1]).replace('{y}', p[2]));
      let body = '';
      if (r.ok) body = await r.text();
      if (r.ok && this.opts.cache !== '') {
        mkdir(this.opts.cache); mkdir(`${this.opts.cache}/${p[0]}`); mkdir(`${this.opts.cache}/${p[0]}/${p[1]}`);
        writeText(`${this.opts.cache}/${key}.pbf`, body);
      }
      Engine.provide(key, body);
    } catch (e) {
      console.error(`zinc:map: ${key}: ${e}`);
      Engine.provide(key, '');
    }
    this.inflight--;
  }
  /** TileJSON -> tile URL template (first entry of "tiles"). */
  private async resolve(): Promise<void> {
    const r = await fetch(this.opts.url);
    const j = await r.text();
    const i = j.indexOf('"tiles"'), a = j.indexOf('"', j.indexOf('[', i) + 1);
    if (i < 0 || a < 0) throw new Error(`no "tiles" in ${this.opts.url}`);
    this.tileUrl = j.slice(a + 1, j.indexOf('"', a + 1));
  }
}
