// Colour helpers for LED matrices.

/** Saturated colour around the colour wheel, h in 0..1 (wraps). */
export function rainbow(h: number): u32 {
  const k = (n: number): number => {
    const t = (n + (h - Math.floor(h)) * 6) % 6;
    return Math.max(0, Math.min(1, Math.min(t, 4 - t)));
  };
  return (Math.round(k(5) * 255) << 16) | (Math.round(k(3) * 255) << 8) | Math.round(k(1) * 255);
}

/** Scales a colour's brightness (k in 0..1). */
export function dim(c: u32, k: number): u32 {
  const r = Math.floor(((c >> 16) & 255) * k), g = Math.floor(((c >> 8) & 255) * k), b = Math.floor((c & 255) * k);
  return (r << 16) | (g << 8) | b;
}
