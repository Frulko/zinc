// The deck's state and actions, without drawing: what trieur's `Deck` (third_party/trieur/core/src/deck.ts) does with the DOM, done with
// signals so that zinc:ui draws it (view.tsx). The geometry, the carving, the aim, the throw and the model are trieur's own modules,
// imported unchanged: an improvement made in trieur reaches the demos with `tools/sync-trieur`.
//
// Coordinates: the stage's, origin at its top-left corner; trieur's layouts work from the centre of the stage, and `zoneAt` takes
// stage coordinates (the stage is the "client" area: its rectangle starts at 0, 0).

import { createSignal, batch } from 'zinc:ui/solid';
import { resolveLayout, angleOf, voronoi, inPolygon, en, fr } from '@trieur/core';
import { locale } from 'zinc:sys';
import type { Advisor, DeckPlugin, DeckText, Layout, LayoutBox, PlacedZone, Point, Polygon, Prediction, SortRecord, Zone } from '@trieur/core';

const DEFAULT_KEYS = 'asdfghjklqwertyuiopzxcvbnm';

/** How the multi-zone stack was opened, which decides how it closes (trieur's MultiSource). */
export type MultiSource = 'shift' | 'latch' | 'hold';

export interface DeckConfig<T> {
  items?: T[];
  /** zones; `null` is a free zone (dropping calls `onAssign`) */
  zones?: Array<Zone | null>;
  /** what the model may look at; the item itself by default */
  meta?: (item: T) => unknown;
  advisor?: Advisor<T>;
  minConfidence?: number;
  layout?: Layout | 'auto' | 'circle' | 'radial' | 'voronoi' | 'grid' | 'dock';
  /** carve the stage into regions and aim at the region under the pointer (default true) */
  segments?: boolean;
  tapZones?: boolean;
  zonePadding?: number;
  zonePull?: number;
  keys?: string;
  /** drag distance past which the drop is armed, px (default 90) */
  threshold?: number;
  deadZone?: number;
  /** how close to a tile the pointer must come to aim at it, px (default 1.5 tiles) */
  reach?: number;
  multi?: boolean;
  /** ms a finger rests on the card before multi-zone mode opens (default 420; 0: never) */
  holdDelay?: number;
  /** the card's size, which the zones clear (default 260 x 300) */
  cardW?: number;
  cardH?: number;
  /** the size of a zone tile, px (default 104) */
  tile?: number;
  /** trieur's plugins: `flick()` makes a release with speed a throw */
  plugins?: Array<DeckPlugin<T>>;
  text?: Partial<DeckText>;
  onSort?: (item: T, zone: PlacedZone) => unknown;
  onSortMany?: (item: T, zones: PlacedZone[]) => unknown;
  onUndo?: (item: T, zone: PlacedZone) => unknown;
  onUndoMany?: (item: T, zones: PlacedZone[]) => unknown;
  onSkip?: (item: T) => unknown;
  onAssign?: (index: number, item: T) => unknown;
  onEmpty?: () => unknown;
}

/** One filing in flight: the view flies the card from where it was released into its tile. */
export interface Flight<T> {
  item: T;
  /** where the card is when it leaves, and its pose there (the drag shrinks and tilts it) */
  from: Point & { scale?: number; rotate?: number };
  to: Point;
  tilt: number;
  id: number;
}

type Listener = (detail: any) => void;

export class DeckState<T = any> {
  readonly opts: DeckConfig<T>;
  readonly text: DeckText;
  // what the view reads
  readonly items: () => T[];
  private readonly zonesS: () => PlacedZone[];
  private readonly predictionS: () => Prediction | null;
  readonly picks: () => PlacedZone[];
  readonly multi: () => MultiSource | null;
  /** the zone the gesture points at, and whether a release would file there */
  readonly near: () => PlacedZone | null;
  readonly armed: () => boolean;
  readonly flight: () => Flight<T> | null;
  /** how the top card came in: 'sort' (dealt), 'undo' (dropped back) or '' */
  readonly enter: () => string;
  /** bumped by each filing and each undo: the tiles that pulse */
  readonly caught: () => { ids: string[]; n: number };
  readonly centre: () => Point;
  readonly box: () => LayoutBox | null;
  readonly history: () => number;
  readonly busy: () => boolean;

  private setItems_: (v: T[]) => void;
  private setZones_: (v: PlacedZone[]) => void;
  private setPrediction_: (v: Prediction | null) => void;
  private setPicks_: (v: PlacedZone[]) => void;
  private setMulti_: (v: MultiSource | null) => void;
  private setNear_: (v: PlacedZone | null) => void;
  private setArmed_: (v: boolean) => void;
  private setFlight_: (v: Flight<T> | null) => void;
  private setEnter_: (v: string) => void;
  private setCaught_: (v: { ids: string[]; n: number }) => void;
  private setCentre_: (v: Point) => void;
  private setBox_: (v: LayoutBox | null) => void;
  private setHistory_: (v: number) => void;
  private setBusy_: (v: boolean) => void;

  private zoneDefs: Array<Zone | null>;
  private log: Array<{ item: T; zones: PlacedZone[] }> = [];
  private ask = 0;
  private flights = 0;
  private shiftUsed = false;
  private size = { w: 0, h: 0 };
  private layoutKey = '';
  private listeners = new Map<string, Listener[]>();
  /** what trieur's plugins see of the deck (DeckLike): the stage is the client area, its rectangle starts at 0, 0 */
  readonly root: any;

  constructor(opts: DeckConfig<T> = {}) {
    this.opts = { threshold: 90, holdDelay: 420, cardW: 260, cardH: 300, tile: 104, ...opts };
    this.text = { ...(locale().startsWith('fr') ? fr : en), ...opts.text };   // the computer's language: trieur speaks English and French
    this.zoneDefs = opts.zones ?? [];
    [this.items, this.setItems_] = createSignal<T[]>([...(opts.items ?? [])]);
    [this.zonesS, this.setZones_] = createSignal<PlacedZone[]>([]);
    [this.predictionS, this.setPrediction_] = createSignal<Prediction | null>(null);
    [this.picks, this.setPicks_] = createSignal<PlacedZone[]>([]);
    [this.multi, this.setMulti_] = createSignal<MultiSource | null>(null);
    [this.near, this.setNear_] = createSignal<PlacedZone | null>(null);
    [this.armed, this.setArmed_] = createSignal(false);
    [this.flight, this.setFlight_] = createSignal<Flight<T> | null>(null);
    [this.enter, this.setEnter_] = createSignal('');
    [this.caught, this.setCaught_] = createSignal<{ ids: string[]; n: number }>({ ids: [], n: 0 });
    [this.centre, this.setCentre_] = createSignal<Point>({ x: 0, y: 0 });
    [this.box, this.setBox_] = createSignal<LayoutBox | null>(null);
    [this.history, this.setHistory_] = createSignal(0);
    [this.busy, this.setBusy_] = createSignal(false);
    const self = this;
    const stage = { getBoundingClientRect: () => ({ left: 0, top: 0, x: 0, y: 0, width: self.size.w, height: self.size.h, right: self.size.w, bottom: self.size.h }) };
    this.root = {
      querySelector: () => stage,
      dispatchEvent(e: { type: string; detail?: unknown }) { self.emit(e.type.replace(/^trieur:/, ''), e.detail); return true; },
    };
    this.placeZones();
    for (const p of this.opts.plugins ?? []) p.setup?.(this);
    queueMicrotask(() => void this.suggest());
  }

  // --- what trieur's plugins call (DeckLike) ---------------------------------------------------------------------------------

  get current(): T | undefined { return this.items()[0]; }
  /** the placed zones (a signal read: a view that reads it follows it) */
  get zones(): PlacedZone[] { return this.zonesS(); }
  /** what the model suggests for the top card, or null */
  get prediction(): Prediction | null { return this.predictionS(); }
  get options(): DeckConfig<T> { return this.opts; }

  /** The zone whose region holds this stage point. */
  zoneAt(x: number, y: number): PlacedZone | null {
    return this.zones.find((z) => z.cell !== null && inPolygon(z.cell, x, y)) ?? null;
  }

  highlight(zone: PlacedZone | null, armed = false): void {
    if (zone !== this.near()) this.setNear_(zone);
    if (armed !== this.armed()) this.setArmed_(armed);
  }

  on(type: string, f: Listener): () => void {
    const list = this.listeners.get(type) ?? [];
    list.push(f);
    this.listeners.set(type, list);
    return () => { const at = list.indexOf(f); if (at >= 0) list.splice(at, 1); };
  }

  private emit(type: string, detail: unknown): void {
    for (const f of this.listeners.get(type) ?? []) f(detail);
  }

  // --- the pile and the zones ------------------------------------------------------------------------------------------------

  setItems(items: T[]): void {
    this.log = [];
    batch(() => { this.setItems_([...items]); this.setHistory_(0); this.setPicks_([]); this.setEnter_(''); });
    void this.suggest();
  }

  setZones(zones: Array<Zone | null>): void {
    this.zoneDefs = zones;
    this.placeZones();
    this.layoutKey = '';
    this.layout(this.size.w, this.size.h);
    void this.suggest();
  }

  /** Another arrangement of the same zones (trieur's setOptions({ layout })). */
  setLayout(layout: DeckConfig<T>['layout']): void {
    this.opts.layout = layout;
    this.layoutKey = '';
    this.layout(this.size.w, this.size.h);
  }

  /** Keys by position, as trieur hands them out: a zone keeps its key when what it holds changes. */
  private placeZones(): void {
    const keys = this.opts.keys ?? DEFAULT_KEYS;
    const taken = new Set(this.zoneDefs.map((z) => z?.key).filter((k): k is string => !!k));
    let next = 0;
    const out: PlacedZone[] = this.zoneDefs.map((z, index) => {
      let key = z?.key;
      if (!key) { while (next < keys.length && taken.has(keys[next]!)) next++; key = keys[next++] ?? ''; }
      return { ...(z ?? { id: '' }), index, empty: z === null, key, angle: 0, pos: { x: 0, y: 0 }, cell: null };
    });
    this.setZones_(out);
  }

  /** Places the zones around the card for a stage of `w` x `h` (trieur's layout(), with the stage measured by the view). */
  layout(w: number, h: number): void {
    this.size = { w, h };
    const zones = this.zones;
    if (w <= 0 || h <= 0 || zones.length === 0) return;
    const round = (v: number) => Math.round(v / 8) * 8;
    const tile = this.opts.tile!;
    const cardW = this.opts.cardW!, cardH = this.opts.cardH!;
    const box: LayoutBox = {
      w, h, cardW, cardH,
      clearX: round(cardW / 2 + tile * 0.5),
      clearY: round(cardH / 2 + tile * 0.5),
      tile,
      pad: this.opts.zonePadding ?? 12,
      pull: this.opts.zonePull ?? 0.18,
    };
    const key = `${w}x${h}:${cardW}x${cardH}:${tile}:${zones.length}:${String(this.opts.layout)}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const { points, cells, centre } = resolveLayout(this.opts.layout)(zones.length, box);
    // a layout that parks every tile along the bottom edge raises the card by half that tray (trieur's band)
    const ys = points.map((p) => p.y);
    const band = !centre && ys.length && ys.every((y) => y > 0) ? box.h / 2 - (Math.min(...ys) - box.tile / 2) : 0;
    const tray = Math.max(0, Math.min(band, box.h - box.cardH - 12));
    const c = centre ?? { x: 0, y: -tray / 2 };
    const carved: Polygon[] | null = this.opts.segments === false || points.length < 2 ? null
      : cells ? cells.map((cell) => cell.map(([x, y]) => [w / 2 + x, h / 2 + y] as [number, number]))
      : voronoi(points.map((p) => ({ x: w / 2 + p.x, y: h / 2 + p.y })), w, h);
    const placed = zones.map((z, i) => {
      const p = points[i] ?? { x: 0, y: 0 };
      return { ...z, pos: p, angle: angleOf(p.x - c.x, p.y - c.y), cell: carved ? carved[i] ?? null : null };
    });
    batch(() => { this.setBox_(box); this.setCentre_(c); this.setZones_(placed); });
  }

  // --- the gesture ------------------------------------------------------------------------------------------------------------

  /**
   * Where a release would land: the tile the pointer came close to (trieur aims by region, which lit a zone from anywhere in its
   * slice of the stage). `dx`, `dy`: the drag; `x`, `y`: the pointer, in stage coordinates.
   */
  aim(dx: number, dy: number, x: number, y: number): PlacedZone | null {
    const box = this.box();
    const o = this.origin();
    if (box) {
      const ox = x - this.size.w / 2 - o.x, oy = y - this.size.h / 2 - o.y, m = this.opts.deadZone ?? 0;
      if (Math.abs(ox) < box.cardW / 2 + m && Math.abs(oy) < box.cardH / 2 + m) return null;
    }
    // ponytail: the tile nearest the pointer, within reach of it; a throw that does not get there is the flick plugin's to aim
    const reach = this.opts.reach ?? this.opts.tile! * 1.5;
    let best: PlacedZone | null = null, bestD = reach;
    for (const z of this.zones) {
      if (z.disabled) continue;
      const d = Math.hypot(x - this.size.w / 2 - z.pos.x, y - this.size.h / 2 - z.pos.y);
      if (d < bestD) { best = z; bestD = d; }
    }
    return best;
  }

  /** The card's resting centre, from the centre of the stage. */
  origin(): Point { return this.centre(); }

  /** Asks trieur's plugins where the gesture points; `undefined` when none has an opinion. */
  private askPlugins(phase: 'move' | 'end', g: Gesture, fallback: PlacedZone | null): PlacedZone | null | undefined {
    const plugins = this.opts.plugins;
    if (!plugins || plugins.length === 0) return undefined;
    const ctx = {
      phase, from: this.origin(),
      at: { x: g.x - this.size.w / 2, y: g.y - this.size.h / 2 },
      v: { x: g.vx, y: g.vy }, dist: g.dist, cancelled: g.cancelled, fallback, item: this.current,
    };
    for (const p of plugins) {
      const said = p.aim?.(ctx, this);
      if (said !== undefined) return said;
    }
    return undefined;
  }

  /** A pointer moved with the card held: lights what a release would do, sweeps zones into the stack in multi mode. */
  dragMove(g: Gesture): void {
    const threshold = this.opts.threshold!;
    // the plugins speak at the release only: flick's guess of where a throw would land lit tiles the pointer was far from
    const near = g.dist > 30 ? this.aim(g.dx, g.dy, g.x, g.y) : null;
    const armed = g.dist > threshold;
    this.highlight(near, armed);
    if (this.multi() && near && armed) this.stack(near);
  }

  /** The card was let go: the zone it files into, or null when it goes back to the centre. */
  dragEnd(g: Gesture): PlacedZone | null {
    this.highlight(null, false);
    if (this.multi()) {
      if (this.multi() === 'hold') { if (this.picks().length) void this.commitMany(); else this.clearPicks(); }
      return null;
    }
    const own = !g.cancelled && g.dist > this.opts.threshold! ? this.aim(g.dx, g.dy, g.x, g.y) : null;
    const said = g.cancelled ? undefined : this.askPlugins('end', g, own);
    const zone = g.cancelled ? null : said === undefined ? own : said;
    this.emit('release', { item: this.current, zone, dist: g.dist, cancelled: g.cancelled });
    return zone;
  }

  /** A finger rested on the card: multi-zone mode, and the same finger sweeps. */
  hold(): void { if (this.opts.multi && !this.multi()) this.setMultiMode('hold'); }

  // --- multi-zone ---------------------------------------------------------------------------------------------------------

  setMultiMode(source: MultiSource | null): void {
    batch(() => { this.setMulti_(source); if (!source) this.setPicks_([]); });
    this.emit('pick', { item: this.current, zones: this.picks(), multi: source !== null });
  }

  private togglePick(zone: PlacedZone): void {
    const p = this.picks();
    this.setPicks_(p.some((z) => z.index === zone.index) ? p.filter((z) => z.index !== zone.index) : [...p, zone]);
    this.emit('pick', { item: this.current, zones: this.picks(), multi: true });
  }

  private stack(zone: PlacedZone): void {
    if (zone.empty || zone.disabled || this.picks().some((z) => z.index === zone.index)) return;
    this.setPicks_([...this.picks(), zone]);
  }

  private clearPicks(): void { batch(() => { this.setPicks_([]); this.setMulti_(null); }); }

  // --- keyboard (trieur's #onKey / #onKeyUp) -------------------------------------------------------------------------------

  /** A key went down; true when the deck used it. */
  key(key: string, shift: boolean, mods: boolean, repeat: boolean): boolean {
    if (key === 'Shift') { if (!repeat) this.shiftUsed = false; return false; }
    if (this.busy() || mods) return false;
    this.shiftUsed = true;
    if (key === ' ') { this.skip(); return true; }
    if (key === 'Backspace') { void this.undo(); return true; }
    if (key === 'Enter') {
      if (this.picks().length) { void this.commitMany(); return true; }
      const p = this.prediction;
      const z = p ? this.zones.find((x) => x.id === p.id) : undefined;
      if (z) { void this.commit(z); return true; }
      return false;
    }
    const z = this.zones.find((x) => x.key && x.key === key.toLowerCase());
    if (!z) return false;
    if (this.opts.multi && shift && !this.multi()) this.setMultiMode('shift');
    void this.commit(z);
    return true;
  }

  /** Shift went up: files a stack Shift opened, or a bare tap latches the mode (or files what it holds). */
  shiftUp(): void {
    if (this.busy()) return;
    if (this.multi() === 'shift') { if (this.picks().length) void this.commitMany(); else this.clearPicks(); return; }
    if (this.shiftUsed || !this.opts.multi) return;
    if (this.picks().length) { void this.commitMany(); return; }
    this.setMultiMode(this.multi() ? null : 'latch');
  }

  // --- actions -------------------------------------------------------------------------------------------------------------

  /** Files the top card into `zone` (stacks it in multi mode); resolves to whether the card left. `from`: where the card is now. */
  async commit(zone: PlacedZone, fling?: number, from?: Flight<T>['from']): Promise<boolean> {
    if (zone.disabled) return false;
    if (this.multi() && !zone.empty) { this.togglePick(zone); return false; }
    if (zone.empty) {
      const item = this.current;
      if (item === undefined) return false;
      this.emit('assign', { index: zone.index, item });
      this.opts.onAssign?.(zone.index, item);
      return false;
    }
    return this.run([zone], fling, from);
  }

  async commitMany(zones: PlacedZone[] = this.picks()): Promise<boolean> {
    if (!zones.length) return false;
    return this.run(zones);
  }

  private async run(zones: PlacedZone[], fling?: number, from?: Flight<T>['from']): Promise<boolean> {
    const item = this.current;
    const primary = zones[0];
    if (item === undefined || !primary || this.busy()) return false;
    this.setBusy_(true);
    const predicted = this.prediction?.id ?? null;
    const start = from ?? this.origin();
    const to = { x: primary.pos.x, y: primary.pos.y };
    this.setFlight_({ item, from: start, to, tilt: fling !== undefined ? fling / 8 : (to.x - start.x) / 60, id: ++this.flights });
    let done = false;
    try {
      await this.dispatch('sort', item, zones);
      done = true;
      this.log.push({ item, zones });
      for (const z of zones) void this.tell('record', { item, meta: this.meta(item), zoneId: z.id, predicted, at: Date.now() });
      batch(() => {
        this.setItems_(this.items().filter((x) => x !== item));
        this.setHistory_(this.log.length);
        this.setEnter_('sort');
        this.setCaught_({ ids: zones.map((z) => z.id), n: this.caught().n + 1 });
      });
      this.emit('sort', { item, zone: primary, zones, predicted, correct: zones.some((z) => z.id === predicted) });
    } catch (error) {
      this.setFlight_(null);
      this.emit('error', { item, zone: primary, error });
    } finally {
      batch(() => { this.setBusy_(false); this.setPicks_([]); this.setMulti_(null); });
      if (done) { void this.suggest(); if (this.items().length === 0) { this.emit('empty', {}); this.opts.onEmpty?.(); } }
    }
    return done;
  }

  /** The view finished flying the card into its tile. */
  landed(id: number): void { if (this.flight()?.id === id) this.setFlight_(null); }

  skip(): void {
    const item = this.current;
    if (item === undefined || this.busy()) return;
    batch(() => {
      this.setPicks_([]); this.setMulti_(null);
      this.setItems_([...this.items().slice(1), item]);
      this.setEnter_('sort');
    });
    this.emit('skip', { item });
    this.opts.onSkip?.(item);
    void this.suggest();
  }

  async undo(): Promise<void> {
    const last = this.log.pop();
    if (!last || this.busy()) { if (last) this.log.push(last); return; }
    this.setBusy_(true);
    let done = false;
    try {
      await this.dispatch('undo', last.item, last.zones);
      done = true;
      for (const z of last.zones) void this.tell('forget', { item: last.item, meta: this.meta(last.item), zoneId: z.id, at: Date.now() });
      batch(() => {
        this.setItems_([last.item, ...this.items()]);
        this.setHistory_(this.log.length);
        this.setEnter_('undo');
        this.setCaught_({ ids: last.zones.map((z) => z.id), n: this.caught().n + 1 });
      });
      this.emit('undo', { item: last.item, zone: last.zones[0], zones: last.zones });
    } catch (error) {
      this.log.push(last);
      this.emit('error', { item: last.item, zone: last.zones[0], error });
    } finally {
      this.setBusy_(false);
      if (done) void this.suggest();
    }
  }

  /** Asks the advisor for the top card; a late answer for another card is dropped. */
  async suggest(): Promise<void> {
    const ask = ++this.ask;
    this.setPrediction_(null);
    const advisor = this.opts.advisor;
    const item = this.current;
    if (!advisor || item === undefined) return;
    const ids = this.zones.filter((z) => !z.empty && !z.disabled).map((z) => z.id);
    if (!ids.length) return;
    let top: Prediction | null = null;
    try {
      top = (await advisor.best(this.meta(item), ids, this.opts.minConfidence)) ?? null;
    } catch (error) {
      this.emit('error', { item, error });
      return;
    }
    if (ask !== this.ask || !top) return;
    this.setPrediction_(top);
    this.emit('suggest', { item, ...top });
  }

  meta(item: T): unknown { return this.opts.meta ? this.opts.meta(item) : item; }

  private async dispatch(hook: 'sort' | 'undo', item: T, zones: PlacedZone[]): Promise<void> {
    const o = this.opts;
    if (zones.length > 1 && (hook === 'sort' ? o.onSortMany : o.onUndoMany)) await (hook === 'sort' ? o.onSortMany! : o.onUndoMany!)(item, zones);
    else for (const z of zones) await (hook === 'sort' ? o.onSort : o.onUndo)?.(item, z);
  }

  private async tell(hook: 'record' | 'forget', r: SortRecord<T>): Promise<void> {
    try { await this.opts.advisor?.[hook]?.(r); } catch (error) { this.emit('error', { item: r.item, error }); }
  }
}

/** A gesture, in stage coordinates: the drag since the press, the pointer, the velocity in px/ms. */
export interface Gesture {
  dx: number;
  dy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  dist: number;
  cancelled: boolean;
}

export function createDeck<T>(opts: DeckConfig<T>): DeckState<T> { return new DeckState<T>(opts); }
