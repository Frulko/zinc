export function hudDistance(meters: number, known: boolean): string {
  if (!known || !Number.isFinite(meters) || meters < 0) return '—';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}
export function maneuverGlyph(type: i32): string {
  if (type === 1 || type === 20 || type === 47 || type === 13 || type === 22 || type === 49 || type === 52) return '←';
  if (type === 2 || type === 21 || type === 48 || type === 14 || type === 23 || type === 50 || type === 53) return '→';
  if (type === 4 || type === 18 || type === 19 || type === 26) return '↶';
  if (type === 6 || type === 7 || (type >= 28 && type <= 46)) return '↻';
  if (type === 3 || type === 5 || type === 8 || type === 9 || type === 11 || type === 51) return '↑';
  return '·';
}
