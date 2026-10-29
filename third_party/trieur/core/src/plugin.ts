// The seam.
//
// The deck's job is small and universal: deal a card, place the zones, follow a pointer, file
// what the gesture chose. Everything past that — throwing, telemetry, a held pad, a menu that
// follows the cursor — is somebody's *particular* idea about sorting, and none of them should
// be in the bundle of a page that does not want them.
//
// So there are two hooks, and deliberately only two:
//
//   `setup(deck)`   runs once, may touch the DOM, returns a teardown. Everything a plugin
//                   needs to *observe* is already public: the `trieur:*` events, `zones`,
//                   `current`, `zoneAt()`, `highlight()`, `commit()`.
//   `aim(ctx)`      the one thing events cannot do: decide, before the deck acts, where the
//                   gesture is pointing. Return a zone, `null` for nowhere, or `undefined`
//                   to keep no opinion and let the deck (or the next plugin) answer.
//
// A plugin is a plain object, so it is also a closure: `flick({ ms: 200 })` returns one with
// its options baked in. There is no registry, no lifecycle beyond setup and teardown, and no
// way for a plugin to reach inside the deck — if it needs something the public surface does
// not have, that is a gap in the public surface.

import type { PlacedZone, Point } from './types.js';

/** What a gesture looks like to a plugin, in pixels from the centre of the stage. */
export interface AimContext<T = any> {
  /** `move` while the pointer is down, `end` on release — the decision that files the card */
  phase: 'move' | 'end';
  /** the card's resting centre */
  from: Point;
  /** where the pointer is now */
  at: Point;
  /** velocity, px/ms, fitted over the last 100ms of the gesture */
  v: Point;
  /** how far the pointer has travelled from where the gesture began */
  dist: number;
  /** the system took the touch back: this is not a drop */
  cancelled: boolean;
  /** what the deck would decide on its own */
  fallback: PlacedZone | null;
  /** the item under the gesture */
  item: T | undefined;
}

export interface DeckPlugin<T = any> {
  /** for debugging and for hosts that keep a list; never used to look one up */
  name?: string;
  setup?(deck: DeckLike<T>): (() => void) | void;
  aim?(ctx: AimContext<T>, deck: DeckLike<T>): PlacedZone | null | undefined;
}

/**
 * The part of the deck a plugin is allowed to see — which is the part everybody sees.
 *
 * Typed structurally rather than as `Deck` so this module stays free of the deck's own
 * imports: `plugin.ts` is the boundary, and a boundary that depends on both sides is a seam
 * in name only.
 */
export interface DeckLike<T = any> {
  readonly root: HTMLElement;
  readonly zones: PlacedZone[];
  readonly current: T | undefined;
  zoneAt(clientX: number, clientY: number): PlacedZone | null;
  highlight(zone: PlacedZone | null, armed?: boolean): void;
  commit(zone: PlacedZone, fling?: number): Promise<boolean>;
}
