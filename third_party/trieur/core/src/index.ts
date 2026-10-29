export { Deck, default } from './deck.js';
export {
  layouts,
  resolveLayout,
  radialLayout,
  dockLayout,
  clearCentre,
  clampToStage,
  fitToStage,
  clearanceAt,
  relax,
  angleOf,
  angleGap,
  type RadialOptions,
  type DockOptions,
} from './layouts.js';
export { voronoi, inPolygon, pathOf } from './voronoi.js';
export { defaultTile } from './tile.js';
export { startGesture } from './drag.js';
export type { DeckPlugin, AimContext, DeckLike } from './plugin.js';
export { animateFrom } from './anim.js';
export { en, fr } from './text.js';
export type {
  Advisor,
  DeckEventMap,
  DeckOptions,
  DeckText,
  Layout,
  LayoutBox,
  Placement,
  PlacedZone,
  Point,
  Polygon,
  Prediction,
  SortRecord,
  Zone,
} from './types.js';
