// Labels. English by default, French provided, anything else through the `text` option.

import type { DeckText } from './types.js';

export const en: DeckText = {
  empty: 'Nothing to sort.',
  skip: 'Skip',
  undo: 'Undo',
  expand: 'Expand',
  close: 'Close (Esc)',
  play: 'Sort',
  stop: 'Stop',
  free: 'free zone',
  multi: 'Multiple zones',
  hold: 'Hold for multiple zones',
  space: 'space',
  count: (n) => `${n} left`,
  sortMany: (n) => `Sort into ${n} zone${n > 1 ? 's' : ''}`,
  detail: 'Details',
};

export const fr: DeckText = {
  empty: 'Rien à trier.',
  skip: 'Passer',
  undo: 'Annuler',
  expand: 'Agrandir',
  close: 'Fermer (Échap)',
  play: 'Trier',
  stop: 'Arrêter',
  free: 'zone libre',
  multi: 'Plusieurs zones',
  hold: 'Maintenir pour plusieurs zones',
  space: 'espace',
  count: (n) => `${n} à trier`,
  sortMany: (n) => `Ranger dans ${n} zone${n > 1 ? 's' : ''}`,
  detail: 'Détail',
};
