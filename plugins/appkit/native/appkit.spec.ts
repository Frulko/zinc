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
   *  scroll view to (x, y), 3 sends a field editor the command `text` (insertTab:), 4 drags the first divider of a split view to x, 5 clicks a toolbar
   *  item; on a Table or an Outline: 2 scrolls the table to (x, y), 6 sorts by column `text` (x 1: ascending) as its header does, 7 selects rows
   *  "3,4" (an Outline: the item id), 8 types the keys of `text` into it (type-select), 9 expands (x 1) or collapses item `text` of an Outline;
   *  on a control: 10 clicks it (a push button, a switch, a check box), 11 sets its value as the person would (a pop-up's item `text`, a segment
   *  `text`, a slider's x, a date `text`); on an alert, a sheet or a popover: 12 ends it (an alert's button x, -1 dismissed).
   *  Its events come back as a person's would. False when the node has no such view. */
  drive(id: i32, action: i32, text: string, x: f64, y: f64): boolean;
  /** The views' events: kind 0 edit (text, a and b the selection), 1 change (editing ended), 2 submit (Enter), 3 focus, 4 blur, 5 scroll (a, b the offsets), 6 press (a toolbar item), 7 resize (a split pane: a, b its new size);
   *  a Table's and an Outline's: 8 select (text: the rows "3,4", an Outline's item id), 9 sort (text the column, a 1 ascending), 10 type-select (text
   *  the string, a the row to search from), 11 open (a the row), 12 expand (text the item id, a 1 open), 13 rows (b the table's top in view), 14 focus;
   *  a control's: 15 press (a push button), 16 value (text: '1' or '0', the item, the segment, the number, the date); 17 an overlay ended (a: an alert's button, -1 dismissed). */
  onEvent(cb: (id: i32, kind: i32, text: string, a: f64, b: f64) => void): void;
}
export default requireNative<Spec>('Appkit');
