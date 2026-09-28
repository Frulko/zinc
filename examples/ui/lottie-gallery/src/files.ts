// The animations of the gallery (files in assets/, embedded at build time).

export const FILES: string[] = [
  'spinner.json', 'shapes.json', 'orbit.json', 'TwitterHeart.json', 'Watermelon.json', 'PinJump.json',
  'LottieLogo1.json', 'IconTransitions.json', '9squares_AlBoardman.json', 'HamburgerArrow.json', 'Switch.json',
  'skottie-trimpath-modes.json',
];

/** "9squares_AlBoardman.json" -> "9squares" */
export function displayName(file: string): string {
  return file.replace('.json', '').replace('_AlBoardman', '').replace('skottie-', '');
}
