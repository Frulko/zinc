// The live preview, on the worker's thread: it plays the animation at the chosen speed and computes each picture of the preview window
// (the frame at x1, x2 and x4, and 3 x 3 copies to check that a tile is seamless) as a Scene. However many shapes a picture takes, the
// canvas never waits for it.
import { parentPort, MessageEvent } from 'zinc:worker';
import type { Scene, Shape } from 'zinc:system/window';
import type { PreviewInput, PreviewOutput } from './protocol';
import type { Sprite } from './sprite';
import { SPRITE_SIZE, TRANSPARENT, COLOR_PREVIEW_BG, COLOR_PREVIEW_VIEW, COLOR_PREVIEW_TEXT } from './constants';

const TOP = 44, LABEL_Y = 184, TILE_X = 300;

function shape(kind: string, x: number, y: number, w: number, h: number, r: number, color: u32, t: string): Shape {
  return { kind: kind, x: x, y: y, w: w, h: h, r: r, color: color, text: t };
}

/** The frame at x,y, `scale` screen points a pixel: one rect per run of a colour along a row. */
function drawFrame(out: Shape[], s: Sprite, frame: i32, x: i32, y: i32, scale: i32): void {
  const px = s.frames[frame].pixels;
  for (let row: i32 = 0; row < SPRITE_SIZE; row++) {
    let col: i32 = 0;
    while (col < SPRITE_SIZE) {
      const index = px[row * SPRITE_SIZE + col];
      let end = col + 1;
      while (end < SPRITE_SIZE && px[row * SPRITE_SIZE + end] === index) end++;
      if (index !== TRANSPARENT) out.push(shape('rect', x + col * scale, y + row * scale, (end - col) * scale, scale, 0, s.palette[index] as u32, ''));
      col = end;
    }
  }
}

function view(out: Shape[], s: Sprite, frame: i32, x: i32, scale: i32, label: string): void {
  const side = SPRITE_SIZE * scale;
  out.push(shape('rect', x - 4, TOP - 4, side + 8, side + 8, 0, COLOR_PREVIEW_VIEW, ''));
  drawFrame(out, s, frame, x, TOP, scale);
  out.push(shape('text', x, LABEL_Y, 0, 0, 1, COLOR_PREVIEW_TEXT, label));
}

export function previewScene(input: PreviewInput, frame: i32): Scene {
  const s = input.sprite, out: Shape[] = [];
  const state = input.playing ? `${input.fps} fps` : 'paused';
  out.push(shape('text', 16, 14, 0, 0, 2, COLOR_PREVIEW_TEXT, `Frame ${frame + 1}/${s.frames.length}  ${state}`));
  view(out, s, frame, 20, 1, 'x1');
  view(out, s, frame, 68, 2, 'x2');
  view(out, s, frame, 148, 4, 'x4');
  const tile = SPRITE_SIZE * 2;
  out.push(shape('rect', TILE_X - 4, TOP - 4, tile * 3 + 8, tile * 3 + 8, 0, COLOR_PREVIEW_VIEW, ''));
  for (let ty: i32 = 0; ty < 3; ty++) for (let tx: i32 = 0; tx < 3; tx++) drawFrame(out, s, frame, TILE_X + tx * tile, TOP + ty * tile, 2);
  out.push(shape('text', TILE_X, TOP + tile * 3 + 12, 0, 0, 1, COLOR_PREVIEW_TEXT, 'tiled 3 x 3'));
  return { background: COLOR_PREVIEW_BG, shapes: out };
}

const port = parentPort<PreviewOutput, PreviewInput>();
let input: PreviewInput | null = null;
let playhead: i32 = 0, timer: i32 = -1;

function post(): void {
  const i = input;
  if (i === null) return;
  const frame = i.playing ? playhead % i.sprite.frames.length : Math.min(i.frame, i.sprite.frames.length - 1) as i32;
  const scene = previewScene(i, frame);
  port.postMessage({ frame: frame, shapes: scene.shapes.length, scene: scene });
}
function tick(): void {
  timer = -1;
  const i = input;
  if (i === null || !i.playing) return;
  playhead = (playhead + 1) % i.sprite.frames.length;
  post();
  timer = setTimeout(tick, 1000 / i.fps) as i32;
}

port.onmessage = (e: MessageEvent<PreviewInput>) => {
  const i = e.data;
  input = i;
  if (!i.playing) playhead = i.frame;   // play resumes from the frame the canvas shows
  post();
  if (i.playing && timer < 0) timer = setTimeout(tick, 1000 / i.fps) as i32;
};
