// The table of one sequence: the media library of the project at the left, the table in the middle with what lies on it (media, buttons,
// hotspots), and under it when each appears and leaves. Drag a medium from the library onto the table; drag it there to move it, its corner
// to size it; drag a button or a hotspot where visitors will touch it; drag the ends of a bar to time it.
// The table is drawn at the scale that fits; positions are the project's table units. An item is drawn turned as the table will show it
// (zinc:gfx setTransform; its box answers to the pointer in its turned shape), and the round handle above the selected one turns it.
import { createSignal, createNodeRef, createEffect, For, Show, batch } from 'zinc:ui/solid';
import * as ui from 'zinc:ui';
import { rrect, border, drawText, lineHeight, setTransform, resetTransform } from 'zinc:gfx';
import { Sequence, Media, Item, Link } from '../src/project';
import { sans, wrap, leading } from '../src/type';
import { project, lang, opened, selectedItem, selectedLink, shownMedia, pick, placeMedia, moveItem, resizeItem, rotateItem, timeItem, moveLink, timeLink, usesOf, addFileCommand, setAdding,
  openPoints, setStatus, lengthOf } from './state';
import { Ico, Action, Heading, drawMedia, shapeOf, kindIndex, KIND_ICON, KIND_COLOUR, ACCENT, MUTED } from './widgets';
import { PreviewTools } from './preview';
import * as L from './strings';
import { t, f } from './strings';

// ---------------------------------------------------------------- the table on screen

const rootRef = createNodeRef(), stageRef = createNodeRef();
/** The room the table has, in pixels (known once drawn). */
const [areaW, setAreaW] = createSignal<number>(700);
const [areaH, setAreaH] = createSignal<number>(400);
function tableW(): number { return project().table.width; }
function tableH(): number { return project().table.height; }
/** Pixels per table unit: the table fits its room with a margin. */
function k(): number { return Math.max(0.05, Math.min((areaW() - 48) / tableW(), (areaH() - 48) / tableH())); }
/** The point of the table under the pointer, in table units. */
function tableAt(e: ui.PointerEvent): number[] {
  const p = ui.toLocal(stageRef.node, e.gx, e.gy);
  return [p[0] / k(), p[1] / k()];
}
function mediaOf(it: Item): Media | null { return project().medium(it.media); }
function titleOf(m: Media | null): string { return m === null ? '' : project().say(m.title, lang()); }
/** The words of a text medium, in the language shown. */
function wordsOf(it: Item): string { const m = mediaOf(it); return m === null ? '' : project().say(m.text, lang()); }

// what is being dragged on the table and how far, in table units: the document changes once, at the drop
const [held, setHeld] = createSignal<Item | null>(null);
const [heldLink, setHeldLink] = createSignal<Link | null>(null);
const [sizing, setSizing] = createSignal<boolean>(false);
const [dx, setDX] = createSignal<number>(0);
const [dy, setDY] = createSignal<number>(0);
const [newW, setNewW] = createSignal<number>(0);
/** The item being turned by its handle and the angle it has under the pointer, in degrees; the item under the pointer. */
const [turning, setTurning] = createSignal<Item | null>(null);
const [newTurn, setNewTurn] = createSignal<number>(0);
const [hoveredItem, setHoveredItem] = createSignal<Item | null>(null);
/** The turn of an item, in degrees clockwise, and as the cosine and sine that turn its own axes onto the table's. */
function turnOf(it: Item): number { project(); return turning() === it ? newTurn() : it.rotation; }
function cosOf(it: Item): number { return Math.cos(turnOf(it) * Math.PI / 180); }
function sinOf(it: Item): number { return Math.sin(turnOf(it) * Math.PI / 180); }

function wOf(it: Item): number { project(); return held() === it && sizing() ? newW() : it.width; }
function hOf(it: Item): number {
  const w = wOf(it);
  return it.height > 0 ? it.height * w / it.width : w * shapeOf(mediaOf(it));
}
function xOf(it: Item): number { project(); return it.x + (held() === it && !sizing() ? dx() : 0); }
function yOf(it: Item): number { project(); return it.y + (held() === it && !sizing() ? dy() : 0); }
/** The item a hotspot sits on: the first one of the open table that shows its medium. */
function hostOf(l: Link): Item | null {
  const s = opened();
  project();
  if (s === null || l.on.length === 0) return null;
  for (const it of s.items) if (it.media === l.on) return it;
  return null;
}
/** Where a button or a hotspot is on the table, in table units. A hotspot is at its fractions of its item, and turns with it. */
function linkX(l: Link): number {
  const host = hostOf(l);
  project();
  return (host !== null ? xOf(host) + (l.x - 0.5) * wOf(host) * cosOf(host) - (l.y - 0.5) * hOf(host) * sinOf(host) : l.x) + (heldLink() === l ? dx() : 0);
}
function linkY(l: Link): number {
  const host = hostOf(l);
  project();
  return (host !== null ? yOf(host) + (l.x - 0.5) * wOf(host) * sinOf(host) + (l.y - 0.5) * hOf(host) * cosOf(host) : l.y) + (heldLink() === l ? dy() : 0);
}

// the thing under the button, where it was pressed, and whether the pointer has moved far enough to be a drag
let grabbed: Item | null = null, grabbedLink: Link | null = null, gx0: number = 0, gy0: number = 0, dragging = false;
function far(e: ui.PointerEvent): boolean {
  const p = tableAt(e);
  if (!dragging && Math.abs(p[0] - gx0) + Math.abs(p[1] - gy0) < 4 / k()) return false;
  dragging = true;
  batch(() => { setDX(p[0] - gx0); setDY(p[1] - gy0); });
  return true;
}
function itemDown(it: Item, e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  pick(it, null, null);
  const p = tableAt(e);
  grabbed = it; gx0 = p[0]; gy0 = p[1]; dragging = false;
}
function itemMove(it: Item, e: ui.PointerEvent): void {
  if (grabbed === it && far(e)) batch(() => { setSizing(false); setHeld(it); });
}
function itemUp(it: Item, e: ui.PointerEvent): void {
  grabbed = null;
  if (!dragging) return;
  dragging = false;
  const x = it.x + dx(), y = it.y + dy();
  batch(() => { setHeld(null); setDX(0); setDY(0); moveItem(it, x, y); });
}
function gripMove(it: Item, e: ui.PointerEvent): void {
  if (grabbed !== it) return;
  dragging = true;
  // the corner follows the pointer and the centre stays: the width is twice the distance from the centre, along the item's own width
  const p = tableAt(e), along = (p[0] - it.x) * cosOf(it) + (p[1] - it.y) * sinOf(it);
  batch(() => { setNewW(Math.max(40, Math.round(2 * along))); setSizing(true); setHeld(it); });
}
function gripUp(it: Item, e: ui.PointerEvent): void {
  grabbed = null;
  if (!dragging) return;
  dragging = false;
  const w = newW(), h = it.height > 0 ? it.height * w / it.width : 0;
  batch(() => { setHeld(null); setSizing(false); resizeItem(it, w, h); });
}
function linkDown(l: Link, e: ui.PointerEvent): void {
  if (e.button !== 0) return;
  pick(null, l, null);
  const p = tableAt(e);
  grabbedLink = l; gx0 = p[0]; gy0 = p[1]; dragging = false;
}
function linkMove(l: Link, e: ui.PointerEvent): void {
  if (grabbedLink === l && far(e)) setHeldLink(l);
}
function linkUp(l: Link, e: ui.PointerEvent): void {
  grabbedLink = null;
  if (!dragging) return;
  dragging = false;
  const host = hostOf(l), x = linkX(l), y = linkY(l);
  batch(() => {
    setHeldLink(null); setDX(0); setDY(0);
    if (host !== null) {   // back into the item's own axes
      const px = x - host.x, py = y - host.y, c = cosOf(host), s = sinOf(host);
      moveLink(l, (px * c + py * s) / host.width + 0.5, (py * c - px * s) / hOf(host) + 0.5);
    } else moveLink(l, x, y);
  });
}
// the handle that turns the selected item: the angle is the one of the pointer seen from the item's centre, 0 straight above it
function turnMove(it: Item, e: ui.PointerEvent): void {
  if (grabbed !== it) return;
  dragging = true;
  const p = tableAt(e);
  let a = Math.round(Math.atan2(p[0] - it.x, it.y - p[1]) * 180 / Math.PI);
  if (e.shift) a = Math.round(a / 15) * 15;   // Shift: steps of 15 degrees
  if (Math.abs(a) <= 2) a = 0;                // upright is easy to find again
  batch(() => { setNewTurn(a); setTurning(it); setStatus(f(L.TURN_HANDLE, `${a}`)); });
}
function turnUp(it: Item, e: ui.PointerEvent): void {
  grabbed = null;
  if (!dragging) return;
  dragging = false;
  const a = newTurn();
  batch(() => { setTurning(null); rotateItem(it, a); });
}

/** Draws an item in its box (x, y, w, h) of the window, turned about its centre: the picture or the words, the caption strip, the frame. */
function drawItem(it: Item, x: i32, y: i32, w: i32, h: i32): void {
  const m = mediaOf(it), kind = kindIndex(m), turned = turnOf(it) !== 0;
  let left: number = x, top: number = y;
  if (turned) { setTransform(cosOf(it), sinOf(it), -sinOf(it), cosOf(it), x + w / 2, y + h / 2); left = -w / 2; top = -h / 2; }
  if (kind === 3) {
    const body = sans(11), room: i32 = Math.max(1, Math.floor((h - 26) / leading(body)));
    rrect(left, top, w, h, 4, KIND_COLOUR[3], 46);
    const lines = wrap(body, wordsOf(it), w - 16, room);
    for (let i = 0; i < lines.length; i++) drawText(body, left + 8, top + 7 + i * leading(body), lines[i], 0xf4f4f5, 255, 0);
  } else drawMedia(m, left, top, w, h);
  const small = sans(9);
  rrect(left, top + h - 14, w, 14, 0, 0x000000, 153);
  drawText(small, left + 4, top + h - 14 + (14 - lineHeight(small)) / 2, wrap(small, titleOf(m), w - 8, 1)[0], 0xe4e4e7, 255, 0);
  border(left, top, w, h, 4, 2, selectedItem() === it ? 0xfbbf24 : hoveredItem() === it ? 0xa1a1aa : 0x3f3f46, 255);
  if (turned) resetTransform();
}

/** An item on the table. Its box has the item's turn, so the pointer meets it where it is drawn; the canvas inside paints it turned. A
 *  double click on a 3D model or a panorama opens it to place its points of interest. */
function OnTable(it: Item): i32 {
  return <view class="absolute cursor-move"
    style={{ left: (xOf(it) - wOf(it) / 2) * k(), top: (yOf(it) - hOf(it) / 2) * k(), width: wOf(it) * k(), height: hOf(it) * k(), transform: [{ rotate: turnOf(it) }] }}
    onPointerDown={(e: ui.PointerEvent) => itemDown(it, e)} onPointerMove={(e: ui.PointerEvent) => itemMove(it, e)} onPointerUp={(e: ui.PointerEvent) => itemUp(it, e)}
    onPointerEnter={(e: ui.PointerEvent) => setHoveredItem(it)} onPointerLeave={(e: ui.PointerEvent) => { if (hoveredItem() === it) setHoveredItem(null); }}
    onDoubleClick={(e: ui.PointerEvent) => { const m = mediaOf(it); grabbed = null; if (m !== null) openPoints(m); }}>
    <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawItem(it, x, y, w, h)} />
  </view>;
}
/** The corner of the selected item: drag it to size the item. */
function Grip(): i32 {
  const it = (): Item | null => selectedItem();
  const left = (): number => { const i = it(); return i === null ? 0 : (xOf(i) + wOf(i) / 2 * cosOf(i) - hOf(i) / 2 * sinOf(i)) * k() - 7; };
  const top = (): number => { const i = it(); return i === null ? 0 : (yOf(i) + wOf(i) / 2 * sinOf(i) + hOf(i) / 2 * cosOf(i)) * k() - 7; };
  return <view class="absolute w-[14] h-[14] rounded-sm bg-amber-400 border border-zinc-900 cursor-ew-resize" style={{ left: left(), top: top() }}
    onPointerDown={(e: ui.PointerEvent) => { const i = it(); if (i !== null && e.button === 0) { grabbed = i; dragging = false; } }}
    onPointerMove={(e: ui.PointerEvent) => { const i = it(); if (i !== null) gripMove(i, e); }}
    onPointerUp={(e: ui.PointerEvent) => { const i = it(); if (i !== null) gripUp(i, e); }} />;
}
/** The round handle above the selected item: drag it around the item to turn it. */
function Turner(): i32 {
  const it = (): Item | null => selectedItem();
  const away = (i: Item): number => hOf(i) / 2 * k() + 20;   // pixels from the item's centre, along its own upward axis
  const left = (): number => { const i = it(); return i === null ? 0 : xOf(i) * k() + sinOf(i) * away(i) - 8; };
  const top = (): number => { const i = it(); return i === null ? 0 : yOf(i) * k() - cosOf(i) * away(i) - 8; };
  return <view class="absolute w-[16] h-[16] rounded-full bg-zinc-900 border-2 border-amber-400 cursor-grab" style={{ left: left(), top: top() }}
    onPointerDown={(e: ui.PointerEvent) => { const i = it(); if (i !== null && e.button === 0) { grabbed = i; dragging = false; } }}
    onPointerMove={(e: ui.PointerEvent) => { const i = it(); if (i !== null) turnMove(i, e); }}
    onPointerUp={(e: ui.PointerEvent) => { const i = it(); if (i !== null) turnUp(i, e); }} />;
}
/** A button (a pill with its label) or a hotspot (a ring on its medium), where visitors will touch it. */
function LinkOnTable(l: Link): i32 {
  const chosen = (): boolean => selectedLink() === l;
  const spot = (): boolean => { project(); return l.on.length > 0; };
  return <view class="absolute items-center justify-center" style={{ left: linkX(l) * k() - 110, top: linkY(l) * k() - 13, width: 220, height: 26 }}>
    <view class={`flex-row items-center justify-center gap-1 rounded-full border-2 cursor-move ${spot() ? 'w-[26] h-[26]' : 'h-[26] px-3'} ${chosen() ? 'bg-amber-400 border-amber-200' : spot() ? 'bg-zinc-900 border-amber-400' : 'bg-zinc-100 border-zinc-400'}`}
      onPointerDown={(e: ui.PointerEvent) => linkDown(l, e)} onPointerMove={(e: ui.PointerEvent) => linkMove(l, e)} onPointerUp={(e: ui.PointerEvent) => linkUp(l, e)}
      onDoubleClick={(e: ui.PointerEvent) => {}}>
      <Show when={spot()}><Ico name="mouse-pointer-click" size={13} color={ACCENT} /></Show>
      <Show when={!spot()}><text class="truncate text-[11px] font-bold text-zinc-900" style={{ maxWidth: 180 }}>{project().say(l.label, lang())}</text></Show>
    </view>
  </view>;
}
/** While a button is dragged: the middle of the table, which no seated visitor reaches, where a button cannot stay. */
function drawReach(x: i32, y: i32, w: i32, h: i32): void {
  const l = heldLink(), r = project().table.reach, s = k();
  if (l === null || l.on.length > 0 || tableW() <= 2 * r || tableH() <= 2 * r) return;
  rrect(x + r * s, y + r * s, (tableW() - 2 * r) * s, Math.max(2, (tableH() - 2 * r) * s), 2, 0xef4444, 70);
  border(x + r * s, y + r * s, (tableW() - 2 * r) * s, Math.max(2, (tableH() - 2 * r) * s), 2, 1, 0xef4444, 200);
}
function Stage(): i32 {
  const items = (): Item[] => { const s = opened(); project(); return s === null ? [] : s.items; };
  const links = (): Link[] => { const s = opened(); project(); return s === null ? [] : s.links.filter((l: Link) => l.on.length === 0 || hostOf(l) !== null); };
  return <view class="grow relative overflow-hidden bg-zinc-950" onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) pick(null, null, null); }}>
    <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => { if (w !== areaW() || h !== areaH()) batch(() => { setAreaW(w); setAreaH(h); }); }} />
    <view ref={stageRef} class="absolute rounded border border-zinc-700" style={{ left: (areaW() - tableW() * k()) / 2, top: (areaH() - tableH() * k()) / 2, width: tableW() * k(), height: tableH() * k(), bg: project().theme.background }}>
      <canvas class="absolute inset-0" style={{ lazy: 1 }} onDraw={drawReach} />
      <For each={items()}>{(it: Item, i: i32) => OnTable(it)}</For>
      <For each={links()}>{(l: Link, i: i32) => LinkOnTable(l)}</For>
      <Show when={selectedItem() !== null}><Grip /></Show>
      <Show when={selectedItem() !== null}><Turner /></Show>
      <Show when={items().length === 0}>
        <view class="absolute inset-0 items-center justify-center"><text class="text-sm text-center text-zinc-500" style={{ width: 340 }}>{t(L.STAGE_EMPTY)}</text></view>
      </Show>
    </view>
    <PreviewTools />
  </view>;
}

// ---------------------------------------------------------------- the library

/** The medium being carried from the library to the table, and where the pointer is on the window. */
const [carried, setCarried] = createSignal<Media | null>(null);
const [carryX, setCarryX] = createSignal<number>(0);
const [carryY, setCarryY] = createSignal<number>(0);
let lifted: Media | null = null, liftX: number = 0, liftY: number = 0;

/** On the table where there is room: the middle, then a little further for each item already there. */
function placeInMiddle(m: Media): void {
  const s = opened(), n = s === null ? 0 : s.items.length;
  placeMedia(m, tableW() / 2 + (n % 5) * 60, tableH() / 2 + (n % 5) * 60);
}
function rowUp(m: Media, e: ui.PointerEvent): void {
  lifted = null;
  if (carried() === null) return;
  setCarried(null);
  const box = ui.screenBox(stageRef.node);
  if (e.gx >= box[0] && e.gx <= box[0] + box[2] && e.gy >= box[1] && e.gy <= box[1] + box[3]) placeMedia(m, (e.gx - box[0]) / k(), (e.gy - box[1]) / k());
}
function LibraryRow(m: Media): i32 {
  const kind = kindIndex(m);
  const used = (): string => { const n = usesOf(m); return n === 0 ? t(L.UNUSED) : n === 1 ? t(L.USED_ONCE) : f(L.USED_N, `${n}`); };
  return <view class={`flex-row items-center gap-2 h-11 px-2 rounded-md border cursor-grab ${shownMedia() === m ? 'bg-zinc-800 border-amber-400' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
    onPointerDown={(e: ui.PointerEvent) => { if (e.button === 0) { pick(null, null, m); lifted = m; liftX = e.gx; liftY = e.gy; } }}
    onPointerMove={(e: ui.PointerEvent) => {
      if (lifted !== m || (carried() === null && Math.abs(e.gx - liftX) + Math.abs(e.gy - liftY) < 6)) return;
      batch(() => { setCarried(m); setCarryX(e.gx); setCarryY(e.gy); });
    }}
    onPointerUp={(e: ui.PointerEvent) => rowUp(m, e)} onDoubleClick={(e: ui.PointerEvent) => { lifted = null; placeInMiddle(m); }}>
    <canvas class="shrink-0" style={{ width: 30, height: 30, lazy: 1 }} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawMedia(m, x, y, w, h)} />
    <view class="flex-col" style={{ width: 172 }}>
      <text class="truncate text-xs font-bold text-zinc-100">{titleOf(m)}</text>
      <text class="truncate text-[10px] text-zinc-500">{`${t(L.KIND_NAMES[kind >= 0 ? kind : 0])} · ${used()}`}</text>
    </view>
  </view>;
}
function Library(): i32 {
  return <view class="w-[250] shrink-0 flex-col gap-2 p-3 bg-zinc-900 border-r border-zinc-800">
    <Heading label={t(L.LIBRARY)} />
    <view class="flex-row"><Action icon="plus" label={t(L.ADD_FILE)} look="plain" onClick={addFileCommand} /></view>
    <view class="flex-row"><Action icon="type" label={t(L.ADD_TEXT)} look="plain" onClick={() => setAdding('text')} /></view>
    <Show when={project().media.length === 0}><text class="text-xs text-zinc-500" style={{ width: 222 }}>{t(L.LIBRARY_EMPTY)}</text></Show>
    <Show when={project().media.length > 0}><text class="text-[11px] text-zinc-500" style={{ width: 222 }}>{t(L.LIBRARY_HINT)}</text></Show>
    <scroll class="grow flex-col gap-1">
      <For each={project().media}>{(m: Media, i: i32) => LibraryRow(m)}</For>
    </scroll>
  </view>;
}
/** The medium under the pointer while it is carried to the table. */
function Carried(): i32 {
  const at = (): number[] => ui.toLocal(rootRef.node, carryX(), carryY());
  return <view class="absolute flex-row items-center gap-2 h-8 px-2 rounded-md bg-zinc-800 border border-amber-400 shadow-lg" style={{ left: at()[0] + 10, top: at()[1] + 6 }}>
    <Ico name="plus" size={13} color={ACCENT} />
    <text class="truncate text-xs font-bold text-zinc-100" style={{ maxWidth: 200 }}>{titleOf(carried())}</text>
  </view>;
}

// ---------------------------------------------------------------- when each appears

const NAME_W = 190;
function trackW(): number { return Math.max(120, areaW() - NAME_W - 112); }
/** The sound said when the open sequence comes on the table. */
function narrationOf(): Media | null { const s = opened(); project(); return s === null || s.narration.length === 0 ? null : project().medium(s.narration); }
/** Seconds the film of an item lasts; 0 for what is not a film, and for a film that starts again at its end. */
function filmOf(it: Item): number { const m = mediaOf(it); project(); return m !== null && m.kind === 'video' && !m.loop ? lengthOf(m) : 0; }
/** The seconds the bars are drawn over: the duration of the sequence, at least 30, and always past the last time set, the narration and the films. */
function span(): number {
  const s = opened();
  project();
  let d = 30;
  if (s !== null) {
    d = Math.max(d, s.duration);
    for (const it of s.items) d = Math.max(d, Math.max(it.at + filmOf(it), it.until) + 5);
    const said = narrationOf();
    if (said !== null) d = Math.max(d, lengthOf(said) + 5);
    for (const l of s.links) d = Math.max(d, Math.max(l.at, l.until) + 5);
  }
  return Math.ceil(d / 10) * 10;
}
/** A row: what it is, and the bar of when it is there. Drag the bar to shift it, its ends to change one time; an end at the right edge
 *  means "to the end". `length` (seconds, 0 for none): how long what plays there lasts, a film: with no end set its bar is that long.
 *  `fixed`: the bar is what a file lasts, a narration, and is not dragged. */
function Row(p: { icon: string; colour: i32; label: () => string; chosen: () => boolean; at: () => number; until: () => number; length: () => number; fixed: boolean; onPick: () => void; onTimes: (at: number, until: number) => void }): i32 {
  const [live, setLive] = createSignal<boolean>(false);
  const [a, setA] = createSignal<number>(0);
  const [u, setU] = createSignal<number>(0);
  const from = (): number => live() ? a() : p.at();
  const open = (): number => p.length() > 0 ? from() + p.length() : span();
  const to = (): number => { const v = live() ? u() : p.until(); return v > 0 ? v : open(); };
  let zone = '', x0: number = 0, a0: number = 0, u0: number = 0;
  const half = (v: number): number => Math.round(v * 2) / 2;
  return <view class="flex-row items-center gap-2 h-7">
    <button class={`flex-row items-center justify-start gap-2 h-6 px-2 rounded cursor-pointer ${p.chosen() ? 'bg-zinc-700' : 'bg-zinc-900 hover:bg-zinc-800'}`} style={{ width: NAME_W }} onClick={p.onPick}>
      <Ico name={p.icon} size={12} color={p.colour} />
      <text class="truncate text-[11px] text-zinc-200" style={{ width: NAME_W - 40 }}>{p.label()}</text>
    </button>
    <view class="relative h-5 rounded bg-zinc-950 border border-zinc-800" style={{ width: trackW() }}>
      <view class={`absolute top-[2] bottom-[2] rounded-sm cursor-ew-resize ${p.chosen() ? 'bg-amber-400' : 'bg-zinc-500 hover:bg-zinc-400'}`}
        style={{ left: from() / span() * trackW(), width: Math.max(6, (to() - from()) / span() * trackW()) }}
        onPointerDown={(e: ui.PointerEvent) => {
          if (e.button !== 0) return;
          p.onPick();
          if (p.fixed) return;
          const w = (to() - from()) / span() * trackW();
          zone = e.x < 8 ? 'start' : e.x > w - 8 ? 'end' : 'shift';
          x0 = e.gx; a0 = p.at(); u0 = p.until();
        }}
        onPointerMove={(e: ui.PointerEvent) => {
          if (zone.length === 0) return;
          const d = (e.gx - x0) * span() / trackW(), end = u0 > 0 ? u0 : p.length() > 0 ? a0 + p.length() : span();
          let na = a0, nu = u0;
          if (zone === 'start') na = Math.max(0, Math.min(end - 0.5, half(a0 + d)));
          else if (zone === 'end') { nu = Math.max(a0 + 0.5, half(end + d)); if (nu >= span() - 0.25) nu = 0; }
          else { na = Math.max(0, half(a0 + d)); nu = u0 > 0 ? u0 + (na - a0) : 0; }
          batch(() => { setA(na); setU(nu); setLive(true); });
        }}
        onPointerUp={(e: ui.PointerEvent) => {
          zone = '';
          if (!live()) return;
          const na = a(), nu = u();
          batch(() => { setLive(false); p.onTimes(na, nu); });
        }} />
    </view>
    <text class="w-[70] text-[10px] text-zinc-500">{`${from()} – ${live() ? (u() > 0 ? `${u()}` : '∞') : p.until() > 0 ? `${p.until()}` : '∞'}${p.length() > 0 ? ` · ${f(L.SECONDS, `${p.length()}`)}` : ''}`}</text>
  </view>;
}
function Timeline(): i32 {
  const items = (): Item[] => { const s = opened(); project(); return s === null ? [] : s.items; };
  const links = (): Link[] => { const s = opened(); project(); return s === null ? [] : s.links; };
  const ticks = (): number[] => { const out: number[] = []; for (let v = 0; v <= span(); v += 10) out.push(v); return out; };
  const target = (l: Link): string => { const s = project().sequence(l.to); return s === null ? '' : project().say(s.title, lang()); };
  return <view class="h-[214] shrink-0 flex-col gap-1 px-3 py-2 bg-zinc-900 border-t border-zinc-800">
    <view class="flex-row items-center gap-3">
      <Heading label={t(L.TIMELINE)} />
      <text class="truncate text-[11px] text-zinc-500" style={{ width: Math.max(100, areaW() - 200) }}>{t(L.TIMELINE_HINT)}</text>
    </view>
    <view class="relative h-4" style={{ marginLeft: NAME_W + 8, width: trackW() }}>
      <For each={ticks()}>{(v: number, i: i32) => <text class="absolute top-0 text-[10px] text-zinc-500" style={{ left: v / span() * trackW() }}>{f(L.SECONDS, `${v}`)}</text>}</For>
    </view>
    <scroll class="grow flex-col">
      <Show when={narrationOf() !== null}>
        <Row icon="volume-2" colour={KIND_COLOUR[4]} label={() => `${t(L.NARRATION)}: ${titleOf(narrationOf())}`} chosen={() => selectedItem() === null && shownMedia() !== null && shownMedia() === narrationOf()}
          at={() => 0} until={() => { const m = narrationOf(); return m === null ? 0 : lengthOf(m); }} length={() => 0} fixed={true} onPick={() => pick(null, null, narrationOf())} onTimes={(at: number, until: number) => {}} />
      </Show>
      <For each={items()}>{(it: Item, i: i32) => {
        const kind = kindIndex(mediaOf(it));
        return <Row icon={kind >= 0 ? KIND_ICON[kind] : 'image'} colour={kind >= 0 ? KIND_COLOUR[kind] : MUTED} label={() => titleOf(mediaOf(it))} chosen={() => selectedItem() === it}
          at={() => { project(); return it.at; }} until={() => { project(); return it.until; }} length={() => filmOf(it)} fixed={false} onPick={() => pick(it, null, null)} onTimes={(at: number, until: number) => timeItem(it, at, until)} />;
      }}</For>
      <For each={links()}>{(l: Link, i: i32) => <Row icon="arrow-right" colour={ACCENT} label={() => `${project().say(l.label, lang())} → ${target(l)}`} chosen={() => selectedLink() === l}
        at={() => { project(); return l.at; }} until={() => { project(); return l.until; }} length={() => 0} fixed={false} onPick={() => pick(null, l, null)} onTimes={(at: number, until: number) => timeLink(l, at, until)} />}</For>
    </scroll>
  </view>;
}

/** The editor of one sequence: library, table, times. */
export function SequenceEditor(): i32 {
  // the reach zone and the items are drawn by hand: repaint when what they show changes
  createEffect(() => { project(); lang(); selectedItem(); hoveredItem(); turning(); newTurn(); held(); heldLink(); dx(); dy(); newW(); ui.repaint(); });
  return <view ref={rootRef} class="grow relative flex-row">
    <Library />
    <view class="grow basis-0 min-w-0 flex-col">
      <Stage />
      <Timeline />
    </view>
    <Show when={carried() !== null}><Carried /></Show>
  </view>;
}
