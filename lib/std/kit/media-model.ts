// Image-space geometry shared by the inline media controls and the modal viewer.
export class MediaRect {
  constructor(public x: number = 0, public y: number = 0, public width: number = 0, public height: number = 0) {}
}
export class ImageView {
  /** Screen points per source pixel; zero fits and centres the image. */
  constructor(public zoom: number = 0, public cx: number = 0, public cy: number = 0) {}
}
export function clampMedia(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
export function fitImageRect(width: number, height: number, imageWidth: number, imageHeight: number, insetX: number = 0, insetY: number = 0): MediaRect {
  const iw = Math.max(1, imageWidth), ih = Math.max(1, imageHeight);
  const scale = Math.max(0, Math.min(Math.max(1, width - insetX * 2) / iw, Math.max(1, height - insetY * 2) / ih));
  return new MediaRect((width - iw * scale) / 2, (height - ih * scale) / 2, iw * scale, ih * scale);
}
/** A local anchor stays fixed while the zoom changes by ratio. */
export function zoomOffset(offset: number, anchor: number, ratio: number): number { return anchor - ratio * (anchor - offset); }
export function imagePanLimit(size: number, viewport: number): number { return Math.max(0, (size - viewport) / 2); }
export class ImageViewport {
  width: number = 1; height: number = 1; imageWidth: number = 1; imageHeight: number = 1;
  zoom: number = 1; cx: number = 0.5; cy: number = 0.5; fit: number = 1;
  set(view: ImageView, width: number, height: number, iw: number, ih: number, maxZoom: number = 16): void {
    this.width = Math.max(1, width); this.height = Math.max(1, height);
    this.imageWidth = Math.max(1, iw); this.imageHeight = Math.max(1, ih);
    this.fit = Math.min(this.width / this.imageWidth, this.height / this.imageHeight);
    this.zoom = view.zoom <= 0 ? this.fit : clampMedia(view.zoom, Math.min(this.fit, 1), Math.max(this.fit, maxZoom));
    const halfX = Math.min(this.imageWidth / 2, this.width / (this.zoom * 2));
    const halfY = Math.min(this.imageHeight / 2, this.height / (this.zoom * 2));
    this.cx = view.zoom <= 0 ? this.imageWidth / 2 : clampMedia(view.cx, halfX, this.imageWidth - halfX);
    this.cy = view.zoom <= 0 ? this.imageHeight / 2 : clampMedia(view.cy, halfY, this.imageHeight - halfY);
  }
  value(): ImageView { return new ImageView(this.zoom, this.cx, this.cy); }
  atZoom(zoom: number, x: number, y: number, maxZoom: number = 16): ImageView {
    const next = clampMedia(zoom, Math.min(this.fit, 1), Math.max(this.fit, maxZoom));
    const px = this.cx + (x - this.width / 2) / this.zoom;
    const py = this.cy + (y - this.height / 2) / this.zoom;
    const view = new ImageView(next, px - (x - this.width / 2) / next, py - (y - this.height / 2) / next);
    const resolved = new ImageViewport(); resolved.set(view, this.width, this.height, this.imageWidth, this.imageHeight, maxZoom);
    return resolved.value();
  }
  pan(dx: number, dy: number, maxZoom: number = 16): ImageView {
    const view = new ImageView(this.zoom, this.cx - dx / this.zoom, this.cy - dy / this.zoom);
    const resolved = new ImageViewport(); resolved.set(view, this.width, this.height, this.imageWidth, this.imageHeight, maxZoom);
    return resolved.value();
  }
  /** Source pixels and local destination, already cut to the visible box. */
  visible(): number[] {
    const x = this.width / 2 - this.cx * this.zoom, y = this.height / 2 - this.cy * this.zoom;
    const left = Math.max(0, x), top = Math.max(0, y);
    const right = Math.min(this.width, x + this.imageWidth * this.zoom), bottom = Math.min(this.height, y + this.imageHeight * this.zoom);
    return [(left - x) / this.zoom, (top - y) / this.zoom, Math.max(0, right - left) / this.zoom, Math.max(0, bottom - top) / this.zoom, left, top, Math.max(0, right - left), Math.max(0, bottom - top)];
  }
}
export enum CropHandle { None, Move, Draw, North, East, South, West, NorthEast, SouthEast, SouthWest, NorthWest }
export function normalizedCrop(crop: MediaRect, iw: number, ih: number, aspect: number = 0, minSize: number = 16): MediaRect {
  iw = Math.max(1, iw); ih = Math.max(1, ih);
  const min = Math.min(Math.max(1, minSize), iw, ih);
  let width = crop.width, height = crop.height, x = crop.x, y = crop.y;
  if (!(width > 0 && height > 0)) {
    const ratio = aspect > 0 ? aspect : 1;
    width = Math.min(iw, ih * ratio); height = width / ratio;
    x = (iw - width) / 2; y = (ih - height) / 2;
  } else {
    width = clampMedia(width, min, iw); height = clampMedia(height, min, ih);
    if (aspect > 0) {
      const smallestWidth = Math.min(iw, ih * aspect, min * Math.max(1, aspect));
      width = Math.max(smallestWidth, width); height = width / aspect;
      const scale = Math.min(1, iw / width, ih / height); width *= scale; height *= scale;
    }
  }
  return new MediaRect(clampMedia(x, 0, iw - width), clampMedia(y, 0, ih - height), width, height);
}
export function cropHandle(crop: MediaRect, x: number, y: number, tolerance: number): CropHandle {
  const west = Math.abs(x - crop.x) <= tolerance, east = Math.abs(x - crop.x - crop.width) <= tolerance;
  const north = Math.abs(y - crop.y) <= tolerance, south = Math.abs(y - crop.y - crop.height) <= tolerance;
  if (north && west) return CropHandle.NorthWest;
  if (north && east) return CropHandle.NorthEast;
  if (south && west) return CropHandle.SouthWest;
  if (south && east) return CropHandle.SouthEast;
  if (north && x >= crop.x && x <= crop.x + crop.width) return CropHandle.North;
  if (south && x >= crop.x && x <= crop.x + crop.width) return CropHandle.South;
  if (west && y >= crop.y && y <= crop.y + crop.height) return CropHandle.West;
  if (east && y >= crop.y && y <= crop.y + crop.height) return CropHandle.East;
  return x >= crop.x && x <= crop.x + crop.width && y >= crop.y && y <= crop.y + crop.height ? CropHandle.Move : CropHandle.Draw;
}
export function moveCrop(crop: MediaRect, dx: number, dy: number, iw: number, ih: number): MediaRect {
  return new MediaRect(clampMedia(crop.x + dx, 0, iw - crop.width), clampMedia(crop.y + dy, 0, ih - crop.height), crop.width, crop.height);
}
export function resizeCrop(start: MediaRect, handle: CropHandle, dx: number, dy: number, iw: number, ih: number, aspect: number = 0, minSize: number = 16): MediaRect {
  if (handle === CropHandle.Move) return moveCrop(start, dx, dy, iw, ih);
  const west = handle === CropHandle.West || handle === CropHandle.NorthWest || handle === CropHandle.SouthWest;
  const north = handle === CropHandle.North || handle === CropHandle.NorthWest || handle === CropHandle.NorthEast;
  const horizontal = handle === CropHandle.West || handle === CropHandle.East;
  const vertical = handle === CropHandle.North || handle === CropHandle.South;
  let x = start.x, y = start.y, width = start.width, height = start.height;
  if (!vertical) width += west ? -dx : dx;
  if (!horizontal) height += north ? -dy : dy;
  if (aspect > 0) {
    if (vertical) width = height * aspect;
    else if (horizontal) height = width / aspect;
    else { width = Math.max(width, height * aspect); height = width / aspect; }
  }
  const normalized = normalizedCrop(new MediaRect(0, 0, width, height), iw, ih, aspect, minSize);
  width = normalized.width; height = normalized.height;
  const anchorX = west ? start.x + start.width : vertical ? start.x + start.width / 2 : start.x;
  const anchorY = north ? start.y + start.height : horizontal ? start.y + start.height / 2 : start.y;
  const maxWidth = west ? anchorX : vertical ? Math.min(anchorX, iw - anchorX) * 2 : iw - anchorX;
  const maxHeight = north ? anchorY : horizontal ? Math.min(anchorY, ih - anchorY) * 2 : ih - anchorY;
  if (aspect > 0) {
    const scale = Math.min(1, maxWidth / width, maxHeight / height); width *= scale; height *= scale;
  } else { width = Math.min(width, maxWidth); height = Math.min(height, maxHeight); }
  x = west ? anchorX - width : vertical ? anchorX - width / 2 : anchorX;
  y = north ? anchorY - height : horizontal ? anchorY - height / 2 : anchorY;
  return new MediaRect(x, y, width, height);
}
export function drawnCrop(ax: number, ay: number, bx: number, by: number, iw: number, ih: number, aspect: number = 0, minSize: number = 16): MediaRect {
  const crop = normalizedCrop(new MediaRect(0, 0, Math.max(1, Math.abs(bx - ax)), Math.max(1, Math.abs(by - ay))), iw, ih, aspect, minSize);
  crop.x = ax <= bx ? ax : ax - crop.width; crop.y = ay <= by ? ay : ay - crop.height;
  return normalizedCrop(crop, iw, ih, aspect, minSize);
}
export function mediaSlide(index: number, count: i32, loop: boolean = false): i32 {
  if (count < 0 || count > 256) throw new RangeError('Carousel count must be between 0 and 256');
  if (count === 0) return 0;
  const i = Math.round(Number.isFinite(index) ? index : 0);
  return loop ? ((i % count) + count) % count : Math.max(0, Math.min(count - 1, i));
}
