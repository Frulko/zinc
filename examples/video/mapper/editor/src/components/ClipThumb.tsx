// The picture of a clip: its media's thumbnail, or what its source looks like.
import * as gfx from 'zinc:gfx';
import { Clip } from '../model/clips';
import { thumbnailOf } from '../services/thumbnails';

const EMPTY_TILE: u32 = 0x23272e, CHECK_DARK: u32 = 0x30343c, CHECK_LIGHT: u32 = 0xd8dce2;
const CHECKS: i32 = 8, RAMP: i32 = 12;

function colourOf(values: number[]): u32 {
  const channel = (k: i32): u32 => Math.round(Math.min(1, Math.max(0, values[k])) * 255) as u32;
  return values.length < 3 ? EMPTY_TILE : channel(0) * 65536 + channel(1) * 256 + channel(2);
}

/** The picture fills the tile, its middle kept. */
function drawCover(image: i32, x: i32, y: i32, w: i32, h: i32): void {
  const iw = gfx.imageWidth(image), ih = gfx.imageHeight(image);
  if (iw <= 0 || ih <= 0) return;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k, sh = h / k;
  gfx.drawImageRect(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function drawClip(clip: Clip, x: i32, y: i32, w: i32, h: i32): void {
  if (clip.media !== '') {
    const image = thumbnailOf(clip.media);
    gfx.rrect(x, y, w, h, 0, EMPTY_TILE, 255);
    if (image >= 0) drawCover(image, x, y, w, h);
  } else if (clip.source === 'pattern') {
    const size = w / CHECKS;
    for (let j: i32 = 0; j * size < h; j++) {
      for (let i: i32 = 0; i < CHECKS; i++) gfx.rrect(x + i * size, y + j * size, size + 1, Math.min(size + 1, h - j * size), 0, (i + j) % 2 === 0 ? CHECK_DARK : CHECK_LIGHT, 255);
    }
  } else if (clip.source === 'gradient') {
    for (let i: i32 = 0; i < RAMP; i++) {
      const level: u32 = Math.round(i * 255 / (RAMP - 1)) as u32;
      gfx.rrect(x + i * w / RAMP, y, w / RAMP + 1, h, 0, level * 65793, 255);
    }
  } else {
    gfx.rrect(x, y, w, h, 0, colourOf(clip.color), 255);
  }
}

export function ClipThumb(props: { clip: Clip; className: string }): i32 {
  return <Canvas className={props.className} onDraw={(x: i32, y: i32, w: i32, h: i32) => drawClip(props.clip, x, y, w, h)} />;
}
