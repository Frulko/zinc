// The few words the player itself says (everything else comes from the project file), in French and English; another language reads English.
const WORDS: string[] = [
  'film', 'Film, bientôt à l’écran', 'Film, on screen soon',
  'model', 'Objet en 3D', '3D object',
  'close', 'Toucher pour refermer', 'Touch to close',
  'reset', 'Vue de départ', 'Reset the view',
  'light', 'Lumière', 'Light',
  'studio', 'Atelier', 'Studio',
  'raking', 'Rasante', 'Raking',
  'flat', 'Diffuse', 'Flat',
  'points', 'Touchez un point pour en savoir plus', 'Touch a point to learn more',
  'map-button', 'Plan', 'Map',
  'map-close', 'Refermer le plan', 'Close the map',
  'map', 'Plan de la visite', 'Map of the visit',
  'map-hint', 'Touchez une étape pour y aller. Celles que vous avez vues sont cochées.', 'Touch a stage to go there. The ones you have seen are ticked.',
  'here', 'Vous êtes ici', 'You are here',
];

export function word(key: string, lang: string): string {
  const i = WORDS.indexOf(key);
  return i < 0 || i % 3 !== 0 ? key : WORDS[i + (lang === 'fr' ? 1 : 2)];
}
