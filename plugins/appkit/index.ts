// zinc:appkit: the zinc:ui tree shown with real AppKit views (D210, docs/ui.md "Native views"). Importing it is enough: under "ui": {"render": "native"}
// (or ZINC_RENDER=native) on macOS it installs the native host, which zinc:ui hands each changed frame (ui.setHost); elsewhere it does nothing and the
// tree is drawn. Clicks, hover and drags fall through the views to zinc:ui's own hit testing, so they are the drawn UI's events; the views that take
// input themselves (fields, scroll views) report through the functions the web's DOM host uses.
import * as ui from 'zinc:ui';
import { windowCtl } from 'zinc:gfx';
import A from './native/appkit.spec';

const EDIT = 0, CHANGE = 1, SUBMIT = 2, FOCUS = 3, BLUR = 4, SCROLL = 5, PRESS = 6, RESIZE = 7;

function onEvent(id: i32, kind: i32, text: string, a: number, b: number): void {
  if (!ui.hostMounted(id)) return;   // the node went, or its handle holds another node now
  if (kind === EDIT) ui.domEdit(id, text, a, b);
  else if (kind === CHANGE) ui.domChanged(id);
  else if (kind === SUBMIT) ui.submitFrom(id);
  else if (kind === FOCUS) ui.domFocus(id, false);
  else if (kind === BLUR) { if (ui.focused() === id) ui.domFocus(-1, false); }
  else if (kind === SCROLL) ui.domScroll(id, a, b);
  else if (kind === PRESS) ui.click(id);   // a toolbar item: its onPress, as a press of the drawn item
  else if (kind === RESIZE) ui.setNumber(id, 'width', a);   // a split pane the divider moved: its Yoga subtree is laid out again at that width
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
 *  (x, y), 3 sends the field editor of `h` the command `text` ('insertTab:'), 4 drags the first divider of split view `h` to x, 5 clicks toolbar item
 *  `h`. The events come back at the next frame as a person's would. False when no host runs or h has no such view. */
export function drive(h: i32, action: i32, text: string = '', x: number = 0, y: number = 0): boolean { return shown && A.drive(h, action, text, x, y); }

// ---------------------------------------------------------------- the window chrome (ZN-1071): typed components with a drawn fallback
// Each is a zinc:ui node with a native kind (ui.setNativeKind): under the AppKit host it becomes the window's own chrome (title, NSToolbar,
// NSSplitView, a sidebar material); anywhere else (drawn, Linux, a Pi, the web) the same node draws a plain equivalent from its classes.
function el(tag: i32, cls: string): i32 { const h = ui.createNode(tag); ui.setClass(h, cls); return h; }
function slot(h: i32, children: (() => i32) | undefined): i32 { if (children !== undefined) ui.insert(h, children(), -1); return h; }

export interface WindowProps {
  title?: string;
  toolbarStyle?: string;      // 'automatic' | 'expanded' | 'preference' | 'unified' (the default) | 'unifiedCompact'
  fullSizeContent?: boolean;  // the content runs under a transparent title bar (pad its top)
  className?: string;
  children?: () => i32;
}
/** `<Window title="Library">`: the app's window, a column that fills it. Native: its title, toolbar style and title bar; drawn: the title through the HAL. */
export function Window(p: WindowProps): i32 {
  const h = el(ui.VIEW, `flex-col w-full h-full ${p.className ?? ''}`);
  ui.setNativeKind(h, 'window');
  const title = p.title ?? '';
  if (title !== '') { ui.setNativeAttr(h, 'title', title); if (!shown) windowCtl(0, 3, title, 0, 0); }
  ui.setNativeAttr(h, 'toolbarStyle', p.toolbarStyle ?? 'unified');
  ui.setNativeAttr(h, 'fullSizeContent', p.fullSizeContent === true ? '1' : '0');
  return slot(h, p.children);
}

export interface ToolbarProps { className?: string; children?: () => i32 }
/** `<Toolbar>` of ToolbarItems: the window's NSToolbar under the host (it takes no room in the content); drawn, a bar across the top. */
export function Toolbar(p?: ToolbarProps): i32 {
  const h = el(ui.VIEW, shown ? 'absolute left-0 top-0 flex-row items-center gap-[8px]' : `flex-row items-center gap-[8px] px-[12px] h-[38px] bg-[#ececec] border-b border-[#d0d0d0] ${p?.className ?? ''}`);
  ui.setNativeKind(h, 'toolbar');
  return slot(h, p?.children);
}

export interface ToolbarItemProps {
  label?: string;
  symbol?: string;          // an SF Symbol name ('plus', 'trash'); drawn, the label shows instead
  onPress?: () => void;
  children?: () => i32;     // a custom item (a search field): the item is this content at the size its layout gives
}
/** One item of a Toolbar: a labelled button with a symbol, or custom content. */
export function ToolbarItem(p: ToolbarItemProps): i32 {
  const label = p.label ?? '';
  const h = el(ui.VIEW, p.children !== undefined || shown ? 'flex-row items-center' : 'flex-row items-center px-[8px] h-[28px] rounded-[6px]');
  ui.setNativeKind(h, 'toolbaritem');
  ui.setNativeAttr(h, 'label', label);
  ui.setNativeAttr(h, 'symbol', p.symbol ?? '');
  const f = p.onPress;
  if (f !== undefined) ui.listen(h, f);
  if (p.children !== undefined) return slot(h, p.children);
  if (!shown && label !== '') { const t = ui.createText(label); ui.setClass(t, 'text-[13px] text-[#333333]'); ui.insert(h, t, -1); }
  return h;
}

export interface SplitViewProps { className?: string; children?: () => i32 }
/** `<SplitView>` of panes side by side (a Sidebar first): an NSSplitView whose divider resizes the sidebar, its subtree laid out again; drawn, a row. */
export function SplitView(p?: SplitViewProps): i32 {
  const h = el(ui.VIEW, `flex-row ${shown ? 'gap-[1px] ' : ''}${p?.className ?? ''}`);   // the host's thin divider is 1 px between the panes
  ui.setNativeKind(h, 'split');
  return slot(h, p?.children);
}

export interface SidebarProps {
  width?: number;      // its first width (220)
  minWidth?: number;   // how far the divider moves it (150 to 400)
  maxWidth?: number;
  className?: string;
  children?: () => i32;
}
/** The first pane of a SplitView: the system's sidebar material under the host, which holds its width when the window resizes; drawn, a grey column. */
export function Sidebar(p?: SidebarProps): i32 {
  const h = el(ui.VIEW, `flex-col ${shown ? '' : 'bg-[#e8e8e8] border-r border-[#d0d0d0] '}${p?.className ?? ''}`);
  ui.setNumber(h, 'width', p?.width ?? 220);
  ui.setNativeKind(h, 'sidebar');
  ui.setNativeAttr(h, 'minWidth', '' + (p?.minWidth ?? 150));
  ui.setNativeAttr(h, 'maxWidth', '' + (p?.maxWidth ?? 400));
  return slot(h, p?.children);
}
