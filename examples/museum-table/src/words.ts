// The few words the player itself says (everything else comes from the project file), in French and English; another language reads English.
const WORDS: string[] = [
  'film', 'Film, bientôt à l’écran', 'Film, on screen soon',
  'panorama', 'Panorama à 360°, bientôt explorable', '360° panorama, explorable soon',
  'model', 'Objet en 3D', '3D object',
  'close', 'Toucher pour refermer', 'Touch to close',
  'reset', 'Vue de départ', 'Reset the view',
  'light', 'Lumière', 'Light',
  'studio', 'Atelier', 'Studio',
  'raking', 'Rasante', 'Raking',
  'flat', 'Diffuse', 'Flat',
  'points', 'Touchez un point pour en savoir plus', 'Touch a point to learn more',
];

export function word(key: string, lang: string): string {
  const i = WORDS.indexOf(key);
  return i < 0 || i % 3 !== 0 ? key : WORDS[i + (lang === 'fr' ? 1 : 2)];
}
