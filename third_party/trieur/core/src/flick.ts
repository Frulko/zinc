// The throw, as a plugin.
//
// It used to live in the deck, which meant every page that imported a card sorter also carried
// a projection, a velocity fit and a debug renderer whether or not it wanted them. Now it is an
// import: `plugins: [flick()]`, and a page that does not say so ships none of it.
//
// The physics and the aiming are in `throw.ts` — DOM-free and tested. This file is the wiring:
// it reads the gesture, asks that resolver, tells the deck what is being aimed at, and (when
// asked) draws the vector so the numbers can be tuned by eye.

import { resolveThrow, throwDefaults, type ThrowResult } from './throw.js';
import type { AimContext, DeckLike, DeckPlugin } from './plugin.js';
import type { PlacedZone, Prediction } from './types.js';

export interface FlickOptions {
  /** how far ahead the release is projected, in ms of travel (default 170) */
  ms?: number;
  /** the same projection as a scroll view's deceleration rate per ms; overrides `ms` */
  decay?: number;
  /** px/ms below which a release is an ordinary drop (default 0.6) */
  min?: number;
  /** how much wider the model's suggestion catches a throw, in tiles (default 0.4) */
  bias?: number;
  /** draw the vector and the suggestion's gravity well */
  debug?: boolean;
}

/** `trieur:throw` — every release the plugin looked at, thrown or not. */
export interface ThrowDetail {
  thrown: boolean;
  speed: number;
  carried: number;
  why: ThrowResult['why'];
  zone: PlacedZone | null;
}

const SVG = 'http://www.w3.org/2000/svg';

export function flick(opts: FlickOptions = {}): DeckPlugin {
  const settings = throwDefaults({
    ...(opts.min !== undefined ? { min: opts.min } : {}),
    ...(opts.decay !== undefined ? { ms: opts.decay / Math.max(1 - opts.decay, 1e-4) } : opts.ms !== undefined ? { ms: opts.ms } : {}),
    ...(opts.bias !== undefined ? { bias: opts.bias } : {}),
  });

  let layer: SVGSVGElement | null = null;
  let stage: HTMLElement | null = null;

  /** The debug view: the vector, where it lands, and how wide the suggestion is catching. */
  const paint = (deck: DeckLike, t: ThrowResult | null, at: { x: number; y: number } | null) => {
    if (!layer || !stage) return;
    if (!t?.thrown || !at) return void layer.toggleAttribute('hidden', true);
    const r = stage.getBoundingClientRect();
    const guess = (deck as { prediction?: Prediction | null }).prediction;
    const tile = deck.zones[0] ? 104 : 104;
    const zone = guess ? deck.zones.find((z) => z.id === guess.id) : null;
    const pull = zone && guess ? settings.bias * guess.score * tile : 0;
    layer.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    layer.innerHTML =
      `<line x1="${(at.x + r.width / 2).toFixed(1)}" y1="${(at.y + r.height / 2).toFixed(1)}" x2="${(t.landing.x + r.width / 2).toFixed(1)}" y2="${(t.landing.y + r.height / 2).toFixed(1)}" class="tr-vec-line"/>` +
      `<circle cx="${(t.landing.x + r.width / 2).toFixed(1)}" cy="${(t.landing.y + r.height / 2).toFixed(1)}" r="9" class="tr-vec-dot"/>` +
      (pull > 4
        ? `<circle cx="${(r.width / 2 + zone!.pos.x).toFixed(1)}" cy="${(r.height / 2 + zone!.pos.y).toFixed(1)}" r="${pull.toFixed(1)}" class="tr-vec-well"/>`
        : '');
    layer.toggleAttribute('hidden', false);
  };

  return {
    name: 'flick',

    setup(deck) {
      if (!opts.debug) return;
      stage = deck.root.querySelector<HTMLElement>('.tr-stage');
      layer = document.createElementNS(SVG, 'svg');
      layer.setAttribute('class', 'tr-vector');
      layer.setAttribute('aria-hidden', 'true');
      layer.toggleAttribute('hidden', true);
      stage?.append(layer);
      return () => {
        layer?.remove();
        layer = null;
        stage = null;
      };
    },

    aim(ctx: AimContext, deck) {
      const r = deck.root.querySelector('.tr-stage')!.getBoundingClientRect();
      const guess = (deck as { prediction?: Prediction | null }).prediction;
      const t = resolveThrow({
        at: ctx.at,
        from: ctx.from,
        v: ctx.v,
        zones: deck.zones
          .filter((z) => !z.disabled)
          .map((z) => ({ index: z.index, pos: z.pos, score: guess && guess.id === z.id ? guess.score : 0 })),
        stage: { w: r.width, h: r.height },
        opts: settings,
        // the carving is in screen coordinates, the throw in stage ones
        regionAt: (p) => deck.zoneAt(r.left + r.width / 2 + p.x, r.top + r.height / 2 + p.y)?.index ?? null,
      });

      if (opts.debug) paint(deck, ctx.phase === 'end' ? null : t, ctx.at);

      const zone = t.thrown && t.index !== null ? (deck.zones.find((z) => z.index === t.index) ?? null) : null;
      if (ctx.phase === 'end') {
        deck.root.dispatchEvent(
          new CustomEvent<ThrowDetail>('trieur:throw', {
            bubbles: true,
            detail: { thrown: t.thrown, speed: t.speed, carried: t.carried, why: t.why, zone },
          }),
        );
      }
      // a release too slow to be a throw is not this plugin's business
      return t.thrown ? zone : undefined;
    },
  };
}
