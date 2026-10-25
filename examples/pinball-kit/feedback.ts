// A quick mechanical compression and return; cosmetic only, never feeds back into collisions.
export function recoil(remaining: number): number {
  const t = Math.max(0, Math.min(1, remaining));
  return Math.sin(t * Math.PI) * t;
}
