// Default rendering of a zone.
//
// A zone is a tile, not a label: a 46px chip filled with its colour, or its emoji, or its
// image; a two-line label; the key at the foot. `renderZone` takes over if you want
// something else.

import type { DeckText, PlacedZone } from './types.js';

// A filled folder, Finder style: the colour fills the shape, it does not settle for an outline.
const FOLDER =
  'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z';

export function defaultTile(z: PlacedZone, text: DeckText): DocumentFragment {
  const frag = document.createDocumentFragment();

  const glyph = document.createElement('span');
  glyph.className = 'tr-glyph';
  if (z.image) {
    const img = document.createElement('img');
    img.src = z.image;
    img.alt = '';
    img.addEventListener('error', () => img.remove());
    glyph.append(img);
  } else if (z.icon) {
    glyph.textContent = z.icon;
  } else {
    glyph.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${FOLDER}" fill="currentColor"/></svg>`;
  }

  const label = document.createElement('span');
  label.className = 'tr-label';
  label.textContent = z.empty ? text.free : (z.label ?? z.id);
  frag.append(glyph, label);

  if (z.key) {
    const kbd = document.createElement('kbd');
    kbd.textContent = z.key;
    frag.append(kbd);
  }
  return frag;
}
