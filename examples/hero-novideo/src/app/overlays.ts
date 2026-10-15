// Things drawn above the app: toasts (bottom right), one modal dialog, and the command palette.
import { createSignal } from 'zinc:ui/solid';
import { Tween, Spring, easeOut, easeInOut } from './motion';

// ---- toasts: slide in with a spring, leave after a few seconds (or on click)
export class Toast {
  id: i32; title: string; body: string; tone: string;   // tone: 'default' | 'success' | 'destructive'
  enter: Spring = new Spring(1, 240, 22);                 // 1 = off to the right, 0 = in place
  fade: Tween = new Tween(1);
  age: number = 0;
  leaving: boolean = false;
  constructor(id: i32, title: string, body: string, tone: string) { this.id = id; this.title = title; this.body = body; this.tone = tone; }
}
const LIFETIME: number = 3.2;
const MAX_TOASTS: i32 = 4;
let nextToast: i32 = 1;
export const [toasts, setToasts] = createSignal<Toast[]>([]);

export function toast(title: string, body: string = '', tone: string = 'default'): void {
  const t = new Toast(nextToast++, title, body, tone);
  const list = toasts().slice();
  list.push(t);
  if (list.length > MAX_TOASTS) dismiss(list[0]);
  setToasts(list);
  t.enter.to(0);
}
export function dismiss(t: Toast): void {
  if (t.leaving) return;
  t.leaving = true;
  t.fade.to(0, 0.25, easeOut, () => setToasts(toasts().filter((x: Toast) => x !== t)));
}
/** Ages the toasts; the oldest ones leave by themselves. */
export function stepToasts(dt: number): void {
  for (const t of toasts()) { t.age += dt; if (t.age > LIFETIME) dismiss(t); }
}

// ---- modal dialog: one at a time; the actions are callbacks
export class Dialog {
  title: string; body: string; confirm: string; destructive: boolean; onConfirm: () => void;
  constructor(title: string, body: string, confirm: string, destructive: boolean, onConfirm: () => void) {
    this.title = title; this.body = body; this.confirm = confirm; this.destructive = destructive; this.onConfirm = onConfirm;
  }
}
export const [dialog, setDialog] = createSignal<Dialog | null>(null);
/** 0 closed → 1 open (backdrop and panel animate from it). */
export const dialogT = new Tween(0);

export function openDialog(d: Dialog): void { setDialog(d); dialogT.to(1, 0.3, easeOut); }
export function closeDialog(): void {
  if (dialog() === null) return;
  dialogT.to(0, 0.22, easeInOut, () => setDialog(null));
}

// ---- command palette (Cmd/Ctrl+K)
export const [paletteOpen, setPaletteOpen] = createSignal<boolean>(false);
export const paletteT = new Tween(0);
export function openPalette(): void { setPaletteOpen(true); paletteT.to(1, 0.25, easeOut); }
export function closePalette(): void {
  if (!paletteOpen()) return;
  paletteT.to(0, 0.18, easeInOut, () => setPaletteOpen(false));
}
/** True while any overlay takes the keyboard (Escape closes it first). */
export function overlayOpen(): boolean { return dialog() !== null || paletteOpen(); }
