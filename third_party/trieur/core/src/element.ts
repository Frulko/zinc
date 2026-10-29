// <trieur-deck> and <trieur-zone> — the declarative API.
//
// Light DOM on purpose: the host draws the cards and must be able to style them from its own
// stylesheet. A shadow root would encapsulate the library's CSS but cut `renderCard` off from
// the rest of the page, which costs more than it buys here.
//
// Two ways to use it, mixable:
//   1. in JS      → deck.options = { items, zones, renderCard, onSort }
//   2. in markup  → <trieur-deck><trieur-zone value="dev">Dev</trieur-zone>…</trieur-deck>
// A property set in JS always wins over markup: that is the case of a host building its zones
// from data.

import { Deck } from './deck.js';
import type { DeckOptions, PlacedZone, Prediction, Zone } from './types.js';

/** A zone declared in markup. Renders nothing: it is configuration, not display. */
export class TrieurZoneElement extends HTMLElement {
  static observedAttributes = ['value', 'key', 'label', 'color', 'icon', 'image'];

  attributeChangedCallback(): void {
    this.#deck()?.zonesChanged();
  }
  connectedCallback(): void {
    this.hidden = true; // in case the library stylesheet is not loaded
    this.#deck()?.zonesChanged();
  }
  disconnectedCallback(): void {
    this.parentElement?.closest<TrieurDeckElement>('trieur-deck')?.zonesChanged();
  }

  #deck(): TrieurDeckElement | null {
    return this.closest('trieur-deck');
  }

  /** The zone object handed to the deck. No `value` means a free zone (fires `onAssign`). */
  get zone(): Zone | null {
    const id = this.getAttribute('value') ?? '';
    if (!id) return null;
    const attr = (n: string) => this.getAttribute(n) ?? undefined;
    return {
      id,
      // ?? and || do not mix without parentheses
      label: attr('label') ?? (this.textContent?.trim() || id),
      key: attr('key'),
      color: attr('color'),
      icon: attr('icon'),
      image: attr('image'),
    };
  }
}

export class TrieurDeckElement extends HTMLElement {
  static observedAttributes = [
    'layout',
    'threshold',
    'keys',
    'min-confidence',
    'segments',
    'multi',
    'tap-zones',
    'touch-preview',
  ];

  #deck: Deck | null = null;
  #opts: DeckOptions = {};
  #host: HTMLElement | null = null;
  #obs: MutationObserver | null = null;
  #queued = false;
  /** a pile set by the host replaces the current one, it does not merge */
  #freshPile = false;

  connectedCallback(): void {
    // <trieur-zone> children may arrive after us (frameworks, innerHTML): observe them
    this.#obs = new MutationObserver(() => this.zonesChanged());
    this.#obs.observe(this, { childList: true });
    this.#schedule();
  }

  disconnectedCallback(): void {
    this.#obs?.disconnect();
    this.#deck?.destroy();
    this.#deck = null;
    this.#host = null;
  }

  attributeChangedCallback(): void {
    this.#schedule();
  }

  /**
   * Called by the <trieur-zone> children when they appear, change or disappear. Zones are
   * updated **without remounting**: the current pile and the undo history survive.
   */
  zonesChanged(): void {
    const zones = this.#zonesFromMarkup();
    if (this.#deck && zones) return this.#deck.setZones(zones);
    this.#schedule();
  }

  /** Full configuration (same keys as `new Deck(el, opts)`). Remounts the pile. */
  set options(o: DeckOptions) {
    this.#opts = { ...o };
    this.#freshPile = 'items' in o;
    this.#schedule();
  }
  get options(): DeckOptions {
    return this.#opts;
  }

  set items(v: unknown[]) {
    this.#opts.items = v;
    this.#deck ? this.#deck.setItems(v) : this.#schedule();
  }
  get items(): unknown[] {
    return this.#deck?.items ?? this.#opts.items ?? [];
  }

  set zones(v: Array<Zone | null>) {
    this.#opts.zones = v;
    this.#deck ? this.#deck.setZones(v) : this.#schedule();
  }
  get zones(): Array<Zone | null> {
    return this.#deck?.zones ?? this.#opts.zones ?? [];
  }

  get deck(): Deck | null {
    return this.#deck;
  }
  get current(): unknown {
    return this.#deck?.current;
  }
  get prediction(): Prediction | null {
    return this.#deck?.prediction ?? null;
  }
  get picking(): PlacedZone[] {
    return this.#deck?.picking ?? [];
  }

  skip(): void {
    this.#deck?.skip();
  }
  undo(): Promise<void> | undefined {
    return this.#deck?.undo();
  }
  override focus(o?: FocusOptions): void {
    this.#deck?.focus(o);
  }

  // --- internals -------------------------------------------------------------

  /** One remount per tick: three <trieur-zone> added in a row do not cause three. */
  #schedule(): void {
    if (this.#queued || !this.isConnected) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      if (this.isConnected) this.#mount();
    });
  }

  #zonesFromMarkup(): Array<Zone | null> | null {
    const zones = [...this.children].filter((el): el is TrieurZoneElement => el.tagName === 'TRIEUR-ZONE');
    return zones.length ? zones.map((el) => el.zone) : null;
  }

  /** Card template declared in markup: <template data-card> with [data-field] nodes. */
  #renderFromTemplate(tpl: HTMLTemplateElement) {
    return (item: any, el: HTMLElement) => {
      el.append(tpl.content.cloneNode(true));
      for (const node of el.querySelectorAll<HTMLElement>('[data-field]')) {
        const v = item?.[node.dataset.field!];
        if (v == null) node.remove();
        else if (node.dataset.attr) node.setAttribute(node.dataset.attr, String(v));
        else node.textContent = String(v);
      }
    };
  }

  #mount(): void {
    // the stage lives in a child of ours: Deck rewrites its container, and we do not want it
    // erasing the <trieur-zone> elements and the <template> that are our configuration
    if (!this.#host || !this.#host.isConnected) {
      this.#host = document.createElement('div');
      this.#host.className = 'tr-host';
      this.append(this.#host);
    }
    const num = (n: string) => (this.hasAttribute(n) ? Number(this.getAttribute(n)) : undefined);
    const tpl = this.querySelector<HTMLTemplateElement>(':scope > template[data-card]');
    const opts: DeckOptions = {
      layout: (this.getAttribute('layout') as DeckOptions['layout']) ?? undefined,
      keys: this.getAttribute('keys') ?? undefined,
      threshold: num('threshold'),
      minConfidence: num('min-confidence'),
      segments: this.getAttribute('segments') === 'false' ? false : undefined,
      multi: this.hasAttribute('multi') ? this.getAttribute('multi') !== 'false' : undefined,
      // both default to on, so the attributes exist to turn them off
      tapZones: this.getAttribute('tap-zones') === 'false' ? false : undefined,
      touchPreview: this.getAttribute('touch-preview') === 'false' ? false : undefined,
      zones: this.#zonesFromMarkup() ?? undefined,
      renderCard: tpl ? this.#renderFromTemplate(tpl) : undefined,
      // JS wins over markup: a data-driven host keeps control
      ...Object.fromEntries(Object.entries(this.#opts).filter(([, v]) => v !== undefined)),
    };
    for (const k of Object.keys(opts) as Array<keyof DeckOptions>) if (opts[k] === undefined) delete opts[k];
    // remounting mid-sort must not bring already-filed cards back
    const left = this.#deck?.items;
    if (left?.length && !this.#freshPile) opts.items = left;
    this.#freshPile = false;
    this.#deck?.destroy();
    this.#deck = new Deck(this.#host, opts);
  }
}

if (!customElements.get('trieur-zone')) customElements.define('trieur-zone', TrieurZoneElement);
if (!customElements.get('trieur-deck')) customElements.define('trieur-deck', TrieurDeckElement);

declare global {
  interface HTMLElementTagNameMap {
    'trieur-deck': TrieurDeckElement;
    'trieur-zone': TrieurZoneElement;
  }
}

export default TrieurDeckElement;
