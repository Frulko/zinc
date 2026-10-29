/** Resize the window so its current video canvas matches the decoded video ratio. */
export function fitWindowHeight(windowHeight: number, areaWidth: number, areaHeight: number, videoWidth: number, videoHeight: number): i32 | null {
  if (!Number.isFinite(windowHeight) || !Number.isFinite(areaWidth) || !Number.isFinite(areaHeight) ||
      !Number.isFinite(videoWidth) || !Number.isFinite(videoHeight) ||
      areaWidth <= 0 || areaHeight <= 0 || videoWidth <= 0 || videoHeight <= 0) return null;
  const height = Math.round(windowHeight + areaWidth * videoHeight / videoWidth - areaHeight);
  return height >= 400 && height <= 2160 ? height : null;
}
