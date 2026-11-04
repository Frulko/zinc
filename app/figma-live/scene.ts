// Shared by the companion and exported apps: native layout, assets, prototype and motion.
import * as ui from 'zinc:ui';
import * as gfx from 'zinc:gfx';
import * as fs from 'zinc:fs';
import { Svg } from 'zinc:svg';
import * as lottie from 'zinc:lottie';
import { NativeControls, BindingEvent } from './native';
import { Document, Layer, Screen, Action, Track, readDocument } from './model';

class Media { path: string = ''; image: i32 = -1; svg: Svg | null = null; animation: i32 = -1; player: lottie.Player | null = null; }
class Bound { outlet: string = ''; id: string = ''; name: string = ''; handle: i32 = -1; box: number[] = []; }
class Playback { handle: i32 = -1; track: Track = new Track(); segment: i32 = -1; }
class Delayed { action: Action = new Action(); at: number = 0; }

export class Scene {
  root: i32 = ui.createNode(ui.VIEW);
  document: Document = new Document();
  current: string = '';
  viewportWidth: number = 360; viewportHeight: number = 480;
  customViewport: boolean = false;
  prototype: boolean = true; playing: boolean = true; loop: boolean = false;
  duration: number = 0; playhead: number = 0;
  changed: (() => void) | null = null;
  renderer: ((layer: Layer, path: string) => i32) | null = null;
  controls: NativeControls = new NativeControls();
  onBinding: ((event: BindingEvent) => boolean) | null = null;
  onClose: (() => void) | null = null;
  onAction: ((key: string, action: Action) => boolean) | null = null;
  private history: string[] = [];
  private media: Media[] = [];
  private bound: Bound[] = [];
  private playback: Playback[] = [];
  private delayed: Delayed[] = [];
  private overlays: i32[] = [];
  private last: number = ui.now();
  private elapsed: number = 0;
  private temporary: string = '';
  private hoverBox: number[] = [];
  private pressedTemporary: boolean = false;
  private stepper: () => void;

  constructor() {
    ui.setClass(this.root, 'relative overflow-hidden bg-white');
    this.controls.changed = (event: BindingEvent): void => { if (this.onBinding !== null) (this.onBinding as (event: BindingEvent) => boolean)(event); };
    this.stepper = (): void => this.step();
    ui.addWatcher(this.stepper);
  }
  load(raw: any): void {
    const next = readDocument(raw);
    for (const f of next.fonts) if (f.path !== '') {
      if (gfx.loadFont(f.path, 16) < 0) { next.warnings.push(f.family + ' / ' + f.style + ' : chargement impossible, repli Inter.'); f.path = ''; }
      else ui.registerFont(f.name, f.path);
    }
    const current = this.current;
    const playhead = this.playhead;
    const oldMedia = this.media.length;
    const paths: string[] = [];
    try { for (const s of next.screens) this.preload(s.tree, paths); }
    catch (e) { for (let i = oldMedia; i < this.media.length; i++) this.freeMedia(this.media[i]); this.media = this.media.slice(0, oldMedia); throw e; }
    this.controls.reset();
    ui.clearChildren(this.root);
    for (const m of this.media) if (paths.indexOf(m.path) < 0) this.freeMedia(m);
    this.media = this.media.filter((m: Media): boolean => paths.indexOf(m.path) >= 0);
    this.bound = []; this.document = next;
    this.current = next.initial;
    for (const s of next.screens) if (s.id === current) this.current = current;
    this.history = this.history.filter((id: string): boolean => this.hasScreen(id));
    this.show(this.current, new Action());
    if (current !== '') { this.seek(playhead); for (const p of this.playback) p.segment = -1; }
  }
  private preload(n: Layer, paths: string[]): void { if (n.assetPath !== '') { this.asset(n.assetPath, n.type); paths.push(n.assetPath); } for (const c of n.children) this.preload(c, paths); }
  private freeMedia(m: Media): void { if (m.image >= 0) gfx.destroyImage(m.image); if (m.svg !== null) (m.svg as Svg).dispose(); if (m.player !== null) (m.player as lottie.Player).close(); if (m.animation >= 0) lottie.free(m.animation); }
  private hasScreen(id: string): boolean { for (const s of this.document.screens) if (s.id === id) return true; return false; }
  screen(): Screen {
    for (const s of this.document.screens) if (s.id === this.current) return s;
    return this.document.screens.length > 0 ? this.document.screens[0] : new Screen();
  }
  resize(w: number, h: number): void {
    this.viewportWidth = w; this.viewportHeight = h;
    const group = this.screen().group;
    if (this.customViewport && group !== '') {
      let best = this.screen(), threshold: number = -1;
      for (const s of this.document.screens) if (s.group === group && s.minWidth <= w && s.minWidth > threshold) { best = s; threshold = s.minWidth; }
      if (best.id !== this.current) { this.show(best.id,new Action()); return; }
    }
    ui.setNumber(this.root, 'width', w); ui.setNumber(this.root, 'height', h);
    if (ui.childCount(this.root) > 0) { const content = ui.childAt(this.root, 0); ui.setNumber(content, 'width', w); ui.setNumber(content, 'height', h); }
  }
  restart(): void { this.history = []; this.show(this.document.initial, new Action()); }
  setPlaying(value: boolean): void {
    this.playing = value;
    for (const p of this.playback) {
      ui.animate(p.handle, p.track.key, ui.getNumber(p.handle, p.track.key), 0, 'linear', 0);
      p.segment = -1;
    }
    if (value) { this.seek(this.playhead); for (const p of this.playback) p.segment = -1; }
  }
  navigate(id: string): void { const a = new Action(); a.action = 'navigate'; a.target = id; this.act(a); }
  back(): void { const a = new Action(); a.action = 'back'; this.act(a); }
  private asset(path: string, kind: string): Media {
    for (const m of this.media) if (m.path === path) return m;
    const m = new Media(); m.path = path;
    if (kind === 'Svg') { const svg = new Svg(fs.readText(path)); if (!svg.ok) throw new Error('SVG: ' + svg.error); m.svg = svg; }
    else if (kind === 'Lottie') { m.animation = lottie.parse(fs.readText(path)); if (m.animation < 0) throw new Error('Lottie invalide'); m.player = new lottie.Player(m.animation); (m.player as lottie.Player).loop = true; (m.player as lottie.Player).play(); }
    else { m.image = gfx.imageFromBytes(fs.readBytes(path)); if (m.image < 0) throw new Error('Image illisible: ' + path); }
    this.media.push(m); return m;
  }
  private build(n: Layer, path: string): i32 {
    if (this.renderer !== null) { const h = (this.renderer as (layer: Layer, path: string) => i32)(n, path); if (h >= 0) return h; }
    return this.native(n, path);
  }
  native(n: Layer, path: string): i32 {
    const mediaNode = n.type === 'Image' || n.type === 'Svg' || n.type === 'Lottie';
    const native = this.controls.build(n);
    const h = native >= 0 ? native : ui.createNode(mediaNode ? ui.CANVAS : n.type === 'Text' ? ui.TEXT : n.classes.indexOf('overflow-auto') >= 0 ? ui.SCROLL : ui.VIEW);
    let classes = n.classes;
    for (const f of this.document.fonts) if (f.family === n.fontFamily && f.style === n.fontStyle && f.path !== '') classes += ' font-[' + f.name + ']';
    for (const a of n.actions) if (a.trigger === 'click') { classes += ' cursor-pointer'; break; }
    ui.setClass(h, classes);
    for (let i = 0; i < n.styleKeys.length; i++) ui.setNumber(h, n.styleKeys[i] === 'flexGrow' ? 'grow' : n.styleKeys[i], n.styleValues[i]);
    if (n.type === 'Text') ui.setText(h, n.text);
    this.bind(h, n, path);
    if (native < 0 || n.native.kind === 'ScrollView') for (const child of n.children) ui.insert(h, this.build(child, path + '/' + n.name), -1);
    return h;
  }
  /** Attach native behavior to a node built by generated TSX. Its visual props stay owned by TSX. */
  bind(h: i32, n: Layer, path: string): i32 {
    ui.setComponentName(h, n.codeName); ui.setLabel(h, n.name);
    const mediaNode = n.type === 'Image' || n.type === 'Svg' || n.type === 'Lottie';
    if (mediaNode) {
      const m = this.asset(n.assetPath, n.type);
      if (m.animation >= 0) this.duration = Math.max(this.duration, lottie.duration(m.animation) * 1000);
      ui.draw(h, (x: i32, y: i32, w: i32, height: i32): void => {
        if (m.svg !== null) (m.svg as Svg).draw(x, y, w, height, 255);
        else if (m.player !== null) (m.player as lottie.Player).draw(x, y, w, height);
        else if (n.imageFit === 'cover') {
          const iw = gfx.imageWidth(m.image), ih = gfx.imageHeight(m.image), scale = Math.max(w/iw,height/ih), sw=w/scale, sh=height/scale;
          gfx.drawImageRect(m.image,(iw-sw)/2,(ih-sh)/2,sw,sh,x,y,w,height,255,0);
        } else if (n.imageFit === 'contain') {
          const iw=gfx.imageWidth(m.image),ih=gfx.imageHeight(m.image),scale=Math.min(w/iw,height/ih);gfx.drawImage(m.image,x+(w-iw*scale)/2,y+(height-ih*scale)/2,iw*scale,ih*scale,255,0);
        } else gfx.drawImage(m.image, x, y, w, height, 255, 0);
      });
    }
    const bound = new Bound(); bound.outlet = n.name.startsWith('outlet:') ? n.name.slice(7) : n.native.outlet; bound.id = n.id; bound.name = path + '/' + n.name; bound.handle = h; this.bound.push(bound);
    for (const t of n.tracks) {
      const play = new Playback(); play.handle = h; play.track = t; this.playback.push(play);
      for (const p of t.points) if (p.at > this.duration) this.duration = p.at;
    }
    const business = n.name.startsWith('action:');
    if (business) ui.listen(h, (): void => {
      const e = new BindingEvent(); e.key = n.name.slice(7); e.nodeId = n.id; e.kind = 'Action';
      const handled = this.onBinding !== null && (this.onBinding as (event: BindingEvent) => boolean)(e);
      if (!handled && this.prototype) for (const a of n.actions) if (a.trigger === 'click') this.dispatch(a);
    });
    for (const a of n.actions) {
      if (a.trigger === 'click' && business) continue;
      if (a.trigger === 'click') { ui.listen(h, (): void => { if (this.prototype) this.dispatch(a); }); }
      else if (a.trigger === 'after') { const delay = new Delayed(); delay.action = a; delay.at = a.delay; this.delayed.push(delay); }
      else {
        const kind = a.trigger === 'enter' || a.trigger === 'hover' ? ui.PENTER : a.trigger === 'leave' ? ui.PLEAVE : a.trigger === 'down' || a.trigger === 'press' ? ui.PDOWN : ui.PUP;
        ui.onPointer(h, kind, (e: ui.PointerEvent): void => {
          if (!this.prototype) return;
          const previous = this.current, box = ui.screenBox(h);
          this.dispatch(a);
          if (this.current !== previous && (a.trigger === 'hover' || a.trigger === 'press')) { this.temporary = previous; this.hoverBox = box; this.pressedTemporary = a.trigger === 'press'; }
        });
      }
    }
    return h;
  }
  private show(id: string, action: Action): void {
    if (!this.hasScreen(id)) return;
    const old: Bound[] = this.bound;
    for (const b of old) b.box = ui.screenBox(b.handle);
    this.controls.unmount();
    this.current = id; this.playback = []; this.bound = []; this.delayed = []; this.overlays = [];
    this.playhead = 0; this.elapsed = 0; this.duration = 0; this.last = ui.now();
    ui.clearChildren(this.root);
    const s = this.screen();
    this.duration = s.duration;
    const content = this.build(s.tree, ''); ui.insert(this.root, content, -1);
    if (!this.customViewport) { this.viewportWidth = s.width; this.viewportHeight = s.height; }
    this.resize(this.viewportWidth, this.viewportHeight);
    const tr = action.transition;
    if (!ui.prefersReducedMotion() && tr.duration > 0) {
      if (tr.kind === 'dissolve') { ui.setNumber(content, 'opacity', 0); ui.animate(content, 'opacity', 1, tr.duration, tr.easing, 0); }
      else if (tr.kind === 'move') { ui.setNumber(content, 'translateX', this.viewportWidth); ui.animate(content, 'translateX', 0, tr.duration, tr.easing, 0); }
      else if (tr.kind === 'smart') {
        ui.layout();
        for (const b of this.bound) for (const was of old) if (b.name.slice(b.name.indexOf('/', 1)) === was.name.slice(was.name.indexOf('/', 1)) && b.name.split('/').length === 3) {
          const box = ui.screenBox(b.handle);
          ui.setNumber(b.handle, 'translateX', was.box[0] - box[0]); ui.setNumber(b.handle, 'translateY', was.box[1] - box[1]);
          ui.animate(b.handle, 'translateX', 0, tr.duration, tr.easing, 0); ui.animate(b.handle, 'translateY', 0, tr.duration, tr.easing, 0);
        }
      }
    }
    this.seek(0);
    if (this.changed !== null) (this.changed as () => void)();
  }
  private dispatch(a: Action): void {
    if (this.onAction !== null && (this.onAction as (key: string, action: Action) => boolean)(a.key, a)) return;
    this.act(a);
  }
  private act(a: Action): void {
    if (a.action === 'close') { if (this.overlays.length > 0) this.show(this.current, new Action()); return; }
    if (a.action === 'back') { if (this.history.length > 0) this.show(this.history.pop() as string, a); return; }
    if (a.action === 'overlay') {
      for (const s of this.document.screens) if (s.id === a.target) {
        const cover = ui.createNode(ui.VIEW); ui.setClass(cover, 'absolute left-0 top-0 w-full h-full bg-black/30 items-center justify-center');
        const card = this.build(s.tree, 'overlay'); ui.insert(cover, card, -1); ui.insert(this.root, cover, -1); this.overlays.push(cover);
      }
      return;
    }
    if (a.target !== this.current && this.hasScreen(a.target)) { this.history.push(this.current); this.show(a.target, a); }
  }
  seek(at: number): void {
    this.playhead = Math.max(0, Math.min(at, this.duration));
    for (const p of this.playback) {
      const points = p.track.points;
      if (points.length === 0) continue;
      let value = points[0].value;
      p.segment = 0;
      for (let i = 1; i < points.length; i++) {
        if (this.playhead < points[i].at) {
          const span = points[i].at - points[i - 1].at;
          const t = span > 0 ? (this.playhead - points[i - 1].at) / span : 1;
          value = points[i - 1].value + (points[i].value - points[i - 1].value) * Math.max(0, t);
          break;
        }
        value = points[i].value; p.segment = i;
      }
      ui.setNumber(p.handle, p.track.key, value);
    }
    for (const m of this.media) if (m.player !== null) (m.player as lottie.Player).seek(this.playhead / 1000 * lottie.fps(m.animation));
  }
  private step(): void {
    const now = ui.now(), dt = Math.max(0, now - this.last); this.last = now;
    if (this.temporary !== '') {
      const b = this.hoverBox, x = gfx.pointerX(), y = gfx.pointerY();
      if (this.pressedTemporary ? !gfx.pointerDown() : x < b[0] || y < b[1] || x >= b[0] + b[2] || y >= b[1] + b[3]) {
        const previous = this.temporary; this.temporary = ''; this.history.pop(); this.show(previous, new Action());
      }
    }
    this.elapsed += dt;
    if (this.prototype) {
      const due = this.delayed.filter((d: Delayed): boolean => d.at <= this.elapsed);
      this.delayed = this.delayed.filter((d: Delayed): boolean => d.at > this.elapsed);
      for (const d of due) this.dispatch(d.action);
    }
    if (!this.playing || ui.prefersReducedMotion() || this.duration <= 0 || !this.loop && this.playhead >= this.duration) return;
    this.playhead += dt;
    if (this.duration > 0 && this.playhead > this.duration && this.loop) this.seek(this.playhead % this.duration);
    else this.playhead = Math.min(this.playhead, this.duration);
    for (const p of this.playback) {
      const points = p.track.points;
      let segment = 0;
      for (let i = 1; i < points.length; i++) if (points[i].at <= this.playhead) segment = i;
      if (p.segment !== segment) p.segment = segment - 1;
      if (p.segment === segment - 1 || (segment === 0 && this.playhead <= dt)) {
        p.segment = segment;
        if (segment + 1 < points.length) ui.animate(p.handle, p.track.key, points[segment + 1].value, Math.max(1, points[segment + 1].at - this.playhead), points[segment].easing, 0);
        else ui.setNumber(p.handle, p.track.key, points[segment].value);
      }
    }
    for (const m of this.media) if (m.player !== null) { const p = m.player as lottie.Player; p.loop = this.loop; p.update(dt / 1000); ui.repaint(); }
  }
  outlet(key: string): i32 { for (const b of this.bound) if (b.outlet === key || b.id === key) return b.handle; return -1; }
  setText(key: string, value: string): void { for (const b of this.bound) if (b.outlet === key) ui.setText(b.handle, value); }
  close(): void { if (this.onClose !== null) { const close = this.onClose; this.onClose = null; (close as () => void)(); } this.controls.reset(); ui.removeWatcher(this.stepper); ui.clearChildren(this.root); for (const m of this.media) this.freeMedia(m); this.media = []; }
}
