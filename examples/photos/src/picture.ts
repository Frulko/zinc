// The picture the demo saves: a gradient with a disc whose place and colour change with `seed`, as RGBA bytes for zinc:photos' savePixels.
export const PICTURE_SIZE = 256;

export function generatePicture(seed: number): u8[] {
  const n = PICTURE_SIZE, px: u8[] = [];
  const cx = 64 + (seed * 37) % 128, cy = 64 + (seed * 53) % 128, r = 48;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const inDisc = (x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r;
      px.push(inDisc ? 255 : Math.trunc(x * 255 / n));
      px.push(inDisc ? (seed * 70) % 256 : Math.trunc(y * 255 / n));
      px.push(inDisc ? 64 : 200);
      px.push(255);
    }
  return px;
}
