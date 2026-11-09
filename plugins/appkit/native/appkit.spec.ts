// zinc:appkit native side (D210, docs/reports/appkit-native-ui-research.md §6): one call applies a frame's changes of the zinc:ui tree to AppKit views;
// their events come back through onEvent. Nodes are zinc:ui handles; the host keeps a generation per handle, so a late event of a deleted view is dropped.
import { NativeModule, requireNative } from 'zinc:native';

export interface Spec extends NativeModule {
  /** Starts the host: AppKit measures the text and field leaves of the layout from now on. False where AppKit cannot run (the stand-in). */
  start(): boolean;
  /** Applies one buffer of ui.setHost's records (lib/std/ui.ts): the views are made, changed, moved and dropped to match. */
  commit(changes: string): void;
  /** The native tree as text, one view per line, indented by depth: `#ID kind x,y wxh` then its text and colours (tests, zinc:appkit's dump()). */
  dump(): string;
  /** Writes what the views show to a PNG (the views drawn offscreen); false when it cannot. */
  snapshot(path: string): boolean;
  /** Test hook: the node whose view AppKit's hit test picks at (x, y) of the surface; -1 when the press goes through the views to zinc:ui. */
  hit(x: f64, y: f64): i32;
  /** Test hook: acts on a view as a person would, through AppKit: 0 types `text` into a field (its field editor), 1 presses Enter in it, 2 scrolls a
   *  scroll view to (x, y). Its events come back as typed or scrolled ones. False when the node has no such view. */
  drive(id: i32, action: i32, text: string, x: f64, y: f64): boolean;
  /** The views' events: kind 0 edit (text, a and b the selection), 1 change (editing ended), 2 submit (Enter), 3 focus, 4 blur, 5 scroll (a, b the offsets). */
  onEvent(cb: (id: i32, kind: i32, text: string, a: f64, b: f64) => void): void;
}
export default requireNative<Spec>('Appkit');
