// zinc:screen-capture/picker — the share dialog of a call app (docs/plugins/screen-capture.md), laid out as Discord's Go Live: tabs Applications,
// Entire screen and (when the app gives `devices`) Devices; a two-column grid of large previews, the application's icon and the name under each,
// one outlined; the previews refresh while the dialog is open without a blink (the old images live until the next listing, and only the image of
// a card changes) and the list keeps its scroll; a search field; a preset line (SD or HD, its resolution and rate) with a settings button for the
// resolution (720p, 1080p or Source), the frame rate (15, 30 or 60) and the pointer; Share or Cancel. pickScreen() resolves with what was chosen,
// ready for ScreenCapture.open(c.sourceId, c) or getDisplayMedia({ video: { deviceId: c.sourceId, ... } }), or null when cancelled.
// Built with zinc:ui's nodes on its own modal layer, in the kit theme's colours, so it works the same under the Solid and the React models
// and needs nothing mounted.
import * as ui from 'zinc:ui';
import { theme } from 'zinc:ui/kit';
import { CaptureSource, SourceKind, getSources, permissionStatus, requestPermission } from 'zinc:screen-capture';

/** What the person chose: the source ('screen', 'window', or 'device' from the Devices tab) and the box and rate to capture at (Source: the source's own size). */
export interface ShareChoice { kind: string; sourceId: string; width: number; height: number; frameRate: number; cursor: boolean; resolution: string }
/** A camera or other device of the Devices tab. */
export interface DeviceItem { id: string; name: string }
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
  lockedNote?: string;           // what unlocks them, in the app's words ('Nitro'): the banner reads "Stream in high resolution with <it>"
  /** The cameras and other devices of the Devices tab (the tab is absent without it). */
  devices?: () => Promise<DeviceItem[]>;
}

const RESOLUTIONS = ['720', '1080', 'source'], RATES = [15, 30, 60];
const THUMB_W = 308, THUMB_H = 173, REFRESH_MS = 1500;
const SD = { name: 'Standard', note: 'Smoother video', res: '720', fps: 30 }, HD = { name: 'High definition', note: 'Sharper video', res: '1080', fps: 60 };
const DENIED = 'screen recording permission is not granted: allow this app in System Settings > Privacy & Security > Screen & System Audio Recording, then quit and open it again';

/** The box a resolution asks for: 1280 x 720, 1920 x 1080, or the source's size. */
export function resolutionBox(resolution: string, source: CaptureSource | null): number[] {
  if (resolution === '1080') return [1920, 1080];
  if (resolution === 'source') return source !== null ? [source.width, source.height] : [0, 0];
  return [1280, 720];
}
const label = (r: string): string => r === 'source' ? 'Source' : `${r}p`;
const TAB_NAMES = { apps: 'Applications', screens: 'Entire screen', devices: 'Devices' };

class Picker {
  o: PickerOptions;
  sources: CaptureSource[] = [];
  devs: DeviceItem[] = [];
  tab = 'apps';
  picked = '';
  res: string;
  fps: number;
  cursor: boolean;
  query = '';
  more = false;   // the settings panel is open
  root: i32;
  body: i32;
  tabsBox: i32;
  list: i32;   // kept across rebuilds: the scroll offset stays while the previews refresh and the search filters
  rest: i32;
  sig = '';
  thumbs: Map<string, i32> = new Map<string, i32>();   // source id -> the image node of its card
  timer = -1;
  listing = false;
  done: (c: ShareChoice | null) => void;

  constructor(o: PickerOptions, sources: CaptureSource[], devs: DeviceItem[], done: (c: ShareChoice | null) => void) {
    this.o = o; this.sources = sources; this.devs = devs; this.done = done;
    this.res = o.resolution ?? '720'; this.fps = o.frameRate ?? 30; this.cursor = o.cursor ?? true;
    if (!this.ok(this.res, this.fps)) { this.res = '720'; this.fps = 30; }
    const tabs = this.tabNames();
    this.tab = tabs.indexOf('apps') >= 0 && sources.some((s: CaptureSource) => s.kind === 'window') ? 'apps' : tabs[0];
    this.root = ui.createNode(ui.VIEW);
    ui.setClass(this.root, 'absolute inset-0 items-center justify-center');
    ui.setRole(this.root, 'dialog');
    ui.setLabel(this.root, o.title ?? 'Share your screen');
    this.body = ui.createNode(ui.VIEW);
    ui.insert(this.root, this.body, -1);
    const t = theme(), b = this.body;
    ui.setClass(b, `flex-col gap-4 p-6 w-[720px] rounded-lg border border-${t.border} bg-${t.card} shadow-lg`);
    const head = this.el(ui.VIEW, 'flex-row items-center gap-4', b);
    this.text(o.title ?? 'Share your screen', `grow text-lg font-semibold tracking-tight text-${t.foreground}`, head);
    const search = this.el(ui.INPUT, `w-[220] h-[32] px-3 rounded-md text-sm border border-${t.input} bg-${t.background} text-${t.foreground}`, head);
    ui.setPlaceholder(search, 'Search');
    ui.setLabel(search, 'Search screens and windows');
    ui.onText(search, false, (v: string) => { this.query = v; this.build(); });
    this.tabsBox = this.el(ui.VIEW, `flex-row gap-1 p-1 rounded-lg bg-${t.background}`, b);
    this.list = this.el(ui.SCROLL, 'h-[372] flex-col', b);
    this.rest = this.el(ui.VIEW, 'flex-col gap-4', b);
    this.build();
    ui.openLayer(this.root, { priority: 200, modal: true, backdrop: 0x000000, backdropAlpha: 128, motion: 'scale' });
    ui.focusScope(this.root, { trap: true, restore: true, autoFocus: true });
    ui.onDismiss(this.root, () => { this.close(null); });
    ui.onOutsidePointer(this.body, (e: ui.PointerEvent) => { this.close(null); });
    this.timer = setInterval(() => { this.refresh(); }, REFRESH_MS);
  }
  ok(r: string, f: number): boolean { const a = this.o.allowed; return a === undefined || a(r, f); }
  private tabNames(): string[] {
    const ty = this.o.types, r: string[] = [];
    if (ty === undefined || ty.indexOf('window') >= 0) r.push('apps');
    if (ty === undefined || ty.indexOf('screen') >= 0) r.push('screens');
    if (this.o.devices !== undefined) r.push('devices');
    return r;
  }
  private refresh(): void {
    if (this.listing) return;
    this.listing = true;
    getSources({ types: this.o.types, thumbnailSize: { width: THUMB_W, height: THUMB_H } }).then((s: CaptureSource[]) => {
      this.listing = false;
      if (this.timer < 0) return;
      this.sources = s;
      const shown = this.shown();
      if (shown.length > 0 && shown.find((x: CaptureSource) => x.id === this.picked) === undefined) this.picked = shown[0].id;
      if (this.signature() !== this.sig) { this.build(); return; }
      // the same cards: each takes its new image (the old ones live until the next listing), nothing is rebuilt
      for (const x of shown) { const n = this.thumbs.get(x.id); if (n !== undefined && x.thumbnail >= 0) ui.setImageHandle(n, x.thumbnail); }
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
    if (this.tab === 'devices') {
      const d = this.devs.find((x: DeviceItem) => x.id === this.picked);
      if (d === undefined) return;
      this.close({ kind: 'device', sourceId: d.id, width: 0, height: 0, frameRate: this.fps, cursor: false, resolution: this.res });
      return;
    }
    if (this.shown().length === 0) return;
    const src = this.sources.find((x: CaptureSource) => x.id === this.picked);
    if (src === undefined) return;
    const box = resolutionBox(this.res, src);
    this.close({ kind: src.kind, sourceId: src.id, width: box[0], height: box[1], frameRate: this.fps, cursor: this.cursor, resolution: this.res });
  }

  // ---------------------------------------------------------------- the tabs, the grid and the quality
  private el(tag: i32, cls: string, parent: i32): i32 { const n = ui.createNode(tag); ui.setClass(n, cls); ui.insert(parent, n, -1); return n; }
  private text(s: string, cls: string, parent: i32): i32 { const n = this.el(ui.TEXT, cls, parent); ui.setText(n, s); return n; }
  /** The sources of the tab the search keeps: its words found in the name or the application's, any case. */
  shown(): CaptureSource[] {
    const q = this.query.trim().toLowerCase(), kind = this.tab === 'screens' ? 'screen' : 'window';
    const ofTab = this.tab === 'devices' ? [] : this.sources.filter((s: CaptureSource) => s.kind === kind);
    return q === '' ? ofTab : ofTab.filter((s: CaptureSource) => `${s.name} ${s.appName}`.toLowerCase().indexOf(q) >= 0);
  }
  private shownDevices(): DeviceItem[] {
    const q = this.query.trim().toLowerCase();
    return q === '' ? this.devs : this.devs.filter((d: DeviceItem) => d.name.toLowerCase().indexOf(q) >= 0);
  }
  /** What the grid holds besides the images: when it changes the cards are built again. */
  private signature(): string {
    const items = this.tab === 'devices' ? this.shownDevices().map((d: DeviceItem) => d.id + d.name) : this.shown().map((s: CaptureSource) => s.id + s.name + (s.thumbnail >= 0 ? '' : '-'));
    return `${this.tab}|${this.picked}|${items.join(',')}`;
  }
  private build(): void {
    const t = theme(), list = this.list;
    if (this.tab === 'devices') {
      const ds = this.shownDevices();
      if (ds.length > 0 && ds.find((x: DeviceItem) => x.id === this.picked) === undefined) this.picked = ds[0].id;
    } else {
      const shown = this.shown();
      if (shown.length > 0 && shown.find((x: CaptureSource) => x.id === this.picked) === undefined) this.picked = shown[0].id;
    }
    ui.clearChildren(this.tabsBox);
    for (const k of this.tabNames()) {
      const on = k === this.tab, name = k === 'apps' ? TAB_NAMES.apps : k === 'screens' ? TAB_NAMES.screens : TAB_NAMES.devices;
      const c = this.el(ui.VIEW, `grow h-[36] rounded-md items-center justify-center ${on ? `bg-${t.muted}` : `hover:bg-${t.muted}`}`, this.tabsBox);
      this.text(name, `text-sm font-medium ${on ? `text-${t.foreground}` : `text-${t.mutedForeground}`}`, c);
      ui.setRole(c, 'tab');
      ui.setLabel(c, `${name}${on ? ', selected' : ''}`);
      ui.listen(c, () => { this.tab = k; this.picked = ''; this.build(); });
    }
    ui.clearChildren(list);
    this.thumbs.clear();
    this.sig = this.signature();
    const grid = this.el(ui.VIEW, 'flex-row flex-wrap gap-4', list);
    if (this.tab === 'devices') {
      const ds = this.shownDevices();
      for (const d of ds) {
        const id = d.id, card = this.card(d.name, id === this.picked, grid);
        const box = this.el(ui.VIEW, `w-[${THUMB_W}] h-[${THUMB_H}] rounded items-center justify-center bg-${t.muted}`, card);
        this.text(d.name, `text-sm text-${t.mutedForeground}`, box);
        this.name(null, d.name, card);
        ui.listen(card, () => { this.picked = id; this.build(); });
      }
      if (ds.length === 0) this.text(this.devs.length === 0 ? 'No device found.' : `Nothing named "${this.query.trim()}".`, `text-sm text-${t.mutedForeground}`, list);
    } else {
      const shown = this.shown();
      for (const s of shown) {
        const id = s.id, card = this.card(s.name, id === this.picked, grid);
        const img = this.el(ui.IMAGE, `w-[${THUMB_W}] h-[${THUMB_H}] rounded bg-black object-contain`, card);
        if (s.thumbnail >= 0) ui.setImageHandle(img, s.thumbnail);
        this.thumbs.set(id, img);
        this.name(s, s.name, card);
        ui.listen(card, () => { this.picked = id; this.build(); });
      }
      if (shown.length === 0) this.text(this.sources.length === 0 ? 'Nothing can be shared now.' : this.query.trim() === '' ? 'Nothing here.' : `Nothing named "${this.query.trim()}".`, `text-sm text-${t.mutedForeground}`, list);
    }
    this.buildRest();
  }
  private card(name: string, on: boolean, parent: i32): i32 {
    const t = theme();
    const card = this.el(ui.VIEW, `w-[${THUMB_W + 12}] flex-col gap-2 p-1 rounded-lg border-2 ${on ? `border-${t.primary}` : `border-${t.card} hover:bg-${t.muted}`}`, parent);
    ui.setRole(card, 'option');
    ui.setLabel(card, `${name}${on ? ', selected' : ''}`);
    return card;
  }
  /** Under a preview: the application's icon (a small screen outline for a screen) and the name. */
  private name(s: CaptureSource | null, name: string, card: i32): void {
    const t = theme();
    const row = this.el(ui.VIEW, 'flex-row items-center gap-2 px-1 pb-1', card);
    if (s !== null && s.appIcon >= 0) { const i = this.el(ui.IMAGE, 'w-[20] h-[20]', row); ui.setImageHandle(i, s.appIcon); }
    else if (s !== null && s.kind === 'screen') this.el(ui.VIEW, `w-[18] h-[12] rounded-sm border-2 border-${t.mutedForeground}`, row);
    this.text(name, `grow text-sm text-${t.foreground} truncate`, row);
  }
  private buildRest(): void {
    const t = theme(), b = this.rest;
    ui.clearChildren(b);
    // the preset line: its name, what it means, resolution and rate; the SD/HD switch and the settings button
    const hdOk = this.ok(HD.res, HD.fps), isHd = this.res === HD.res && this.fps === HD.fps, isSd = this.res === SD.res && this.fps === SD.fps;
    const line = this.el(ui.VIEW, 'flex-row items-center gap-4', b);
    const info = this.el(ui.VIEW, 'grow flex-col gap-1', line);
    this.text(isHd ? HD.name : isSd ? SD.name : 'Custom', `text-lg font-semibold text-${t.foreground}`, info);
    this.text(`${isHd ? HD.note + ' · ' : isSd ? SD.note + ' · ' : ''}${label(this.res)} · ${this.fps}fps`, `text-sm text-${t.mutedForeground}`, info);
    const sw = this.el(ui.VIEW, `flex-row gap-1 p-1 rounded-lg bg-${t.background}`, line);
    this.seg('SD', isSd, true, sw, () => { this.res = SD.res; this.fps = SD.fps; });
    this.seg('HD', isHd, hdOk, sw, () => { this.res = HD.res; this.fps = HD.fps; });
    const gear = this.el(ui.VIEW, `h-[40] px-3 rounded-lg items-center justify-center ${this.more ? `bg-${t.muted}` : `bg-${t.background} hover:bg-${t.muted}`}`, line);
    this.text('Settings', `text-sm text-${t.foreground}`, gear);
    ui.setRole(gear, 'button');
    ui.setLabel(gear, 'Resolution and frame rate');
    ui.listen(gear, () => { this.more = !this.more; this.buildRest(); });
    if (this.more) {
      const q = this.el(ui.VIEW, 'flex-row items-center gap-2', b);
      this.text('Resolution', `w-[84] text-sm text-${t.mutedForeground}`, q);
      for (const r of RESOLUTIONS) this.chip(label(r), this.res === r, this.ok(r, this.fps), q, () => { this.res = r; });
      const q2 = this.el(ui.VIEW, 'flex-row items-center gap-2', b);
      this.text('Frame rate', `w-[84] text-sm text-${t.mutedForeground}`, q2);
      for (const f of RATES) this.chip(`${f} fps`, this.fps === f, this.ok(this.res, f), q2, () => { this.fps = f; });
      if (this.o.cursorOption ?? true) { this.el(ui.VIEW, 'grow', q2); this.chip('Show pointer', this.cursor, true, q2, () => { this.cursor = !this.cursor; }); }
    }
    if (!hdOk && this.o.lockedNote !== undefined) {
      const ban = this.el(ui.VIEW, `h-[44] px-4 rounded-lg flex-row items-center bg-${t.primary}`, b);
      this.text(`Stream in high resolution with ${this.o.lockedNote}`, `text-sm font-medium text-${t.primaryForeground}`, ban);
    }
    const foot = this.el(ui.VIEW, 'flex-row justify-end gap-2', b);
    const cancel = this.el(ui.VIEW, `h-[36] px-4 rounded-md items-center justify-center border border-${t.border} hover:bg-${t.subtle}`, foot);
    this.text('Cancel', `text-sm text-${t.foreground}`, cancel);
    ui.setRole(cancel, 'button');
    ui.listen(cancel, () => { this.close(null); });
    const go = this.el(ui.VIEW, `h-[36] px-4 rounded-md items-center justify-center bg-${t.primary} ${this.picked !== '' ? `hover:bg-${t.primaryFocus}` : 'opacity-50'}`, foot);
    this.text(this.o.shareLabel ?? 'Share', `text-sm font-medium text-${t.primaryForeground}`, go);
    ui.setRole(go, 'button');
    ui.listen(go, () => { this.share(); });
  }
  private seg(text: string, on: boolean, ok: boolean, parent: i32, pick: () => void): void {
    const t = theme();
    const c = this.el(ui.VIEW, `w-[64] h-[32] rounded-md items-center justify-center ${on ? `bg-${t.muted}` : ''} ${ok ? '' : 'opacity-50'}`, parent);
    this.text(text, `text-sm font-semibold ${on ? `text-${t.foreground}` : `text-${t.mutedForeground}`}`, c);
    ui.setRole(c, 'button');
    ui.setLabel(c, `${text}${on ? ', selected' : ''}${ok ? '' : ', not available'}`);
    if (ok) ui.listen(c, () => { pick(); this.buildRest(); });
  }
  private chip(text: string, on: boolean, ok: boolean, parent: i32, pick: () => void): void {
    const t = theme();
    const c = this.el(ui.VIEW, `h-[28] px-3 rounded-full items-center justify-center ${on ? `bg-${t.primary}` : `bg-${t.muted}`} ${ok ? '' : 'opacity-50'}`, parent);
    this.text(ok || this.o.lockedNote === undefined ? text : `${text} · ${this.o.lockedNote}`, `text-xs ${on ? `text-${t.primaryForeground}` : `text-${t.foreground}`}`, c);
    ui.setRole(c, 'button');
    ui.setLabel(c, `${text}${on ? ', selected' : ''}${ok ? '' : ', not available'}`);
    if (ok) ui.listen(c, () => { pick(); this.buildRest(); });
  }
}
let open: Picker | null = null;

/** Opens the share dialog (the system's screen recording question first, once; a background run never asks). Resolves with the choice, or
 *  null when cancelled; rejects with the reason when nothing can be listed. One dialog at a time: a second call cancels the first. */
export async function pickScreen(o: PickerOptions = {}): Promise<ShareChoice | null> {
  if (permissionStatus() !== 'granted' && await requestPermission() !== 'granted') throw new Error(DENIED);
  const sources = await getSources({ types: o.types, thumbnailSize: { width: THUMB_W, height: THUMB_H } });
  const devs = o.devices !== undefined ? await o.devices() : [];
  const old = open;
  if (old !== null) old.close(null);
  return new Promise<ShareChoice | null>((resolve: (c: ShareChoice | null) => void) => { open = new Picker(o, sources, devs, resolve); });
}
/** The dialog is open. */
export function pickerOpen(): boolean { return open !== null; }
/** Presses Share (with the source `id` selected first when given) or Cancel of the open dialog: keyboard shortcuts and scripted sessions. */
export function confirmPicker(id: string = ''): void {
  const p = open;
  if (p === null) return;
  if (id !== '') { p.picked = id; const s = p.sources.find((x: CaptureSource) => x.id === id); if (s !== undefined) p.tab = s.kind === 'screen' ? 'screens' : 'apps'; }
  p.share();
}
export function cancelPicker(): void { const p = open; if (p !== null) p.close(null); }
