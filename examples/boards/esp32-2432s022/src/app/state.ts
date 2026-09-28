// App state shared by the pages: navigation (five pages, one transition), the frame clock (fps, uptime),
// the theme and the backlight. Everything here is a signal, so the nodes that show it update on their own.
import { createSignal } from 'zinc:ui/solid';
import { setTheme, LIGHT, DARK } from 'zinc:ui/kit';
import * as device from 'zinc:device';
import { Tween, easeOut, easeIn } from './motion';

// ---- navigation
export class PageInfo {
  title: string; label: string; icon: string;
  constructor(title: string, label: string, icon: string) { this.title = title; this.label = label; this.icon = icon; }
}
export const PAGES: PageInfo[] = [
  new PageInfo('Dashboard', 'Home', 'home'),
  new PageInfo('Controls', 'Controls', 'controls'),
  new PageInfo('Now playing', 'Music', 'music'),
  new PageInfo('Benchmark', 'Bench', 'bench'),
  new PageInfo('System', 'System', 'system'),
];
export const HOME: i32 = 0, CONTROLS: i32 = 1, MUSIC: i32 = 2, BENCH: i32 = 3, SYSTEM: i32 = 4;

/** The selected page (title, navigation bar). */
export const [page, setPage] = createSignal<i32>(HOME);
/** The page mounted on the stage: it trails `page` by the leave half of a transition, and there is only ever one,
 *  so the Zinc heap holds the shell plus one page (the whole budget is ~160 KiB on a PSRAM-less ESP32). */
export const [shown, setShown] = createSignal<i32>(HOME);
/** Page transition ("shared axis"): the old page slides a quarter width away and fades out, then the new one
 *  comes in from the other side. */
export const leave = new Tween(0);
export const enter = new Tween(1);
/** Navigation indicator travel, 0 → 1 from the previous page to the selected one. */
export const nav = new Tween(1);
let from: i32 = HOME;
let dir: number = 1;

export function go(i: i32): void {
  if (i === page() || i < 0 || i >= PAGES.length) return;
  from = page(); dir = i > page() ? 1 : -1;
  setPage(i);
  nav.snap(0); nav.to(1, 0.34, easeOut);
  leave.to(1, 0.12, easeIn);
}
/** Once the old page has left, swaps the mounted page (called every frame). */
export function stepNav(): void {
  if (rebuild) { rebuild = false; setLive(false); setLive(true); }
  if (shown() === page() || leave.moving()) return;
  setShown(-1);           // dispose the old page first...
  setShown(page());       // ...then build the new one: the two never coexist
  leave.snap(0); enter.snap(0); enter.to(1, 0.22, easeOut);
}
export function mounted(i: i32): boolean { return i === shown(); }
/** Offset and opacity of the mounted page during a transition. */
export function pageX(width: number): number { return Math.round(((1 - enter.get()) - leave.get()) * width * 0.25 * dir); }
export function pageOpacity(): number { return enter.get() * (1 - leave.get()); }
/** Navigation indicator position: page index, fractional while travelling. */
export function navPos(): number { return from + (page() - from) * nav.get(); }

// ---- frame clock: fps averaged over half a second (a signal updated twice a second, not every frame)
export const [fps, setFps] = createSignal<i32>(0);
export const [frameMs, setFrameMs] = createSignal<number>(0);
export const [uptime, setUptime] = createSignal<i32>(0);   // whole seconds
let acc: number = 0, frames: i32 = 0, total: number = 0, worst: number = 0;
export function stepClock(dt: number): void {
  acc += dt; frames++; total += dt;
  worst = Math.max(worst, device.frameMs());
  if (acc >= 0.5) {
    setFps(Math.round(frames / acc));
    setFrameMs(worst);
    acc = 0; frames = 0; worst = 0;
  }
  if (Math.floor(total) !== uptime()) setUptime(Math.floor(total));
}
/** "m:ss" or "h:mm:ss". */
export function clockText(s: i32): string {
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = s % 60;
  const mm = h > 0 && m < 10 ? `0${m}` : `${m}`;
  return `${h > 0 ? `${h}:` : ''}${mm}:${r < 10 ? '0' : ''}${r}`;
}

// ---- theme and backlight
export const [dark, setDarkSignal] = createSignal<boolean>(true);
/** The UI is mounted while true; a theme switch unmounts and rebuilds it on the next frame (see tk()). */
export const [live, setLive] = createSignal<boolean>(true);
let rebuild: boolean = false;
export function setDark(on: boolean): void { setDarkSignal(on); setTheme(on ? DARK : LIGHT); rebuild = true; }
export const [brightness, setBrightnessSignal] = createSignal<number>(1);
export function setBrightness(v: number): void { setBrightnessSignal(v); device.setBacklight(v); }

// ---- auto tour: moves to the next page every few seconds (a shop-window demo, and QEMU runs without touch)
export const [tour, setTour] = createSignal<boolean>(false);
let tourClock: number = 0;
export function stepTour(dt: number): void {
  if (!tour()) { tourClock = 0; return; }
  tourClock += dt;
  if (tourClock >= 4) { tourClock = 0; go((page() + 1) % PAGES.length); }
}
