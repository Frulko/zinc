// Public types for the deck.
//
// Nothing from any domain: an item is an opaque object, a zone an opaque label. Everything
// that knows what is being sorted lives in the host application.

import type { DeckPlugin } from './plugin.js';

export type Point = { x: number; y: number };
export type Polygon = Array<[number, number]>;

/** A zone: a fixed spot on the stage, with its key. */
export interface Zone {
  id: string;
  label?: string;
  /**
   * Present, visible, and not available right now — greyed rather than removed.
   *
   * Removing a zone moves every other one, and a menu whose items move is a menu you have to
   * read again. A disabled zone keeps its place and its key, refuses the card, and says so.
   */
  disabled?: boolean;
  /** keyboard key; assigned by position when absent */
  key?: string;
  color?: string;
  icon?: string;
  image?: string;
}

/** A zone once the deck has placed it on the stage. */
export interface PlacedZone extends Zone {
  index: number;
  /** free zone: nothing is assigned to it yet, dropping calls `onAssign` */
  empty: boolean;
  key: string;
  angle: number;
  pos: Point;
  /** the slice of stage this zone owns (Voronoi); null when `segments: false` */
  cell: Polygon | null;
}

export interface LayoutBox {
  w: number;
  h: number;
  /** the card's own size, for a layout that wants to hug it rather than clear it */
  cardW: number;
  cardH: number;
  /** half-width of the box to keep clear at the centre — the card, plus half a tile */
  clearX: number;
  /** half-height of that box */
  clearY: number;
  /** largest dimension of a zone tile, measured — so a layout can keep one on the stage */
  tile: number;
  /** safe margin from the edges of the stage, on top of half a tile (`zonePadding`) */
  pad: number;
  /** how far floating tiles are drawn in towards the card, 0–0.8 (`zonePull`) */
  pull: number;
}

/**
 * What a layout hands back. Points alone are enough for tiles floating over a Voronoi
 * carving; a radial menu needs to describe its own wedges, so it may return them too.
 * Cells are in the same coordinates as points: pixels from the centre of the stage.
 */
export interface Placement {
  points: Point[];
  cells?: Polygon[];
  /**
   * Where the card should sit, in pixels from the centre of the stage.
   *
   * A layout that does not surround the card — a half or quarter radial menu — wants the hole
   * somewhere other than the middle, so that the arc gets the whole stage instead of half of
   * it. Absent, the card stays centred.
   */
  centre?: Point;
}

/**
 * A layout places N zones around the centre, in pixels.
 *
 * `layoutName` is what the deck writes as `tr-layout-<name>` on the root; the built-in
 * factories set it, and your own may, so the stylesheet can tell what it is looking at.
 */
export type Layout = ((n: number, box: LayoutBox) => Point[] | Placement) & { layoutName?: string };

/** A zone the model suggests, with the features that carried the decision. */
export interface Prediction {
  id: string;
  score: number;
  why: string[];
}

/** One filing, as handed to the model. A card filed into three zones sends three of these. */
export interface SortRecord<T = unknown> {
  item: T;
  meta: unknown;
  zoneId: string;
  /** what the model had suggested — used to measure how right it was */
  predicted?: string | null;
  at: number;
}

/**
 * What the deck expects from a model. `@trieur/learn` provides one, but anything answering
 * `best()` will do — including a network call: the deck accepts a promise and drops the
 * answer if the card changed in the meantime.
 */
export interface Advisor<T = unknown> {
  best(meta: unknown, zoneIds: string[], minScore?: number): Prediction | null | Promise<Prediction | null>;
  record?(r: SortRecord<T>): unknown;
  forget?(r: SortRecord<T>): unknown;
}

/** Interface labels. English by default, `fr` provided, or bring your own. */
export interface DeckText {
  empty: string;
  skip: string;
  undo: string;
  expand: string;
  close: string;
  /** the big button that wakes an inline deck on a touch screen */
  play: string;
  /** …and the one that gives the scroll back */
  stop: string;
  free: string;
  /** label of the multi-zone toggle */
  multi: string;
  /** accessible name of the held pad */
  hold: string;
  /** name of the space bar, shown as the skip shortcut */
  space: string;
  count: (n: number) => string;
  /** label of the toggle once zones are picked */
  sortMany: (n: number) => string;
  /** button that opens the detail panel */
  detail: string;
}

/**
 * The detail view: the same card, in full.
 *
 * A card is a decision, not a document — it says just enough to file. But some piles need a
 * closer look before the gesture (read the mail, watch the clip, open the page), and making
 * that a separate navigation loses the pile. So the deck opens a panel over the stage instead,
 * from a button and from one key, and the same key closes it: looking is a mode you enter and
 * leave, not a place you go.
 */
export interface DetailOptions<T = unknown> {
  /** fills the panel for the current card. Called again when the card changes under it. */
  render: (item: T, el: HTMLElement) => void;
  /** the key that opens and closes it. Ignored if a zone already uses it. Default `i`. */
  key?: string;
  /** the button's label. Default: the `detail` label of the text pack. */
  label?: string;
  /**
   * `'drawer'` (default) slides in from the right and leaves the pile visible.
   * `'modal'` is a sheet centred over the stage, for a card that is really a document.
   * `'card'` is the same sheet, but it **grows out of the card itself** and shrinks back into
   * it on the way out — the card does not open something else, it becomes it.
   */
  mode?: 'drawer' | 'modal' | 'card';
  /** width of the drawer — any CSS length. Default `min(420px, 92%)`. */
  width?: string;
  /** shown in the panel's header */
  title?: (item: T) => string;
}

export interface DeckOptions<T = any> {
  /** the pile to sort; the first element is the top card */
  items?: T[];
  /** zones; `null` means a free zone */
  zones?: Array<Zone | null>;
  /** draws the card (required in practice) */
  renderCard?: (item: T, el: HTMLElement) => void;
  /** draws a zone; a Finder-style folder tile by default */
  renderZone?: (zone: PlacedZone, el: HTMLElement) => void;
  /** metadata handed to the model; the item itself by default */
  meta?: (item: T) => unknown;
  advisor?: Advisor<T>;
  /** minimum score for a zone to be suggested */
  minConfidence?: number;
  layout?: Layout | 'auto' | 'circle' | 'radial' | 'voronoi' | 'grid' | 'dock';
  /** carve the stage into regions and aim at the region rather than at an angle */
  segments?: boolean;
  /**
   * Tapping a zone files the current card into it — no drag at all (default `true`).
   *
   * This is native behaviour, not a mode: dragging is expressive and slow, and when the zones
   * are already on screen and within reach, pointing at the answer is simply faster. The drag,
   * the keys and the throw all still work, and multi-zone mode still turns a tap into a pick
   * rather than a filing.
   *
   * Turn it off where a tile click already means something else to the host — a zone editor,
   * for instance, where clicking a zone opens its settings.
   */
  tapZones?: boolean;
  /**
   * Safe margin between a zone tile and the edge of the stage, in px, on top of the tile's own
   * half-width (default 12). A tile flush against the edge reads as clipped, and on a phone it
   * sits where the browser's own edge gestures live.
   */
  zonePadding?: number;
  /**
   * How far floating tiles are drawn in towards the pile, 0–0.8 (default 0.18).
   *
   * Zones spread to the far corners are all reachable and none of them are readable — the eye
   * travels to each label in turn. Gathering them around the card makes the set take one
   * glance. The carving follows the tiles, so the regions stay where they look. Layouts that
   * describe their own regions (radial, grid, dock) ignore it: their tiles belong where the
   * geometry puts them.
   */
  zonePull?: number;
  /** keys handed to zones, in order */
  keys?: string;
  /** drag distance past which the drop is armed, in px */
  threshold?: number;
  /**
   * Grows (or shrinks) the dead zone around the pile, in px, default 0.
   *
   * A zone is only aimed at once the pointer has left the card — all the way round it, not
   * just downwards. The regions begin at the card's edge, and in a dock they begin *under* it,
   * so without a dead zone the tile below the pile lit up while the finger was still on the
   * card and, in multi-zone mode, joined the stack on the smallest movement.
   */
  deadZone?: number;
  /**
   * Allow a card to be filed into several zones at once. Off by default: it only makes
   * sense when zones are not mutually exclusive (folders, tags), and the host is the only
   * one who knows that.
   */
  multi?: boolean;
  /**
   * The held pad that turns multi-zone mode on with a thumb, like a virtual gamepad button.
   *
   * `'dynamic'` summons it wherever the thumb presses and holds on the stage, the way a
   * virtual joystick appears under the thumb rather than waiting in a corner. `'left'` /
   * `'right'` pin it to a corner. `'auto'` (default) means dynamic on coarse pointers and
   * nothing on a mouse. `false` removes it. Ignored unless `multi` is on.
   */
  multiPad?: 'auto' | 'dynamic' | 'left' | 'right' | false;
  /**
   * How long a finger must rest on a card before it turns multi-zone mode on, in ms. The same
   * finger then sweeps across zones, and releasing files them. `0` disables it.
   */
  holdDelay?: number;
  /**
   * On a touch screen, an inline deck starts as a **preview** (default `true`).
   *
   * A sorting swipe and a page scroll are the same gesture: taking one takes the other, and the
   * page turns into a trap you cannot scroll past. So until you say otherwise the page keeps
   * the swipe, and the deck shows a play button — press it (or the card, or Expand) and the
   * deck takes the gesture; Stop hands the scroll back. The same bargain an embedded map
   * makes. Set it to `false` where the deck already *is* the screen: an app view, a
   * phone-sized popup.
   */
  touchPreview?: boolean;
  /**
   * Where the keyboard shortcuts are listened for (default `'auto'`).
   *
   * `'auto'`: the stage always answers when it has focus, and the deck *also* answers keys
   * pressed anywhere on the page when it is the only deck on screen — half of it visible, and
   * no other deck alongside. A sorter you must click before the keys work hides its fastest
   * path behind a step nobody is told about; two sorters on screen fall back to focus, because
   * the page cannot know which one you meant. Typing in a field always wins.
   *
   * `'focus'`: only when the stage has focus. `false`: no shortcuts at all.
   */
  keyboard?: 'auto' | 'focus' | false;
  /**
   * **Experimental.** How many piles to deal at once, side by side, sharing the same zones
   * (default 1).
   *
   * It is for a big tablet held in two hands: one pile in the middle has both thumbs doing the
   * same job in turn, two piles have each thumb owning one, and neither waits for the other. A
   * pile keeps its card until that card leaves, so filing on the left never shuffles what the
   * right hand was about to drop. The keyboard, the suggestion and Undo follow the pile you
   * last touched — `deck.active`.
   */
  piles?: number;
  /**
   * Extra behaviour, kept out of the bundle of every page that does not want it.
   *
   * `plugins: [flick()]` is how the throw is turned on; the deck itself knows nothing about it
   * beyond two hooks — see `plugin.ts`. Everything else a plugin needs is the public API, and
   * anything it cannot reach that way is a gap in the public API rather than a reason to open
   * the deck up.
   */
  /** a closer look at the current card, without leaving the pile. See `DetailOptions`. */
  detail?: DetailOptions<T>;
  plugins?: Array<DeckPlugin<T>>;
  text?: Partial<DeckText>;
  onSort?: (item: T, zone: PlacedZone) => unknown;
  /** files one card into several zones at once; see `multi` */
  onSortMany?: (item: T, zones: PlacedZone[]) => unknown;
  onUndo?: (item: T, zone: PlacedZone) => unknown;
  onUndoMany?: (item: T, zones: PlacedZone[]) => unknown;
  onSkip?: (item: T) => unknown;
  onAssign?: (index: number, item: T) => unknown;
  onEmpty?: () => unknown;
}

/** `detail` of the `trieur:*` events. */
export interface DeckEventMap<T = unknown> {
  /** `zone` is the primary (first) zone; `zones` holds them all */
  sort: { item: T; zone: PlacedZone; zones: PlacedZone[]; predicted: string | null; correct: boolean };
  undo: { item: T; zone: PlacedZone; zones: PlacedZone[] };
  skip: { item: T };
  assign: { index: number; item: T };
  suggest: { item: T } & Prediction;
  /** a drag ended: what the release was worth, and what it aimed at. See `flick`. */
  /** a drag ended: how far it travelled, and what it resolved to */
  release: { item: T | undefined; zone: PlacedZone | null; dist: number; cancelled: boolean };
  /** the multi-zone selection changed */
  pick: { item: T | undefined; zones: PlacedZone[]; multi: boolean };
  expand: { expanded: boolean };
  /** the detail panel opened or closed */
  detail: { item: T | undefined; open: boolean };
  empty: Record<string, never>;
  error: { item?: T; zone?: PlacedZone; error: unknown };
}
