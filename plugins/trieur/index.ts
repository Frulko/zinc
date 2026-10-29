// zinc:trieur: trieur's deck on zinc:ui. `createDeck` holds the pile and the gesture (deck.ts), `<Deck>` draws it (view.tsx); trieur's
// own modules come as they are: `@trieur/core` (layouts, the throw: `flick()` from '@trieur/core/flick'), `@trieur/learn` (the model).

export { DeckState, createDeck } from './deck';
export type { DeckConfig, Flight, Gesture, MultiSource } from './deck';
export { Deck, Bar } from './view';
export type { DeckProps, TileState } from './view';
export { THEME, setTheme, setScheme, isDark, colorOf } from './theme';
export type { Palette } from './theme';
export { kvStore } from './store';
