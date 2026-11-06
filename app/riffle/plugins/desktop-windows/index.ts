// zinc:desktop-windows: what a window switcher needs from macOS. A deterministic run, or RIFFLE_FAKE_WINDOWS=1, sees fixed fake windows and touches nothing on the machine.
import N from './native/desktopwindows.spec';

export interface DesktopWindow {
  id: number; pid: number; app: string; bundle: string; title: string;
  /** On another Space, minimized, or its app hidden: still listed, marked in the row. */
  offSpace: boolean; minimized: boolean; hidden: boolean;
}
export interface ExistingWindow { id: number; pid: number }

export const EVENT_ARM = 1, EVENT_NEXT = 2, EVENT_PREVIOUS = 3, EVENT_COMMIT = 4, EVENT_CANCEL = 5, EVENT_FOCUS = 6, EVENT_WINDOWS = 7, EVENT_RECORDED = 8, EVENT_RAISE_FAILED = 9;
/** A recorded chord's value: the key code plus this much per modifier mask. */
export const RECORDED_MODIFIER_UNIT = 256;
export const MOD_COMMAND = 1, MOD_OPTION = 2, MOD_CONTROL = 4;
export const KEY_TAB = 48;

export const isFake: boolean = N.fake();
const FAKE_WINDOWS: DesktopWindow[] = [
  { id: 11, pid: 1, app: 'Notes', bundle: 'fake.notes', title: 'Groceries', offSpace: false, minimized: false, hidden: false },
  { id: 12, pid: 2, app: 'Safari', bundle: 'fake.safari', title: 'Zinc documentation', offSpace: false, minimized: false, hidden: false },
  { id: 13, pid: 3, app: 'Terminal', bundle: 'fake.terminal', title: 'zinc run app/riffle', offSpace: true, minimized: false, hidden: false },
  { id: 14, pid: 4, app: 'Mail', bundle: 'fake.mail', title: 'All Inboxes', offSpace: false, minimized: true, hidden: false },
  { id: 16, pid: 6, app: 'Calendar', bundle: 'fake.calendar', title: 'Week', offSpace: false, minimized: false, hidden: true },
  { id: 17, pid: 7, app: 'Music', bundle: 'fake.music', title: 'Library', offSpace: false, minimized: false, hidden: false },
  { id: 18, pid: 8, app: 'Finder', bundle: 'fake.finder', title: 'Documents', offSpace: false, minimized: false, hidden: false },
  { id: 19, pid: 8, app: 'Finder', bundle: 'fake.finder', title: 'Downloads', offSpace: false, minimized: false, hidden: false },
  { id: 20, pid: 9, app: 'Messages', bundle: 'fake.messages', title: 'Friends', offSpace: false, minimized: false, hidden: false },
  { id: 15, pid: 5, app: 'Discord', bundle: 'fake.discord', title: '#👋〡bonjour | été 日本語 - Discord', offSpace: false, minimized: false, hidden: false },
];

export function listWindows(): DesktopWindow[] {
  if (isFake) return FAKE_WINDOWS;
  return JSON.parse(N.windows()) as DesktopWindow[];
}
export function existingWindows(): ExistingWindow[] {
  if (isFake) return FAKE_WINDOWS.map((w: DesktopWindow) => ({ id: w.id, pid: w.pid }));
  const pairs = JSON.parse(N.existing()) as number[][];
  return pairs.map((pair: number[]) => ({ id: pair[0], pid: pair[1] }));
}
export function hasPermission(prompt: boolean): boolean { return isFake || N.trusted(prompt); }
export function listen(handler: (kind: number, value: number) => void): void { N.listen(handler); }
export function start(withHotkey: boolean = true): boolean { return isFake || N.start(withHotkey); }
export function setHotkey(keyCode: number, modifiers: number): void { N.setHotkey(keyCode, modifiers); }
export function recordHotkey(on: boolean): void { N.recordHotkey(on); }
export function disarm(): void { N.disarm(); }
export function refresh(): void { if (!isFake) N.refresh(); }
export function frontmostPid(): number { return isFake ? 1 : N.frontmostPid(); }
export function appIcon(pid: number): u8[] { return isFake ? [] : N.appIcon(pid); }
export function setTarget(id: number, pid: number): void { if (!isFake) N.setTarget(id, pid); }
export function focusWindow(id: number, pid: number): void { if (!isFake) N.focus(id, pid); }
export function showOverlay(width: number, height: number): void { if (!isFake) N.showOverlay(width, height); }
export function revealOverlay(): void { if (!isFake) N.revealOverlay(); }
export function hideOverlay(): void { if (!isFake) N.hideOverlay(); }
export function resizeOverlay(width: number, height: number): void { if (!isFake) N.resizeOverlay(width, height); }
export function setDarkAppearance(dark: boolean): void { if (!isFake) N.setDarkAppearance(dark); }
export function endOverlay(): void { if (!isFake) N.endOverlay(); }
