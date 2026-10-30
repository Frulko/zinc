// The deck on zinc:ui: the stage carved into one region per zone, the tiles, the pile, the card that follows the pointer, the genie
// that flies a filed card into its tile, and the bar. The behaviour is trieur's (deck.ts in this plugin, trieur's own modules under it);
// this file only draws and routes the pointer and the keys.

import * as ui from 'zinc:ui';
import * as gfx from 'zinc:gfx';
import { createSignal, createEffect, createNodeRef, For, Show } from 'zinc:ui/solid';
import { Icon } from 'zinc:icons';
import { fitVelocity } from '@trieur/core/throw';
import type { PlacedZone } from '@trieur/core';
import type { DeckState, Gesture } from './deck';
import { THEME, colorOf } from './theme';

/** What a tile is showing, for a host that draws its own (`renderZone`). */
export interface TileState {
  near: boolean;
  armed: boolean;
  suggested: boolean;
  /** 1-based place in the multi-zone stack, 0 when not stacked */
  picked: number;
}

export interface DeckProps<T> {
  deck: DeckState<T>;
  /** draws a card: the item's own view, sized by the deck (cardW x cardH) */
  renderCard: (item: T) => any;
  /** draws a tile instead of the default folder tile */
  renderZone?: (zone: PlacedZone, state: () => TileState) => any;
  /** what the stage shows once the pile is empty */
  renderEmpty?: () => any;
  className?: string;
  /** the bar under the stage: count, suggestion, skip, undo, multi (default true) */
  bar?: boolean;
}

// one deck answers the keyboard: the last one mounted (trieur's 'auto' with one deck on screen)
let keyDeck: DeckState<any> | null = null;
let keysBound = false;
function bindKeys(): void {
  if (keysBound) return;
  keysBound = true;
  ui.onKey((e: ui.KeyEvent) => {
    if (keyDeck && keyDeck.key(e.key, e.shift, e.ctrl || e.meta || e.alt, e.repeat)) e.preventDefault();
  });
  ui.onKeyUp((e: ui.KeyEvent) => { if (e.key === 'Shift' && keyDeck) keyDeck.shiftUp(); });
}

export function Deck<T>(props: DeckProps<T>): any {
  const deck = props.deck;
  const T = deck.opts.tile!, CW = deck.opts.cardW!, CH = deck.opts.cardH!;
  const [size, setSize] = createSignal({ w: 0, h: 0 });
  const stage = createNodeRef();
  keyDeck = deck;
  bindKeys();

  // the carving is drawn on a canvas that paints only when something it shows changed
  createEffect(() => { deck.zones; deck.near(); deck.armed(); deck.picks(); deck.prediction; THEME.line; ui.repaint(); });
  const paint = (x: number, y: number, w: number, h: number): void => {
    if (w !== size().w || h !== size().h) queueMicrotask(() => { setSize({ w, h }); deck.layout(w, h); });
    const near = deck.near(), armed = deck.armed(), picks = deck.picks();
    for (const z of deck.zones) {
      if (!z.cell) continue;
      const pts: number[] = [];
      for (const [px, py] of z.cell) { pts.push(x + px); pts.push(y + py); }
      const picked = picks.some((p) => p.index === z.index);
      const lit = near !== null && near.index === z.index;
      const c = picked ? THEME.multi : colorOf(z);
      gfx.polygon(pts, c, z.disabled ? 4 : picked ? 34 : lit ? (armed ? 46 : 22) : 9);
      gfx.stroke(pts, lit && armed ? 2 : 1, lit || picked ? c : THEME.line, lit || picked ? 200 : 60, true);
    }
  };

  const left = () => size().w / 2 + deck.centre().x - CW / 2;
  const top = () => size().h / 2 + deck.centre().y - CH / 2;
  const pile = () => deck.items().slice(0, 2).reverse();   // the card behind first, the top card drawn over it

  return <View className={'flex-col ' + (props.className ?? 'grow')}>
    <View ref={stage} className="relative grow overflow-hidden">
      <Canvas className="absolute inset-0" style={{ lazy: 1 }} onDraw={paint} />
      <For each={deck.zones}>{(z: PlacedZone) => <Tile deck={deck} zone={z} size={size} render={props.renderZone} />}</For>
      <Show when={deck.items().length === 0 && deck.flight() === null}>
        <View className="absolute inset-0 items-center justify-center">
          {props.renderEmpty ? props.renderEmpty() : <View className="items-center gap-3">
            <Icon name="party-popper" size={44} color={() => THEME.accent} />
            <Text className="text-[18px] font-semibold" style={{ color: THEME.ink }}>{deck.text.empty}</Text>
          </View>}
        </View>
      </Show>
      <For each={pile()}>{(item: T) => <Card deck={deck} item={item} stage={stage} left={left} top={top} render={props.renderCard} />}</For>
      <For each={deck.flight() ? [deck.flight()!] : []}>{(f: any) => <Flight deck={deck} flight={f} left={left} top={top} render={props.renderCard} />}</For>
    </View>
    {props.bar === false ? null : <Bar deck={deck} />}
  </View>;
}

/** A card of the pile: the top one follows the pointer, the one behind waits a notch down. */
function Card<T>(p: { deck: DeckState<T>; item: T; stage: { node: number }; left: () => number; top: () => number; render: (item: T) => any }): any {
  const deck = p.deck, item = p.item, CW = deck.opts.cardW!, CH = deck.opts.cardH!;
  const ref = createNodeRef();
  const isTop = () => deck.items()[0] === item;
  let start = { x: 0, y: 0 }, samples: Array<{ t: number; x: number; y: number }> = [], dragging = false, held = false, holdTimer: any = 0, moved = 0;
  let lastTap = 0;

  const gesture = (e: ui.PointerEvent, cancelled: boolean): Gesture => {
    const [x, y] = ui.toLocal(p.stage.node, e.gx, e.gy);
    const dx = x - start.x, dy = y - start.y;
    return { dx, dy, x, y, vx: fitVelocity(samples, 'x'), vy: fitVelocity(samples, 'y'), dist: Math.hypot(dx, dy), cancelled };
  };
  const place = (dx: number, dy: number, k: number): void => {
    ui.setNumber(ref.node, 'translateX', dx);
    ui.setNumber(ref.node, 'translateY', dy);
    ui.setNumber(ref.node, 'rotate', dx / 22);
    zoom(ref.node, 1 - 0.42 * k);
  };
  const home = (): void => {
    for (const [key, v] of [['translateX', 0], ['translateY', 0], ['rotate', 0], ['scaleX', 1], ['scaleY', 1]] as Array<[string, number]>) void ui.animate(ref.node, key, v, 420, 'spring', 0);
  };
  const down = (e: ui.PointerEvent): void => {
    if (!isTop() || deck.busy()) return;
    if (e.clicks === 2 || (Date.now() - lastTap < 320)) {   // a double tap accepts the suggestion: the ↵ a thumb cannot press
      lastTap = 0;
      const s = deck.prediction, z = s ? deck.zones.find((x) => x.id === s.id) : undefined;
      if (z) void deck.commit(z);
      return;
    }
    const [x, y] = ui.toLocal(p.stage.node, e.gx, e.gy);
    start = { x, y }; samples = [{ t: Date.now(), x, y }]; dragging = true; held = false; moved = 0;
    if (deck.opts.multi && deck.opts.holdDelay! > 0) holdTimer = setTimeout(() => { if (dragging && moved < 6) { held = true; deck.hold(); } }, deck.opts.holdDelay);
  };
  const move = (e: ui.PointerEvent): void => {
    if (!dragging) return;
    const g = gesture(e, false);
    samples.push({ t: Date.now(), x: g.x, y: g.y });
    if (samples.length > 24) samples.shift();
    moved = Math.max(moved, g.dist);
    place(g.dx, g.dy, Math.min(g.dist / (deck.opts.threshold! * 2), 1));
    deck.dragMove(g);
  };
  const up = (e: ui.PointerEvent, cancelled: boolean): void => {
    if (!dragging) return;
    dragging = false;
    clearTimeout(holdTimer);
    const g = gesture(e, cancelled);
    if (g.dist < 6 && !held) lastTap = Date.now();
    const zone = deck.dragEnd(g);
    if (!zone) { home(); return; }
    const o = deck.origin();
    const k = Math.min(g.dist / (deck.opts.threshold! * 2), 1);
    void deck.commit(zone, g.dx, { x: o.x + g.dx, y: o.y + g.dy, scale: 1 - 0.42 * k, rotate: g.dx / 22 }).then((left) => { if (!left) home(); });
  };

  const el = <View ref={ref} className="absolute rounded-[20] overflow-hidden"
    style={{ left: p.left(), top: p.top(), width: CW, height: CH, backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.cardLine, shadowColor: 0x000000, shadowOpacity: 0.45, shadowRadius: 24, shadowOffsetY: 14 }}
    grab="keep" onPointerDown={down} onPointerMove={move} onPointerUp={(e: ui.PointerEvent) => up(e, false)} onPointerCancel={(e: ui.PointerEvent) => up(e, true)}>
    {p.render(item)}
  </View>;

  // where it comes from: dealt down one notch, dropped back from above by an undo, or waiting behind
  const rest = (n: number, ty: number, s: number, o: number, ms: number) => {
    void ui.animate(n, 'translateY', ty, ms, 'out', 0); void zoomTo(n, s, ms, 'out', 0);
    void ui.animate(n, 'opacity', o, ms, 'out', 0); void ui.animate(n, 'rotate', 0, ms, 'out', 0); void ui.animate(n, 'translateX', 0, ms, 'out', 0);
  };
  if (isTop()) {
    const undo = deck.enter() === 'undo';
    ui.setNumber(ref.node, 'translateY', undo ? -160 : 14); zoom(ref.node, undo ? 1.03 : 0.94);
    ui.setNumber(ref.node, 'opacity', undo ? 0 : 0.55); ui.setNumber(ref.node, 'rotate', undo ? -2 : 0);
    rest(ref.node, 0, 1, 1, undo ? 380 : 260);
  } else {
    ui.setNumber(ref.node, 'translateY', 28); zoom(ref.node, 0.86); ui.setNumber(ref.node, 'opacity', 0);
    rest(ref.node, 14, 0.94, 0.55, 260);
  }
  let wasTop = isTop();
  createEffect(() => {
    const t = isTop();
    if (t && !wasTop) rest(ref.node, 0, 1, 1, 260);   // the card behind moves up
    else if (!t && wasTop) rest(ref.node, 14, 0.94, 0.55, 260);   // an undo put another card on top of it
    wasTop = t;
  });
  createEffect(() => { const f = deck.flight(); if (f && f.item === item) ui.setNumber(ref.node, 'opacity', 0); });   // the genie has it
  createEffect(() => { ui.setNumber(ref.node, 'left', p.left()); ui.setNumber(ref.node, 'top', p.top()); });
  return el;
}

/** The genie: the filed card is sucked into its tile, keeping the tilt of the gesture. */
function Flight<T>(p: { deck: DeckState<T>; flight: { item: T; from: { x: number; y: number; scale?: number; rotate?: number }; to: { x: number; y: number }; tilt: number; id: number }; left: () => number; top: () => number; render: (item: T) => any }): any {
  const deck = p.deck, f = p.flight, c = deck.centre();
  const ref = createNodeRef();
  const el = <View ref={ref} className="absolute rounded-[20] overflow-hidden"
    style={{ left: p.left(), top: p.top(), width: deck.opts.cardW!, height: deck.opts.cardH!, backgroundColor: THEME.card, borderWidth: 1, borderColor: THEME.cardLine }}>
    {p.render(f.item)}
  </View>;
  ui.setNumber(ref.node, 'translateX', f.from.x - c.x);
  ui.setNumber(ref.node, 'translateY', f.from.y - c.y);
  zoom(ref.node, f.from.scale ?? 1);   // as the pointer let it go
  ui.setNumber(ref.node, 'rotate', f.from.rotate ?? 0);
  const ms = 380;   // it leaves at once and slows into the tile; it shrinks late, so it stays readable on the way
  void ui.animate(ref.node, 'translateX', f.to.x - c.x, ms, 'in-out', 0);
  void ui.animate(ref.node, 'translateY', f.to.y - c.y, ms, 'in-out', 0);
  void zoomTo(ref.node, 0.06, ms, 'in', 0);
  void ui.animate(ref.node, 'rotate', f.tilt, ms, 'in', 0);
  void ui.animate(ref.node, 'opacity', 0.2, ms, 'in', 0).then(() => deck.landed(f.id));
  return el;
}

/** A zone: a filled folder of its colour (or its icon, or its image), its label and its key; lit, suggested and stacked states. */
function Tile<T>(p: { deck: DeckState<T>; zone: PlacedZone; size: () => { w: number; h: number }; render?: (zone: PlacedZone, state: () => TileState) => any }): any {
  const deck = p.deck, T = deck.opts.tile!;
  const ref = createNodeRef();
  const zone = () => deck.zones.find((z) => z.index === p.zone.index) ?? p.zone;
  const state = (): TileState => {
    const z = zone(), near = deck.near(), s = deck.prediction;
    const at = deck.picks().findIndex((x) => x.index === z.index);
    return { near: near !== null && near.index === z.index, armed: deck.armed(), suggested: s !== null && s.id === z.id && !z.empty, picked: at + 1 };
  };
  const tap = (): void => {
    if (deck.opts.tapZones === false || deck.busy()) return;
    void deck.commit(zone());
  };
  const z0 = p.zone, color = colorOf(z0);
  const body = p.render ? p.render(z0, state) : <View className="items-center gap-[6]">
    <View className="w-[50] h-[50] rounded-[15] items-center justify-center"
      style={{ backgroundColor: z0.empty ? THEME.tileBg : color, borderWidth: z0.empty ? 2 : 0, borderColor: THEME.line, shadowColor: color, shadowOpacity: z0.empty ? 0 : 0.5, shadowRadius: 12, shadowOffsetY: 4 }}>
      {glyph(z0)}
    </View>
    <Text className="text-[12px] font-semibold text-center" numberOfLines={1} style={{ color: THEME.ink, maxWidth: T - 8 }}>{z0.empty ? deck.text.free : (z0.label ?? z0.id)}</Text>
    {z0.key ? <View className="px-[6] h-[18] rounded-[5] items-center justify-center" style={{ backgroundColor: THEME.keycap }}><Text className="text-[10px] font-mono" style={{ color: THEME.dim }}>{z0.key.toUpperCase()}</Text></View> : null}
  </View>;
  const el = <View ref={ref} className="absolute items-center justify-center rounded-[18]" onClick={tap}
    style={{ left: p.size().w / 2 + zone().pos.x - T / 2, top: p.size().h / 2 + zone().pos.y - T / 2, width: T, height: T, opacity: z0.disabled ? 0.35 : 1 }}>
    {body}
    <Show when={state().suggested}>
      <View className="absolute top-[2] right-[6] h-[20] px-[6] rounded-full flex-row items-center gap-[3]" style={{ backgroundColor: THEME.accent }}>
        <Text className="text-[11px] font-bold text-white">↵</Text>
        <Text className="text-[10px] font-semibold text-white">{Math.round((deck.prediction?.score ?? 0) * 100) + '%'}</Text>
      </View>
    </Show>
    <Show when={state().picked > 0}>
      <View className="absolute top-[2] left-[8] w-[22] h-[22] rounded-full items-center justify-center" style={{ backgroundColor: THEME.multi }}>
        <Text className="text-[12px] font-bold" style={{ color: THEME.multiInk }}>{String(state().picked)}</Text>
      </View>
    </Show>
  </View>;
  createEffect(() => {
    const z = zone(), s = p.size();
    ui.setNumber(ref.node, 'left', s.w / 2 + z.pos.x - T / 2);
    ui.setNumber(ref.node, 'top', s.h / 2 + z.pos.y - T / 2);
  });
  createEffect(() => {
    const st = state();
    void zoomTo(ref.node, st.near ? (st.armed ? 1.14 : 1.06) : st.picked ? 1.04 : 1, 140, 'out', 0);
    ui.setNumber(ref.node, 'backgroundColor', st.near && st.armed ? colorOf(zone()) : THEME.tileBg);
  });
  let seen = deck.caught().n;
  createEffect(() => {   // the tile acknowledges the card, on the way in as on the way back
    const c = deck.caught();
    if (c.n === seen) return;
    seen = c.n;
    if (!c.ids.includes(zone().id)) return;
    void zoomTo(ref.node, 1.22, 120, 'out', 300).then(() => zoomTo(ref.node, 1, 380, 'spring', 0));
  });
  return el;
}

// `scale` zooms a node from its top-left corner; scaleX and scaleY (React Native's transform) zoom it around its centre
function zoom(n: number, v: number): void { ui.setNumber(n, 'scaleX', v); ui.setNumber(n, 'scaleY', v); }
function zoomTo(n: number, v: number, ms: number, ease: string, delay: number): Promise<void> {
  void ui.animate(n, 'scaleX', v, ms, ease, delay);
  return ui.animate(n, 'scaleY', v, ms, ease, delay);
}

/** The zone's glyph: an image, a Lucide icon name, a character, or the folder. */
function glyph(z: PlacedZone): any {
  if (z.empty) return <Icon name="plus" size={22} color={() => THEME.dim} />;
  const icon = z.icon ?? '';
  if (/^[a-z][a-z0-9-]*$/.test(icon)) return <Icon name={icon} size={24} color={() => 0xffffff} />;
  if (icon) return <Text className="text-[22px] text-white">{icon}</Text>;
  return <Icon name="folder" size={24} color={() => 0xffffff} />;
}

/** Count, the model's suggestion, skip, undo, and the multi-zone toggle. */
export function Bar<T>(p: { deck: DeckState<T> }): any {
  const deck = p.deck;
  const chip = (label: () => string, key: () => string, icon: string, run: () => void, on?: () => boolean): any =>
    <Button onClick={run} className="h-[34] px-3 rounded-[10] flex-row items-center gap-2"
      style={{ backgroundColor: on && on() ? THEME.multi : THEME.chip }}>
      <Icon name={icon} size={15} color={() => (on && on() ? THEME.multiInk : THEME.ink)} />
      <Text className="text-[13px] font-medium" style={{ color: on && on() ? THEME.multiInk : THEME.ink }}>{label()}</Text>
      <Text className="text-[10px] font-mono" style={{ color: on && on() ? THEME.multiInk : THEME.dim }}>{key()}</Text>
    </Button>;
  return <View className="h-[58] shrink-0 flex-row items-center gap-2 px-4">
    <Text className="text-[13px] font-semibold" style={{ color: THEME.dim }}>{deck.text.count(deck.items().length)}</Text>
    <Show when={deck.prediction !== null}>
      <View className="h-[28] px-3 rounded-full flex-row items-center gap-2" style={{ backgroundColor: THEME.accentSoft }}>
        <Icon name="sparkles" size={14} color={() => THEME.accent} />
        <Text className="text-[12px] font-semibold" style={{ color: THEME.ink }}>
          {(() => { const s = deck.prediction; const z = s ? deck.zones.find((x) => x.id === s.id) : undefined; return s ? '↵ ' + (z?.label ?? s.id) + ' · ' + Math.round(s.score * 100) + '%' : ''; })()}
        </Text>
      </View>
    </Show>
    <View className="grow" />
    {deck.opts.multi ? chip(() => (deck.picks().length ? deck.text.sortMany(deck.picks().length) : deck.text.multi), () => '⇧', 'layers', () => {
      if (deck.picks().length) void deck.commitMany(); else deck.setMultiMode(deck.multi() ? null : 'latch');
    }, () => deck.multi() !== null) : null}
    {chip(() => deck.text.skip, () => deck.text.space, 'skip-forward', () => deck.skip())}
    {chip(() => deck.text.undo, () => '⌫', 'undo-2', () => void deck.undo())}
  </View>;
}
