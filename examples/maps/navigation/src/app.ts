// App-level state and actions shared by the components and the keyboard: night mode, the step list sheet, the
// route preview (reveal + Go countdown), restart and arrival.
import { createSignal } from 'zinc:ui/solid';
import { setTheme, LIGHT, DARK } from 'zinc:ui/kit';
import { Tween, easeInOut, easeOut, easeOutBack } from './motion';
import { phase, setPhase, start, restart as restartSim, totalTime, PREVIEW, DRIVING, ARRIVED } from './sim';
import { flyTo, snapTo, FOLLOW, OVERVIEW } from './camera';
import { routeLength, steps } from './route';
import { reveal, confetti, clearConfetti, carOnScreen } from './scene';
import { resetAlerts, toast } from './alerts';

// ---------------------------------------------------------------- night mode: the map palette crossfades
export const [dark, setDark] = createSignal<boolean>(false);
export const nightT = new Tween(0);
/** Sets the night flag and crossfades the map palette (no theme change: see toggleNight). */
export function setNight(on: boolean): void {
  if (on === dark()) return;
  setDark(on);
  nightT.to(on ? 1 : 0, 0.8, easeInOut);
}
/** Embedded in an app that owns the theme (examples/hero): the night button asks it, which calls setNight back. */
let hostNight: ((on: boolean) => void) | null = null;
export function handNightToHost(f: (on: boolean) => void): void { hostNight = f; }
export function toggleNight(): void {
  const on = !dark();
  const host = hostNight;
  if (host !== null) { host(on); return; }
  setTheme(on ? DARK : LIGHT);
  setNight(on);
}

// ---------------------------------------------------------------- step list (pull-up sheet)
export const [sheetOpen, setSheetOpen] = createSignal<boolean>(false);
export const sheetT = new Tween(0);
export function toggleSheet(): void {
  const open = !sheetOpen();
  setSheetOpen(open);
  sheetT.to(open ? 1 : 0, open ? 0.42 : 0.3, open ? easeOutBack : easeOut);
}

// ---------------------------------------------------------------- preview: the route draws itself, then Go
const revealT = new Tween(0);
export const [countdown, setCountdown] = createSignal<i32>(8);
let previewTime: number = 0;
/** Auto-start after this many seconds in the preview (like Waze's Go button); 0 = never. */
export const AUTO_GO: number = 8;

export function go(): void {
  if (phase() !== PREVIEW) return;
  revealT.snap(1);
  start();
  flyTo(FOLLOW, 1.9);
  toast(`Let's go! ${Math.round(totalTime / 60)} min to ${steps[steps.length - 1].street}`);
}

export function restart(): void {
  restartSim();
  resetAlerts();
  clearConfetti();
  arriveIn.snap(0);
  previewTime = 0;
  revealT.snap(0);
  revealT.to(1, 2.2, easeInOut, null, 0.3);
  flyTo(OVERVIEW, 1.4);
}

// ---------------------------------------------------------------- arrival
export const arriveIn = new Tween(0);
let arrivedShown: boolean = false;

/** Per frame, after the simulation. */
export function stepApp(dt: number): void {
  reveal.d = revealT.get() * routeLength;
  if (phase() === PREVIEW) {
    previewTime += dt;
    setCountdown(Math.max(0, Math.ceil(AUTO_GO - previewTime)));
    if (AUTO_GO > 0 && previewTime >= AUTO_GO) go();
  }
  const arrived = phase() === ARRIVED;
  if (arrived && !arrivedShown) {
    arriveIn.to(1, 0.6, easeOutBack, null, 0.4);
    const p = carOnScreen();
    confetti(p[0], p[1]);
  }
  arrivedShown = arrived;
}

/** First frame: the preview. */
export function startApp(autoGo: boolean): void {
  if (!autoGo) previewTime = -1e9;
  snapTo(OVERVIEW);
  revealT.to(1, 2.2, easeInOut, null, 0.5);
}

/** Scripted states (demo): the drive already under way. */
export function skipPreview(): void { revealT.snap(1); setPhase(DRIVING); snapTo(FOLLOW); }
