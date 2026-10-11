// zinc:loader (ZN-447, docs/plugins/loader.md): the default screens of the loader stage of zinc.json "loading" ("bar", "default"), as
// zinc:gfx functions (progress from 0 to 1, dt in seconds) => void. A project's own screen is a module whose default export has that type.
import { clear, rrect, width, height, image, imageWidth, imageHeight, drawImage } from 'zinc:gfx';

export type Screen = (progress: number, dt: number) => void;

function track(x: number, y: number, w: number, h: number, progress: number, color: u32): void {
  rrect(x, y, w, h, h / 2, color, 56);
  if (progress > 0) rrect(x, y, w * Math.min(1, progress), h, h / 2, color, 255);
}

/** A bar across the middle of `background`: the track in `color`, faint, and the bytes loaded in `color`. */
export function bar(background: u32, color: u32): Screen {
  return (progress: number, dt: number): void => {
    clear(background);
    const w = Math.min(width() * 0.6, 480), h: number = 6;
    track((width() - w) / 2, (height() - h) / 2, w, h, progress, color);
  };
}

/** The splash of zinc.json on `background`, placed as the engine splash places it (`fit` 0 contain, 1 cover, 2 center at `scale` texels a
 *  pixel), with a thin bar near the bottom: the engine splash hands over to it with no visible change. */
export function splash(background: u32, fit: i32, scale: number, color: u32): Screen {
  const img = image('.splash');
  return (progress: number, dt: number): void => {
    clear(background);
    if (img >= 0) {
      const iw = imageWidth(img), ih = imageHeight(img);
      const s = fit === 2 ? 1 / scale : fit === 1 ? Math.max(width() / iw, height() / ih) : Math.min(width() / iw, height() / ih);
      drawImage(img, (width() - iw * s) / 2, (height() - ih * s) / 2, iw * s, ih * s, 255, 0);
    }
    const w = Math.min(width() * 0.5, 320), h: number = 3;
    track((width() - w) / 2, height() - Math.max(24, height() * 0.08), w, h, progress, color);
  };
}
