// zinc:screen-capture/picker — the share dialog of a call app (docs/plugins/screen-capture.md): the screens, then the windows grouped by
// application (its icon and name), each with a thumbnail refreshed while the dialog is open; one selected; the quality to send (resolution
// 720p, 1080p or Source; 15, 30 or 60 frames a second; the pointer or not); Share or Cancel. pickScreen() resolves with what was chosen,
// ready for ScreenCapture.open(c.sourceId, c) or getDisplayMedia({ video: { deviceId: c.sourceId, ... } }), or null when cancelled.
// Built with zinc:ui's nodes on its own modal layer, in the kit theme's colours, so it works the same under the Solid and the React models
// and needs nothing mounted.
import * as ui from 'zinc:ui';
import { theme } from 'zinc:ui/kit';
import { CaptureSource, SourceKind, getSources, permissionStatus, requestPermission } from 'zinc:screen-capture';

/** What the person chose: the source and the box and rate to capture at (Source: the source's own size). */
export interface ShareChoice { sourceId: string; width: number; height: number; frameRate: number; cursor: boolean; resolution: string }
export interface PickerOptions {
  title?: string;                // 'Share your screen'
  shareLabel?: string;           // 'Share'
  types?: SourceKind[];          // both by default
  resolution?: string;           // the choice shown first: '720' (default), '1080' or 'source'
  frameRate?: number;            // 15, 30 (default) or 60
  cursor?: boolean;              // the pointer drawn (default true)
  cursorOption?: boolean;        // offer the pointer's switch (default true)
  /** A quality the person may not choose (an account's limit): shown dimmed, with `lockedNote`. */
  allowed?: (resolution: string, frameRate: number) => boolean;
  lockedNote?: string;
}

const RESOLUTIONS = ['720', '1080', 'source'], RATES = [15, 30, 60];
const THUMB_W = 176, THUMB_H = 99, REFRESH_MS = 1500;
const DENIED = 'screen recording permission is not granted: allow this app in System Settings > Privacy & Security > Screen & System Audio Recording, then quit and open it again';

/** The box a resolution asks for: 1280 x 720, 1920 x 1080, or the source's size. */
export function resolutionBox(resolution: string, source: CaptureSource | null): number[] {
  if (resolution === '1080') return [1920, 1080];
  if (resolution === 'source') return source !== null ? [source.width, source.height] : [0, 0];
  return [1280, 720];
}
const label = (r: string): string => r === 'source' ? 'Source' : `${r}p`;

class Picker {
  o: PickerOptions;
  sources: CaptureSource[] = [];
  picked = '';
  res: string;
  fps: number;
  cursor: boolean;
  root: i32;
  body: i32;
  timer = -1;
  listing = false;
  done: (c: ShareChoice | null) => void;

  constructor(o: PickerOptions, sources: CaptureSource[], done: (c: ShareChoice | null) => void) {
    this.o = o; this.sources = sources; this.done = done;
    this.res = o.resolution ?? '720'; this.fps = o.frameRate ?? 30; this.cursor = o.cursor ?? true;
    if (!this.ok(this.res, this.fps)) { this.res = '720'; this.fps = 30; }
    this.picked = sources.length > 0 ? sources[0].id : '';
    this.root = ui.createNode(ui.VIEW);
    ui.setClass(this.root, 'absolute inset-0 items-center justify-center');
    ui.setRole(this.root, 'dialog');
    ui.setLabel(this.root, o.title ?? 'Share your screen');
    this.body = ui.createNode(ui.VIEW);
    ui.insert(this.root, this.body, -1);
    this.build();
    ui.openLayer(this.root, { priority: 200, modal: true, backdrop: 0x000000, backdropAlpha: 128, motion: 'scale' });
    ui.focusScope(this.root, { trap: true, restore: true, autoFocus: true });
    ui.onDismiss(this.root, () => { this.close(null); });
    ui.onOutsidePointer(this.body, (e: ui.PointerEvent) => { this.close(null); });
    // thumbnails refreshed while open (a new list frees the old images: the nodes take the new ones at once)
    this.timer = setInterval(() => { this.refresh(); }, REFRESH_MS);
  }
  ok(r: string, f: number): boolean { const a = this.o.allowed; return a === undefined || a(r, f); }
  private refresh(): void {
    if (this.listing) return;
    this.listing = true;
    getSources({ types: this.o.types, thumbnailSize: { width: THUMB_W, height: THUMB_H } }).then((s: CaptureSource[]) => {
      this.listing = false;
      if (this.timer < 0) return;
      this.sources = s;
      if (s.find((x: CaptureSource) => x.id === this.picked) === undefined) this.picked = s.length > 0 ? s[0].id : '';
      this.build();
    }, (e: Error) => { this.listing = false; });
  }
  close(c: ShareChoice | null): void {
    if (this.timer < 0) return;
    clearInterval(this.timer);
    this.timer = -1;
    ui.closeLayer(this.root);
    ui.destroy(this.root);
    if (open === this) open = null;
    this.done(c);
  }
  share(): void {
    const src = this.sources.find((x: CaptureSource) => x.id === this.picked);
    if (src === undefined) return;
    const box = resolutionBox(this.res, src);
    this.close({ sourceId: src.id, width: box[0], height: box[1], frameRate: this.fps, cursor: this.cursor, resolution: this.res });
  }

  // ---------------------------------------------------------------- the nodes, built again on each change (a small tree)
  private el(tag: i32, cls: string, parent: i32): i32 { const n = ui.createNode(tag); ui.setClass(n, cls); ui.insert(parent, n, -1); return n; }
  private text(s: string, cls: string, parent: i32): i32 { const n = this.el(ui.TEXT, cls, parent); ui.setText(n, s); return n; }
  private build(): void {
    const t = theme(), b = this.body;
    ui.clearChildren(b);
    ui.setClass(b, `flex-col gap-4 p-6 w-[640px] rounded-lg border border-${t.border} bg-${t.card} shadow-lg`);
    this.text(this.o.title ?? 'Share your screen', `text-lg font-semibold tracking-tight text-${t.foreground}`, b);
    const list = this.el(ui.SCROLL, 'h-[300] flex-col', b);
    const screens = this.sources.filter((s: CaptureSource) => s.kind === 'screen');
    if (screens.length > 0) this.group('Screens', -1, screens, list);
    const apps: string[] = [];
    for (const s of this.sources) if (s.kind === 'window' && apps.indexOf(s.appName) < 0) apps.push(s.appName);
    for (const a of apps) {
      const ws = this.sources.filter((s: CaptureSource) => s.kind === 'window' && s.appName === a);
      this.group(a !== '' ? a : 'Windows', ws[0].appIcon, ws, list);
    }
    if (this.sources.length === 0) this.text('Nothing can be shared now.', `text-sm text-${t.mutedForeground}`, list);
    // the quality
    const q = this.el(ui.VIEW, 'flex-row items-center gap-2', b);
    this.text('Resolution', `w-[84] text-sm text-${t.mutedForeground}`, q);
    for (const r of RESOLUTIONS) this.chip(label(r), this.res === r, this.ok(r, this.fps), q, () => { this.res = r; });
    const q2 = this.el(ui.VIEW, 'flex-row items-center gap-2', b);
    this.text('Frame rate', `w-[84] text-sm text-${t.mutedForeground}`, q2);
    for (const f of RATES) this.chip(`${f} fps`, this.fps === f, this.ok(this.res, f), q2, () => { this.fps = f; });
    if (this.o.cursorOption ?? true) { this.el(ui.VIEW, 'grow', q2); this.chip('Show pointer', this.cursor, true, q2, () => { this.cursor = !this.cursor; }); }
    // the buttons
    const foot = this.el(ui.VIEW, 'flex-row justify-end gap-2', b);
    const cancel = this.el(ui.VIEW, `h-[36] px-4 rounded-md items-center justify-center border border-${t.border} hover:bg-${t.subtle}`, foot);
    this.text('Cancel', `text-sm text-${t.foreground}`, cancel);
    ui.setRole(cancel, 'button');
    ui.listen(cancel, () => { this.close(null); });
    const can = this.picked !== '';
    const go = this.el(ui.VIEW, `h-[36] px-4 rounded-md items-center justify-center bg-${t.primary} ${can ? `hover:bg-${t.primaryFocus}` : 'opacity-50'}`, foot);
    this.text(this.o.shareLabel ?? 'Share', `text-sm font-medium text-${t.primaryForeground}`, go);
    ui.setRole(go, 'button');
    ui.listen(go, () => { this.share(); });
  }
  private group(title: string, icon: i32, list: CaptureSource[], parent: i32): void {
    const t = theme();
    const head = this.el(ui.VIEW, 'flex-row items-center gap-2 pt-2 pb-1', parent);
    if (icon >= 0) { const i = this.el(ui.IMAGE, 'w-[20] h-[20]', head); ui.setImageHandle(i, icon); }
    this.text(title, `text-sm font-semibold text-${t.foreground}`, head);
    const row = this.el(ui.VIEW, 'flex-row flex-wrap gap-2', parent);
    for (const s of list) {
      const on = s.id === this.picked;
      const card = this.el(ui.VIEW, `w-[${THUMB_W + 8}] flex-col gap-1 p-1 rounded-md border-2 ${on ? `border-${t.primary}` : `border-${t.card} hover:bg-${t.muted}`}`, row);
      ui.setRole(card, 'option');
      ui.setLabel(card, `${s.name}${on ? ', selected' : ''}`);
      const img = this.el(ui.IMAGE, `w-[${THUMB_W}] h-[${THUMB_H}] rounded bg-black object-contain`, card);
      if (s.thumbnail >= 0) ui.setImageHandle(img, s.thumbnail);
      this.text(s.name, `text-xs text-${t.foreground} truncate`, card);
      const id = s.id;
      ui.listen(card, () => { this.picked = id; this.build(); });
    }
  }
  private chip(text: string, on: boolean, ok: boolean, parent: i32, pick: () => void): void {
    const t = theme();
    const c = this.el(ui.VIEW, `h-[28] px-3 rounded-full items-center justify-center ${on ? `bg-${t.primary}` : `bg-${t.muted}`} ${ok ? '' : 'opacity-50'}`, parent);
    this.text(ok || this.o.lockedNote === undefined ? text : `${text} · ${this.o.lockedNote}`, `text-xs ${on ? `text-${t.primaryForeground}` : `text-${t.foreground}`}`, c);
    ui.setRole(c, 'button');
    ui.setLabel(c, `${text}${on ? ', selected' : ''}${ok ? '' : ', not available'}`);
    if (ok) ui.listen(c, () => { pick(); this.build(); });
  }
}
let open: Picker | null = null;

/** Opens the share dialog (the system's screen recording question first, once; a background run never asks). Resolves with the choice, or
 *  null when cancelled; rejects with the reason when nothing can be listed. One dialog at a time: a second call cancels the first. */
export async function pickScreen(o: PickerOptions = {}): Promise<ShareChoice | null> {
  if (permissionStatus() !== 'granted' && await requestPermission() !== 'granted') throw new Error(DENIED);
  const sources = await getSources({ types: o.types, thumbnailSize: { width: THUMB_W, height: THUMB_H } });
  const old = open;
  if (old !== null) old.close(null);
  return new Promise<ShareChoice | null>((resolve: (c: ShareChoice | null) => void) => { open = new Picker(o, sources, resolve); });
}
/** The dialog is open. */
export function pickerOpen(): boolean { return open !== null; }
/** Presses Share (with the source `id` selected first when given) or Cancel of the open dialog: keyboard shortcuts and scripted sessions. */
export function confirmPicker(id: string = ''): void { const p = open; if (p === null) return; if (id !== '') p.picked = id; p.share(); }
export function cancelPicker(): void { const p = open; if (p !== null) p.close(null); }
