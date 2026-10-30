// zinc:system/window: the app window after it exists (docs/reports/system-integration.md 4.5). Creation options live in zinc.json app.window; this module changes and reads the window at run
// time, keeps the close-to-tray handler, and saves and restores its position and size (the state file is plain JSON, the clamp to the displays is a pure function).
import { call, on, preventClose, supports } from 'zinc:system';
import * as fs from 'zinc:fs';
import { openWindow, closeWindow, windowOpen, windowCtl, clear, rect, rrect, line, text } from 'zinc:gfx';

export class Rect {
  x: number; y: number; w: number; h: number;
  constructor(x: number, y: number, w: number, h: number) { this.x = x; this.y = y; this.w = w; this.h = h; }
}
export class State {
  x: number = 0; y: number = 0; w: number = 0; h: number = 0;
  maximized: boolean = false;
  fullscreen: boolean = false;
}

export function isSupported(): boolean { return supports('windowctl'); }

// ---- the saved state

/** Fits a saved window into the displays that exist now: a window that left the screen (a removed monitor) comes back, one that is too big is cut to the display; a fullscreen flag saved on
 *  another display is dropped. `displays` are rectangles in screen coordinates; with none, the state is returned as it is. */
export function clampToDisplays(s: State, displays: Rect[]): State {
  const out = new State();
  out.x = s.x; out.y = s.y; out.w = s.w; out.h = s.h; out.maximized = s.maximized; out.fullscreen = s.fullscreen;
  if (displays.length === 0 || s.w <= 0 || s.h <= 0) return out;
  // the display that shows most of the window; the first one when none does
  let best = 0, bestArea = -1;
  for (let i = 0; i < displays.length; i++) {
    const d = displays[i];
    const w = Math.min(s.x + s.w, d.x + d.w) - Math.max(s.x, d.x);
    const h = Math.min(s.y + s.h, d.y + d.h) - Math.max(s.y, d.y);
    const area = w > 0 && h > 0 ? w * h : 0;
    if (area > bestArea) { bestArea = area; best = i; }
  }
  const d = displays[best];
  if (out.w > d.w) out.w = d.w;
  if (out.h > d.h) out.h = d.h;
  if (bestArea <= 0) out.fullscreen = false;   // saved on a display that is gone
  if (out.x < d.x) out.x = d.x;
  if (out.y < d.y) out.y = d.y;
  if (out.x + out.w > d.x + d.w) out.x = d.x + d.w - out.w;
  if (out.y + out.h > d.y + d.h) out.y = d.y + d.h - out.h;
  return out;
}

export function stateToJson(s: State): string {
  return '{"x":' + s.x + ',"y":' + s.y + ',"w":' + s.w + ',"h":' + s.h + ',"maximized":' + (s.maximized ? 'true' : 'false') + ',"fullscreen":' + (s.fullscreen ? 'true' : 'false') + '}';
}
/** null when the text is not a state file. */
export function stateFromJson(text: string): State | null {
  const v = JSON.parse(text);
  if (v === null || typeof v.x !== 'number' || typeof v.w !== 'number') return null;
  const s = new State();
  s.x = v.x; s.y = v.y; s.w = v.w; s.h = v.h;
  s.maximized = v.maximized === true; s.fullscreen = v.fullscreen === true;
  return s;
}
export function saveState(path: string, s: State): void { fs.writeText(path, stateToJson(s)); }
export function loadState(path: string): State | null {
  if (!fs.exists(path)) return null;
  return stateFromJson(fs.readText(path));
}

// ---- the live window

export function state(): State {
  const r = call('window.state', {}) as { x: number; y: number; w: number; h: number; maximized: boolean; fullscreen: boolean };
  const s = new State();
  s.x = r.x; s.y = r.y; s.w = r.w; s.h = r.h; s.maximized = r.maximized; s.fullscreen = r.fullscreen;
  return s;
}
export function displays(): Rect[] {
  const r = call('window.state', {}) as { displays: { x: number; y: number; w: number; h: number }[] };
  const out: Rect[] = [];
  for (const d of r.displays) out.push(new Rect(d.x, d.y, d.w, d.h));
  return out;
}
export function setTitle(title: string): void { call('window.setTitle', { title: title }); }
export function setSize(w: number, h: number): void { call('window.setSize', { w: w, h: h }); }
export function setPosition(x: number, y: number): void { call('window.setPosition', { x: x, y: y }); }
export function center(): void { call('window.center', {}); }
export function setAlwaysOnTop(on: boolean): void { call('window.setAlwaysOnTop', { on: on }); }
export function setOpacity(value: number): void { call('window.setOpacity', { value: value }); }
export function setMinSize(w: number, h: number): void { call('window.setMinSize', { w: w, h: h }); }
export function setFullscreen(on: boolean): void { call('window.setFullscreen', { on: on }); }
export function maximize(): void { call('window.maximize', {}); }
export function minimize(): void { call('window.minimize', {}); }
export function hide(): void { call('window.hide', {}); }
export function show(): void { call('window.show', {}); }
export function focus(): void { call('window.focus', {}); }
/** 'default' | 'hidden' (no title text) | 'overlay' (content under a transparent title bar, macOS) | 'none' (no frame). */
export function setTitleBar(style: string): void { call('window.setTitleBar', { style: style }); }
/** macOS: a blurred backdrop behind the window ('sidebar' | 'menu' | 'hud' | 'under-window'; '' removes it). Needs app.window.transparent: the key colour of the page (transparentColor, black by default) shows it. */
export function setVibrancy(material: string): void { call('window.setVibrancy', { material: material }); }
/** macOS: where the close, minimise and zoom buttons sit (AppKit moves them back on resize and fullscreen: they are reapplied). */
export function setTrafficLights(x: number, y: number): void { call('window.setTrafficLights', { x: x, y: y }); }

/** Close-to-tray: the handler runs when the user closes the window; call `keepOpen()` in it to stop the close (the window is usually hidden instead). */
export function onCloseRequested(cb: () => void): void {
  on('window', (a: string[]) => { if (a[0] === 'close-requested') cb(); });
}
export const keepOpen = preventClose;

/** Saves the window state to `<dir>/window-state.json` when it moves or resizes (the program calls this on a 'window' event or at quit) and returns the path. */
export function stateFile(dir: string): string { return dir + '/window-state.json'; }
export function dataDir(): string { const r = call('window.dataDir', {}) as { path: string }; return r.path; }
/** Applies the saved state (clamped to today's displays) once at start; returns whether a state was restored. */
export function restore(dir: string): boolean {
  const saved = loadState(stateFile(dir));
  if (saved === null) return false;
  const s = clampToDisplays(saved, displays());
  setSize(s.w, s.h);
  setPosition(s.x, s.y);
  if (s.fullscreen) setFullscreen(true);
  return true;
}
export function save(dir: string): void { fs.mkdir(dir, true); saveState(stateFile(dir), state()); }

// ---- more windows (ZN-864): Electron's BrowserWindow, over zinc:gfx windows (D75). Window 0 is the main one; the others draw a frame callback,
// a zinc:ui tree (`get(ui.mountWindow(...))`) or the last Scene a worker posted. Messages between them: MessageChannel and workerPort of zinc:worker.

/** One shape of a Scene: 'rect', 'rrect' (r: the corner radius), 'text' (r: the scale, 1 to 4) or 'line' (from x,y to x+w,y+h). */
export interface Shape { kind: string; x: number; y: number; w: number; h: number; r: number; color: u32; text: string }
/** What a window draws when its scene comes from elsewhere (a worker computes it, the window draws the last one): plain data, so it crosses a thread. */
export interface Scene { background: u32; shapes: Shape[] }
export interface WindowOptions { title: string; width: i32; height: i32 }

export function drawScene(s: Scene): void {
  clear(s.background);
  for (const p of s.shapes) {
    if (p.kind === 'rect') rect(p.x, p.y, p.w, p.h, p.color);
    else if (p.kind === 'rrect') rrect(p.x, p.y, p.w, p.h, p.r, p.color, 255);
    else if (p.kind === 'text') text(p.x, p.y, p.text, p.color, p.r >= 1 ? Math.floor(p.r) as i32 : 1);
    else if (p.kind === 'line') line(p.x, p.y, p.x + p.w, p.y + p.h, p.color);
  }
}

export class AppWindow {
  id: i32;
  /** The scene a window opened without a draw callback shows (setScene). */
  scene: Scene | null = null;
  constructor(id: i32) { this.id = id; }
  isOpen(): boolean { return windowOpen(this.id); }
  /** Closes it; closing the last window ends the program. */
  close(): void { closeWindow(this.id); }
  focus(): void { windowCtl(this.id, 2, '', 0, 0); }
  setTitle(title: string): void { windowCtl(this.id, 3, title, 0, 0); }
  setPosition(x: i32, y: i32): void { windowCtl(this.id, 0, '', x, y); }
  setSize(w: i32, h: i32): void { windowCtl(this.id, 1, '', w, h); }
  setBounds(r: Rect): void { this.setPosition(r.x as i32, r.y as i32); this.setSize(r.w as i32, r.h as i32); }
  /** Its frame on the screen, in points (headless: what was asked). */
  bounds(): Rect { return new Rect(windowCtl(this.id, 4, '', 0, 0), windowCtl(this.id, 5, '', 0, 0), windowCtl(this.id, 6, '', 0, 0), windowCtl(this.id, 7, '', 0, 0)); }
  /** What it draws from the next frame, when it was opened without a draw callback. */
  setScene(s: Scene): void { this.scene = s; }
}

const known: Map<i32, AppWindow> = new Map<i32, AppWindow>();

/** The window `id` (0: the main one), for a window opened elsewhere (zinc:gfx openWindow, zinc:ui mountWindow). */
export function get(id: i32): AppWindow {
  const w = known.get(id);
  if (w !== undefined) return w;
  const n = new AppWindow(id);
  known.set(id, n);
  return n;
}
/** Opens a window beside the main one. `draw` runs every frame with the window's surface and input; without it the window draws its scene.
 *  Throws when no window can open (a target without more windows). */
export function open(o: WindowOptions, draw: ((dt: number) => void) | null = null): AppWindow {
  const w = new AppWindow(-1);
  const f: (dt: number) => void = draw !== null ? draw : (dt: number) => { const s = w.scene; if (s !== null) drawScene(s); else clear(0); };
  w.id = openWindow(o.title, o.width, o.height, f);
  if (w.id < 0) throw new Error('zinc:system/window: no window can open here');
  known.set(w.id, w);
  return w;
}
/** The open windows, the main one first. */
export function list(): AppWindow[] {
  const out: AppWindow[] = [];
  const last = windowCtl(0, 8, '', 0, 0);
  for (let id: i32 = 0; id <= last; id++) {
    if (windowOpen(id)) out.push(get(id));
    else known.delete(id);
  }
  return out;
}
/** The window being drawn (inside a draw callback), else the main one. */
export function current(): AppWindow { return get(windowCtl(0, 9, '', 0, 0)); }
