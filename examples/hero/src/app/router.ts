// Navigation: the intro, five tabs, and the artwork detail pushed over the Gallery.
//
// Every screen stays mounted; what moves is a transition progress. When the tab changes, the old screen slides
// out and the new one slides in from the side of travel (tab order), both fading, driven by one Tween.
// Each screen gets an Entrance clock restarted when it appears, so its content can stagger in again.
import { createSignal } from 'zinc:ui/solid';
import { Tween, Entrance, easeInOut, easeOut } from './motion';

export class TabInfo {
  label: string; hint: string; key: string;
  constructor(label: string, hint: string, key: string) { this.label = label; this.hint = hint; this.key = key; }
}
export const TABS: TabInfo[] = [
  new TabInfo('Home', 'Live numbers and charts', '1'),
  new TabInfo('Gallery', 'Generative artworks', '2'),
  new TabInfo('Playground', 'Drag and throw the balls', '3'),
  new TabInfo('Tasks', 'Add, check, remove', '4'),
  new TabInfo('Settings', 'Theme, motion, profile', '5'),
];
export const HOME: i32 = 0, GALLERY: i32 = 1, PLAYGROUND: i32 = 2, TASKS: i32 = 3, SETTINGS: i32 = 4;

export const [tab, setTabSignal] = createSignal<i32>(HOME);
export const [prevTab, setPrevTab] = createSignal<i32>(-1);
/** 0 → 1 while the current tab slides in. */
export const slide = new Tween(1);
export const entrances: Entrance[] = TABS.map((t: TabInfo) => new Entrance());

const SHIFT: number = 56;   // px travelled by a screen during a tab change

export function go(i: i32): void {
  if (i === tab() || i < 0 || i >= TABS.length) return;
  closeDetail();
  setPrevTab(tab());
  setTabSignal(i);
  slide.snap(0);
  slide.to(1, 0.42, easeInOut);
  entrances[i].restart();
}
export function next(dir: i32): void { go((tab() + dir + TABS.length) % TABS.length); }

/** +1 when travelling to a later tab, -1 to an earlier one. */
function direction(): number { return tab() > prevTab() ? 1 : -1; }

/** Style of screen `i`: visible when current or leaving, offset and faded by the transition. */
export function screenHidden(i: i32): number {
  return i === tab() || (i === prevTab() && slide.get() < 1) ? 0 : 1;
}
export function screenX(i: i32): number {
  const p = slide.get();
  if (i === tab()) return Math.round((1 - p) * SHIFT * direction());
  if (i === prevTab()) return Math.round(-p * SHIFT * direction());
  return 0;
}
export function screenOpacity(i: i32): number {
  const p = slide.get();
  return i === tab() ? p : i === prevTab() ? 1 - p : 0;
}

// ---- intro: covers the app at launch, zooms away on "Get started"
export const [introShown, setIntroShown] = createSignal<boolean>(true);
/** 0 while the intro is up, 1 once it has gone. */
export const introOut = new Tween(0);
export const introEntrance = new Entrance();

export function leaveIntro(): void {
  if (introOut.moving() || !introShown()) return;
  introOut.to(1, 0.7, easeInOut, () => setIntroShown(false));
  entrances[tab()].restart();
}
export function replayIntro(): void {
  introOut.snap(0);
  setIntroShown(true);
  introEntrance.restart();
}

// ---- detail: an artwork opened from the Gallery (shared-element transition, see screens/Detail.tsx)
export const [detail, setDetail] = createSignal<i32>(-1);
/** 0 → 1 while the detail opens (and back to 0 when it closes). */
export const detailT = new Tween(0);
/** Where the artwork starts from: the card's canvas box, relative to the stage. */
export let fromX: number = 0, fromY: number = 0, fromW: number = 0, fromH: number = 0;

export function openDetail(i: i32, x: number, y: number, w: number, h: number): void {
  fromX = x; fromY = y; fromW = w; fromH = h;
  setDetail(i);
  detailT.to(1, 0.55, easeOut);
}
export function closeDetail(): void {
  if (detail() < 0) return;
  detailT.to(0, 0.4, easeInOut, () => setDetail(-1));
}
/** Opens artwork `i` without a card to grow from (palette, shortcuts): it grows from the middle of the stage. */
export function openDetailByIndex(i: i32): void {
  go(GALLERY);
  openDetail(i, -1, -1, 0, 0);
}
/** Next / previous artwork while the detail is open. */
export function stepDetail(dir: i32, count: i32): void {
  if (detail() >= 0) setDetail((detail() + dir + count) % count);
}
