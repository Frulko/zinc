/** Preserve the measured video area's aspect ratio within the current Ultra pixel budget. */
export function fitDisplay(width: number, height: number): { width: i32; height: i32 } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 480 || height < 480) return null;
  const scale = Math.min(1, 1920 / width, 720 / height);
  const fittedWidth = Math.floor(width * scale / 2) * 2, fittedHeight = Math.floor(height * scale / 2) * 2;
  return fittedWidth < 480 || fittedHeight < 480 ? null : { width: fittedWidth, height: fittedHeight };
}
