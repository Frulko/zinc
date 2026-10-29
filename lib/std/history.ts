// zinc:ui/history: a desktop app's back and forward, as a browser's or the Finder's history (docs/ui.md, "Navigation history"). Each entry is
// a value the app gives (its view state: the page, what is open, the search text, the selection); `push` opens a new entry, `back` and
// `forward` move between them. Leaving an entry captures the app's state into it first, so a filter typed or rows picked since it was opened
// come back with it. Cmd+[ and Cmd+] (Ctrl elsewhere), Alt+Left and Alt+Right, the mouse's side buttons, a two-finger swipe sideways and
// Android's back key move through it. Each entry has a key: a ScrollView or VirtualList with `scrollKey={history.scrollKey('albums')}`
// comes back where it was when the entry is shown again, and starts at the top in a new entry, as React Router's <ScrollRestoration> does.
// The stack navigator of zinc:ui/navigation is the mobile model (screens pushed and kept mounted); this is the desktop one (the app re-renders
// from its state).
import * as ui from 'zinc:ui';
import { createSignal, batch } from 'zinc:ui/solid';

const MAX_ENTRIES: i32 = 200;   // the oldest entries are forgotten past this many

export class History<T> {
  entries: T[] = [];
  keys: i32[] = [];
  at: i32 = 0;
  nextKey: i32 = 1;
  capture: () => T;
  apply: (state: T) => void;
  moved: () => i32;
  setMoved: (v: i32) => void;
  constructor(initial: T, capture: () => T, apply: (state: T) => void) {
    this.entries.push(initial); this.keys.push(0);
    this.capture = capture; this.apply = apply;
    const [moved, setMoved] = createSignal<i32>(0);
    this.moved = moved; this.setMoved = setMoved;
  }
  show(): void { const s = this.entries[this.at]; batch(() => { this.apply(s); this.setMoved(this.moved() + 1); }); }
  /** Opens `state` as a new entry after the current one (the entries ahead are dropped, as a browser does) and shows it. */
  push(state: T): void {
    this.entries[this.at] = this.capture();
    this.entries.splice(this.at + 1, this.entries.length - this.at - 1);
    this.keys.splice(this.at + 1, this.keys.length - this.at - 1);
    this.entries.push(state); this.keys.push(this.nextKey++);
    if (this.entries.length > MAX_ENTRIES) { this.entries.shift(); this.keys.shift(); }
    this.at = this.entries.length - 1;
    this.show();
  }
  /** Forgets every entry: `state` is the only one left (another document opened: back has nothing to go to) and is shown. */
  reset(state: T): void { this.entries = [state]; this.keys = [this.nextKey++]; this.at = 0; this.show(); }
  /** The current entry becomes `state` (no new entry) and is shown. */
  replace(state: T): void { this.entries[this.at] = state; this.show(); }
  /** Back one entry; false when there is none. */
  back(): boolean {
    if (this.at === 0) return false;
    this.entries[this.at] = this.capture();
    this.at--;
    this.show();
    return true;
  }
  /** Forward one entry; false when there is none. */
  forward(): boolean {
    if (this.at >= this.entries.length - 1) return false;
    this.entries[this.at] = this.capture();
    this.at++;
    this.show();
    return true;
  }
  canBack(): boolean { this.moved(); return this.at > 0; }
  canForward(): boolean { this.moved(); return this.at < this.entries.length - 1; }
  /** The current entry's key (reactive): unique to the entry, the same when back or forward shows it again. */
  key(): i32 { this.moved(); return this.keys[this.at]; }
  /** A scrollKey for the view `name` in the current entry. */
  scrollKey(name: string): string { return `${name}#${this.key()}`; }
  /** The state of the current entry as it was last captured or shown. */
  current(): T { this.moved(); return this.entries[this.at]; }
}

/** A history whose first entry is `initial`; `capture` reads the app's view state now, `apply` shows a state. The keys, the side buttons,
 *  the swipe and the back key move through it from here on. */
export function createHistory<T>(initial: T, capture: () => T, apply: (state: T) => void): History<T> {
  const h = new History<T>(initial, capture, apply);
  ui.onKey((e: ui.KeyEvent) => {
    if (e.handled || e.shift) return;
    const cmd = e.primary && !e.alt, alt = e.alt && !e.primary;
    if ((cmd && e.key === '[') || (alt && e.key === 'ArrowLeft')) { h.back(); e.handled = true; }
    else if ((cmd && e.key === ']') || (alt && e.key === 'ArrowRight')) { h.forward(); e.handled = true; }
  });
  ui.addBackHandler(() => h.back());
  ui.addForwardHandler(() => h.forward());
  return h;
}
