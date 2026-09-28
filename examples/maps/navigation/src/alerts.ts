// Waze-style alerts: pins on the map (police, hazard, traffic) that pop up with a bounce as the car approaches and
// shrink away once passed, an alert card for the closest one ahead, the report menu (drops a pin at the car) and
// toasts. Pin sizes are plain springs stepped here (the scene reads them every frame).
import { createSignal } from 'zinc:ui/solid';
import { car, JAM_FROM, JAM_TO } from './sim';
import { Tween, easeOut, easeOutBack } from './motion';

export const POLICE: i32 = 0, HAZARD: i32 = 1, TRAFFIC: i32 = 2;
export const KIND_NAMES: string[] = ['Police', 'Hazard', 'Traffic jam'];
export const KIND_COLORS: u32[] = [0x2f6fed, 0xff8a00, 0xe5383b];

export class Alert {
  /** Size of the pin 0..1 (overshoots when it pops). */
  pop: number = 0;
  private v: number = 0;
  constructor(
    /** metres along the route */
    public at: number,
    public kind: i32,
    public title: string,
    public detail: string,
    /** reported by the user: shown at once, no card */
    public mine: boolean,
  ) {}
  step(dt: number): void {
    const ahead = this.at - car.d;
    const want = (ahead < 700 && ahead > -40) || (this.mine && ahead > -40) ? 1 : 0;
    // bouncy spring (stiffness 260, damping 13), small substeps
    const n: i32 = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i: i32 = 0; i < n; i++) { this.v += (260 * (want - this.pop) - 13 * this.v) * h; this.pop += this.v * h; }
    if (want === 0 && this.pop < 0.02) { this.pop = 0; this.v = 0; }
  }
}

const jamDelay: i32 = Math.round(((JAM_TO - JAM_FROM) / (8 / 3.6) - (JAM_TO - JAM_FROM) / 8) / 60);
export const alerts: Alert[] = [
  new Alert(3310, POLICE, 'Police reported', 'Reported 4 min ago by a Wazer', false),
  new Alert(JAM_FROM, TRAFFIC, 'Heavy traffic ahead', `+${jamDelay} min on Avenue d'Iéna`, false),
  new Alert(6480, HAZARD, 'Object on road', 'Reported 12 min ago', false),
];

// ---------------------------------------------------------------- the alert card (closest alert ahead)
export const [cardIndex, setCardIndex] = createSignal<i32>(-1);
export const [cardDistance, setCardDistance] = createSignal<string>('');
/** 0 hidden .. 1 shown (slide in from the left). */
export const cardIn = new Tween(0);
let shownCard: i32 = -1;

function updateCard(): void {
  let best: i32 = -1;
  for (let i: i32 = 0; i < alerts.length; i++) {
    const ahead = alerts[i].at - car.d;
    if (!alerts[i].mine && ahead > -10 && ahead < 450 && best < 0) best = i;
  }
  if (best >= 0) setCardDistance(alerts[best].at - car.d < 20 ? 'Here' : `${Math.round((alerts[best].at - car.d) / 10) * 10} m ahead`);
  if (best === shownCard) return;
  if (best >= 0) { shownCard = best; setCardIndex(best); cardIn.snap(0); cardIn.to(1, 0.45, easeOutBack); }
  else { shownCard = -1; cardIn.to(0, 0.3, easeOut); }
}

// ---------------------------------------------------------------- report menu and toasts
export const [reportOpen, setReportOpen] = createSignal<boolean>(false);
export const reportIn = new Tween(0);
export function toggleReport(): void {
  const open = !reportOpen();
  setReportOpen(open);
  reportIn.to(open ? 1 : 0, open ? 0.35 : 0.2, open ? easeOutBack : easeOut);
}

export const [toastText, setToastText] = createSignal<string>('');
export const toastIn = new Tween(0);
let toastLeft: number = 0;
export function toast(text: string): void {
  setToastText(text);
  toastIn.to(1, 0.35, easeOutBack);
  toastLeft = 2.6;
}

/** Drops a user report 25 m ahead of the car. */
export function report(kind: i32): void {
  alerts.push(new Alert(car.d + 25, kind, KIND_NAMES[kind], 'Reported by you', true));
  toggleReport();
  toast(`${KIND_NAMES[kind]} reported. Thanks for helping other drivers!`);
}

/** Removes the user's reports (restart). */
export function resetAlerts(): void {
  for (let i: i32 = alerts.length - 1; i >= 0; i--) if (alerts[i].mine) alerts.splice(i, 1);
  for (const a of alerts) a.pop = 0;
}

export function stepAlerts(dt: number): void {
  for (const a of alerts) a.step(Math.min(dt, 0.05));
  updateCard();
  if (toastLeft > 0) { toastLeft -= dt; if (toastLeft <= 0) toastIn.to(0, 0.25, easeOut); }
}
