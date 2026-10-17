// zinc:video in the browser (docs/targets/web.md, "Video"; docs/plugins/video.md): the same Player as index.ts, over the browser's own <video> element, so the browser decodes
// (hardware where it can), streams the file, and gives controls, fullscreen, picture-in-picture, subtitles and MSE/HLS sources where it has them.
// `player.draw(x, y, w, h)` hands the <video> itself to the page: in the semantic DOM render (`--render dom`) a Canvas node whose draw is one `player.draw` is that element, sized
// by CSS, with the browser's own controls when `player.controls` is on; on a canvas render, or when the node draws more around it, the current frame is drawn like any image.
// `player.image` is a runtime image of zinc:gfx that follows the frames, for <Image> and gfx.drawImage as on a desktop.
// A file the browser cannot decode (HEVC in Firefox, AV1 on old hardware, an .avi) shows a message with a link to download it instead of a black box, and says so in
// `player.error`; the export warns about such codecs (W0604, `zinc explain W0604`). Not here: gapless playlists (the next file loads when the last ends), hardware decoder names.
import * as gfx from 'zinc:gfx';
import * as ui from 'zinc:ui';

const g: any = globalThis;
const Z = g.__zincWeb;

/** Playlist order. */
export const SEQUENTIAL: i32 = 0;
export const RANDOM: i32 = 1;
/** Random, but every file plays once per pass. */
export const RANDOM_UNIQUE: i32 = 2;
/** What happens at the end: stop after the playlist, loop it forever (default), stop after each file. */
export const STOP: i32 = 0;
export const LOOP: i32 = 1;
export const ONE_SHOT: i32 = 2;

export const EXTENSIONS: string[] = ['mp4', 'mov', 'mkv', 'm4v', 'avi', 'webm', 'h264', 'mpg', 'ts'];

/** True when `name` ends with one of `exts` (without the dot, case-insensitive). */
export function isVideo(name: string, exts: string[]): boolean {
  const n = name.toLowerCase();
  if (n.startsWith('.')) return false;
  for (const e of exts) if (n.endsWith('.' + e.toLowerCase())) return true;
  return false;
}

const MIME: any = { mp4: 'video/mp4', m4v: 'video/mp4', h264: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg', mkv: 'video/x-matroska', ts: 'video/mp2t', avi: 'video/x-msvideo', mpg: 'video/mpeg' };
const extOf = (p: string): string => { const m = /\.([A-Za-z0-9]+)(?:[?#].*)?$/.exec(p); return m ? m[1].toLowerCase() : ''; };
const nameOf = (p: string): string => p.replace(/^.*\//, '').replace(/[?#].*$/, '');

/** Whether the browser says it can play this container (and codec, when `mime` carries `codecs=`): 'probably', 'maybe' or '' (no). */
export function canPlay(mime: string): string { return g.document.createElement('video').canPlayType(mime); }
/** What the browser says about decoding a codec at a size: smooth and power efficient (MediaCapabilities, asynchronous; null where the browser has none). */
export async function decoding(mime: string, width: number = 1280, height: number = 720, fps: number = 30, bitrate: number = 2000000): Promise<any> {
  const mc: any = g.navigator.mediaCapabilities;
  if (!mc || !mc.decodingInfo) return null;
  try { return await mc.decodingInfo({ type: 'file', video: { contentType: mime, width, height, bitrate, framerate: fps } }); } catch (e) { return null; }
}

interface Entry { path: string; url: string; mime: string; failed: string }
let counter: i32 = 0;

export class Player {
  readonly id: i32;
  /** The <video> element: it is the page's own, so everything the platform offers on it works (picture-in-picture, remote playback, tracks). */
  readonly element: any;
  private note: any;                 // the message shown in place of the video when the file cannot be played
  private entries: Entry[] = [];
  private cur: i32 = 0;
  private ord: i32 = SEQUENTIAL;
  private rep: i32 = LOOP;
  private bg: i32 = -1;
  private wanted: boolean = false;   // play() was called: the playlist runs (a pause in the browser's controls does not undo it)
  private passes: i32 = 0;
  private bag: i32[] = [];
  private tw: i32;
  private th: i32;
  private img: i32 = -1;
  private fitMode: string = 'contain';
  private last: number = 0;
  private cbs: any = {};
  private pending: boolean = false;

  /** The image is width x height; 0 x 0 takes the size of the first video. Every video is fitted inside it (aspect ratio kept, bars in the background colour). */
  constructor(width: i32, height: i32) {
    this.id = ++counter;
    this.tw = width; this.th = height;
    const v: any = g.document.createElement('video');
    v.className = 'zn-media';
    v.playsInline = true; v.preload = 'auto'; v.controls = false; v.muted = false;
    v.addEventListener('ended', () => this.finished());
    v.addEventListener('error', () => this.failed());
    v.addEventListener('timeupdate', () => { if (v.loop && v.currentTime + 0.5 < this.last) this.passes++; this.last = v.currentTime; });
    v.addEventListener('loadedmetadata', () => { this.note = null; this.fire('loadedmetadata'); this.repaint(); });
    for (const e of ['play', 'pause', 'playing', 'waiting', 'seeked', 'volumechange', 'ratechange', 'stalled']) v.addEventListener(e, () => this.fire(e));
    this.element = v;
  }

  // ---- the playlist
  add(path: string): boolean {
    let url = '';
    if (/^(https?:|blob:|data:)/.test(path) || path.startsWith('/')) url = path;
    else url = Z.assetUrl(path);
    if (url === '') return false;
    const e: Entry = { path, url, mime: MIME[extOf(path)] || '', failed: '' };
    if (e.mime !== '' && this.element.canPlayType(e.mime) === '') e.failed = 'This browser cannot play ' + extOf(path).toUpperCase() + ' files.';
    this.entries.push(e);
    if (this.entries.length === 1) this.select(0);
    return true;
  }
  /** Adds the videos of a directory of the assets in alphabetical order; returns how many were added. */
  addFolder(dir: string, exts: string[]): i32 {
    const pre = ('assets/' + dir.replace(/^\/+|\/+$/g, '') + '/').replace(/\/+$/, '/');
    let n = 0;
    for (const name of Z.assetNames().sort()) if (name.startsWith(pre) && name.slice(pre.length).indexOf('/') < 0 && isVideo(name, exts) && this.add(name.slice(7))) n++;
    return n;
  }
  set order(o: i32) { this.ord = o; this.bag = []; }
  set repeat(r: i32) { this.rep = r; this.element.loop = r === LOOP && this.entries.length === 1; }
  set background(c: u32) { this.bg = c & 0xffffff; this.element.style.setProperty('--zn-media-bg', '#' + this.bg.toString(16).padStart(6, '0')); }

  private select(i: i32): void {
    this.cur = Math.max(0, Math.min(i, this.entries.length - 1));
    const e = this.entries[this.cur];
    this.note = null;
    this.last = 0;
    if (e.failed !== '') { this.showNote(e); return; }
    this.element.loop = this.rep === LOOP && this.entries.length === 1;
    this.element.src = e.url;
    this.repaint();
  }
  private showNote(e: Entry): void {
    const d: any = g.document.createElement('div');
    d.className = 'zn-fallback';
    d.setAttribute('role', 'alert');
    const t: any = g.document.createElement('span');
    t.textContent = e.failed;
    const a: any = g.document.createElement('a');
    a.href = e.url; a.download = nameOf(e.path); a.textContent = 'Download ' + nameOf(e.path);
    d.appendChild(t); d.appendChild(a);
    this.note = d;
    this.fire('error');
    this.repaint();
  }
  private failed(): void {
    const e = this.entries[this.cur];
    if (!e) return;
    const c: any = this.element.error;
    e.failed = c && c.code === 4 ? 'This browser cannot decode ' + nameOf(e.path) + ' (its codec is not supported here).' : 'The video ' + nameOf(e.path) + ' could not be loaded.';
    this.showNote(e);
  }
  private repaint(): void { ui.repaint(); }
  private fire(name: string): void { const l = this.cbs[name]; if (l) for (const f of l.slice()) f(this); }
  private nextIndex(): i32 {
    const n = this.entries.length;
    if (n <= 1) return 0;
    if (this.ord === RANDOM) return Math.floor(Math.random() * n);
    if (this.ord === RANDOM_UNIQUE) {
      if (this.bag.length === 0) { for (let i = 0; i < n; i++) this.bag.push(i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = this.bag[i]; this.bag[i] = this.bag[j]; this.bag[j] = t; } }
      return this.bag.pop() as i32;
    }
    return (this.cur + 1) % n;
  }
  private finished(): void {
    this.fire('ended');
    if (this.rep === ONE_SHOT || this.entries.length === 0) { this.wanted = false; return; }
    const n = this.entries.length, nx = this.nextIndex();
    if (nx <= this.cur && this.ord === SEQUENTIAL) {   // the pass is over
      this.passes++;
      if (this.rep === STOP) { this.wanted = false; return; }
    }
    this.select(nx);
    if (this.wanted && n > 0) this.start();
  }
  private start(): void {
    const v = this.element;
    const p: any = v.play();
    if (p && p.catch) p.catch((e: any) => {
      if (e && e.name === 'NotAllowedError' && !v.muted) { v.muted = true; v.play().catch(() => {}); this.fire('autoplayblocked'); }   // autoplay policy: a muted video may start, the person unmutes it
    });
  }

  // ---- transport
  play(): void { this.wanted = true; if (this.entries.length === 0) return; if (this.note) return; this.start(); }
  stop(): void { this.wanted = false; this.element.pause(); if (this.entries.length > 0) { this.select(0); } this.element.currentTime = 0; }
  pause(on: boolean): void { if (on) this.element.pause(); else if (this.wanted && !this.note) this.start(); }
  next(): void { this.jump((this.cur + 1) % Math.max(1, this.entries.length)); }
  previous(): void { this.jump((this.cur - 1 + this.entries.length) % Math.max(1, this.entries.length)); }
  jump(index: i32): void { if (this.entries.length === 0) return; this.select(index); if (this.wanted) this.start(); }
  close(): void {
    this.wanted = false;
    const v = this.element;
    v.pause(); v.removeAttribute('src'); v.load();
    if (v.parentNode) v.parentNode.removeChild(v);
    if (this.img >= 0) { gfx.destroyImage(this.img); this.img = -1; }
  }

  // ---- state
  /** Runtime image id that follows the frames (made on first use), -1 until the size is known. */
  get image(): i32 {
    if (this.img < 0) {
      const w = this.tw > 0 ? this.tw : this.element.videoWidth || 640, h = this.th > 0 ? this.th : this.element.videoHeight || 360;
      this.img = gfx.createImage(w, h);
      this.copyFrames();
    }
    return this.img;
  }
  get width(): i32 { return this.element.videoWidth || this.tw; }
  get height(): i32 { return this.element.videoHeight || this.th; }
  /** Playlist entry on screen, number of entries, seconds into the entry, its duration, completed passes. */
  get index(): i32 { return this.cur; }
  get count(): i32 { return this.entries.length; }
  get position(): number { return this.element.currentTime || 0; }
  get duration(): number { const d = this.element.duration; return isFinite(d) ? d : 0; }
  get loops(): i32 { return this.passes; }
  get playing(): boolean { return !this.element.paused && !this.element.ended; }
  get paused(): boolean { return this.wanted && this.element.paused; }
  get decoder(): string { return 'browser'; }
  get frames(): i32 { const q: any = this.element.getVideoPlaybackQuality ? this.element.getVideoPlaybackQuality() : null; return q ? q.totalVideoFrames : 0; }
  get dropped(): i32 { const q: any = this.element.getVideoPlaybackQuality ? this.element.getVideoPlaybackQuality() : null; return q ? q.droppedVideoFrames : 0; }

  /** Draws the current frame; in the semantic DOM render a node that only does this holds the <video> itself, in the box. */
  draw(x: number, y: number, w: number, h: number): void { Z.paint.element(this.note ? this.note : this.element, x, y, w, h, { fit: this.fitMode, bg: this.bg }); }

  // ---- what the browser's element adds
  /** The browser's own controls (play, seek, volume, fullscreen, picture-in-picture, speed) on the video. */
  get controls(): boolean { return this.element.controls; }
  set controls(on: boolean) { this.element.controls = on; }
  get muted(): boolean { return this.element.muted; }
  set muted(on: boolean) { this.element.muted = on; }
  /** 0 to 1. */
  get volume(): number { return this.element.volume; }
  set volume(v: number) { this.element.volume = Math.max(0, Math.min(1, v)); }
  /** Playback speed (1 normal). */
  get rate(): number { return this.element.playbackRate; }
  set rate(r: number) { this.element.playbackRate = r; }
  /** 'contain' (the whole picture, bars around it) or 'cover' (fills the box, cropped). */
  get fit(): string { return this.fitMode; }
  set fit(f: string) { this.fitMode = f === 'cover' ? 'cover' : 'contain'; this.element.classList.toggle('zn-cover', f === 'cover'); }
  /** The poster shown before the first frame: an asset name or an address. */
  set poster(p: string) { this.element.poster = /^(https?:|blob:|data:)/.test(p) || p.startsWith('/') ? p : Z.assetUrl(p); }
  /** Moves the playhead (seconds). */
  seek(t: number): void { this.element.currentTime = Math.max(0, t); }
  /** Why the current entry cannot be played ('' when it can). */
  get error(): string { const e = this.entries[this.cur]; return e ? e.failed : ''; }
  get ended(): boolean { return this.element.ended; }
  get loop(): boolean { return this.element.loop; }
  /** Opens the element in fullscreen (a user gesture is needed). */
  fullscreen(): Promise<void> { return this.element.requestFullscreen ? this.element.requestFullscreen() : Promise.reject(new Error('no fullscreen')); }
  /** Picture-in-picture where the browser has it. */
  pictureInPicture(): Promise<any> { return this.element.requestPictureInPicture ? this.element.requestPictureInPicture() : Promise.reject(new Error('no picture-in-picture')); }
  /** f(player) when the element fires `event` ('ended', 'error', 'play', 'pause', 'waiting', 'seeked', 'volumechange', 'ratechange', 'loadedmetadata', 'autoplayblocked'). */
  on(event: string, f: (p: Player) => void): void { (this.cbs[event] = this.cbs[event] || []).push(f); }

  // the runtime image follows the frames while it exists (requestVideoFrameCallback where the browser has it, else every animation frame)
  private copyFrames(): void {
    const v: any = this.element;
    const draw = (): void => {
      if (this.img < 0) return;
      const cv: any = Z.images.canvas(this.img);
      if (cv && v.videoWidth > 0) {
        const c: any = cv.getContext('2d');
        c.fillStyle = this.bg >= 0 ? '#' + this.bg.toString(16).padStart(6, '0') : '#000';
        c.fillRect(0, 0, cv.width, cv.height);
        const s = Math.min(cv.width / v.videoWidth, cv.height / v.videoHeight);
        c.drawImage(v, (cv.width - v.videoWidth * s) / 2, (cv.height - v.videoHeight * s) / 2, v.videoWidth * s, v.videoHeight * s);
        Z.images.touch(this.img);
      }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else g.requestAnimationFrame(draw);
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else g.requestAnimationFrame(draw);
  }
}
