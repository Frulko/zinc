// zinc:appkit: the zinc:ui tree shown with real AppKit views (D210, docs/ui.md "Native views"). Importing it is enough: under "ui": {"render": "native"}
// (or ZINC_RENDER=native) on macOS it installs the native host, which zinc:ui hands each changed frame (ui.setHost); elsewhere it does nothing and the
// tree is drawn. Clicks, hover and drags fall through the views to zinc:ui's own hit testing, so they are the drawn UI's events; the views that take
// input themselves (fields, scroll views) report through the functions the web's DOM host uses.
import * as ui from 'zinc:ui';
import A from './native/appkit.spec';

const EDIT = 0, CHANGE = 1, SUBMIT = 2, FOCUS = 3, BLUR = 4, SCROLL = 5;

function onEvent(id: i32, kind: i32, text: string, a: number, b: number): void {
  if (!ui.hostMounted(id)) return;   // the node went, or its handle holds another node now
  if (kind === EDIT) ui.domEdit(id, text, a, b);
  else if (kind === CHANGE) ui.domChanged(id);
  else if (kind === SUBMIT) ui.submitFrom(id);
  else if (kind === FOCUS) ui.domFocus(id, false);
  else if (kind === BLUR) { if (ui.focused() === id) ui.domFocus(-1, false); }
  else if (kind === SCROLL) ui.domScroll(id, a, b);
}

let shown = false;
if (ui.nativeRender() && A.start()) {
  A.onEvent(onEvent);
  shown = ui.setHost((changes: string) => { A.commit(changes); });
}

/** Whether AppKit views show the tree (render native on macOS); false where it is drawn. */
export function hostShown(): boolean { return shown; }
/** The native tree as text, one view per line indented by depth (`#ID kind x,y wxh`, then its text and colours): what tests compare. Empty when no host runs. */
export function dump(): string { return shown ? A.dump() : ''; }
/** Writes what the views show to a PNG at `path` (drawn offscreen, for people: it changes with each macOS); false when no host runs. */
export function snapshot(path: string): boolean { return shown && A.snapshot(path); }
/** Test hook: the node whose view AppKit's hit test picks at (x, y); -1 when a press there goes through the views to zinc:ui's own hit testing. */
export function hit(x: number, y: number): i32 { return shown ? A.hit(x, y) : -1; }
/** Test hook (as ui.pointerAt is for the drawn UI): 0 types `text` into field `h` through AppKit, 1 presses Enter in it, 2 scrolls scroll view `h` to
 *  (x, y). The events come back at the next frame as a person's would. False when no host runs or h has no such view. */
export function drive(h: i32, action: i32, text: string = '', x: number = 0, y: number = 0): boolean { return shown && A.drive(h, action, text, x, y); }
