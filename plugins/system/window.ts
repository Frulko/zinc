// zinc:system/window: the app window after it exists (docs/reports/system-integration.md 4.5). Creation options live in zinc.json app.window; this module changes and reads the window at run
// time, keeps the close-to-tray handler, and saves and restores its position and size (the state file is plain JSON, the clamp to the displays is a pure function).
import { call, on, preventClose, supports } from 'zinc:system';
import * as fs from 'zinc:fs';

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
