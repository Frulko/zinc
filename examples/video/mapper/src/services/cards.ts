// Calibration cards: pictures to set up a projector and to pin surfaces. On the whole output they sit over everything, on a layer they replace its
// source and its media without changing the setup. Nothing here is saved: a restart shows the show.
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';

export const OUTPUT_TARGET: i32 = -1;   // the card covers the whole output, straight, one image pixel per pixel
const EVERY_LAYER: i32 = -2;
const CARDS: string[] = ['grid', 'focus', 'colours', 'white'];
const OFF = 'off';

const MAX_SIDE = 1024;       // a layer's card is drawn at the pixels the layer covers, up to this
const GRID_ROWS = 9;
const BLACK: u32 = 0x030303; // not 0: black and what is very near it are the overlay's key colour, the layers would show through
const WHITE: u32 = 0xffffff;
const GRID_LINE: u32 = 0x8a94a2;
const CORNERS: u32[] = [0xff3030, 0x30e050, 0x3070ff, 0xffd020];   // top left, top right, bottom right, bottom left: which way up it is
const BARS: u32[] = [0xffffff, 0xffff00, 0x00ffff, 0x00ff00, 0xff00ff, 0xff0000, 0x0000ff, BLACK];
const GREY_STEPS: i32 = 16;
const NEAR_LEVELS: i32[] = [3, 5, 10, 15, 25, 230, 240, 245, 250, 255];   // can the projector tell these apart from black and from white?
const FINE_SPACINGS: i32[] = [1, 2, 3, 4];
const STAR_SPOKES: i32 = 72;
const CIRCLE_STEPS: i32 = 96;
const TEXT_CELL = 6;         // width of a character of gfx.text at scale 1

let shown = OFF;
let images: i32[] = [];
let outputImage: i32 = -1;

export function cardKind(): string { return shown; }

function grey(level: i32): u32 { return (level << 16 | level << 8 | level) as u32; }

function drawCircle(cx: number, cy: number, radius: number, colour: u32): void {
  for (let i: i32 = 0; i < CIRCLE_STEPS; i++) {
    const a = i / CIRCLE_STEPS * Math.PI * 2, b = (i + 1) / CIRCLE_STEPS * Math.PI * 2;
    gfx.line(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, colour);
  }
}

function drawLabel(w: i32, h: i32, label: string): void {
  const scale: i32 = Math.max(2, Math.floor(h / 120)) as i32;
  const width = label.length * TEXT_CELL * scale, height = 10 * scale;
  gfx.rect(w / 2 - width / 2 - 4 * scale, h / 2 - height / 2 - 2 * scale, width + 8 * scale, height + 4 * scale, BLACK);
  gfx.text(w / 2 - width / 2, h / 2 - height / 2, label, WHITE, scale);
}

/** Square cells, so a stretched surface shows at once; a circle; each corner its colour. */
function paintGrid(w: i32, h: i32, label: string): void {
  gfx.clear(BLACK);
  const cell = h / GRID_ROWS;
  for (let k = 0; k * cell <= w / 2; k++) {
    gfx.line(w / 2 + k * cell, 0, w / 2 + k * cell, h, GRID_LINE);
    gfx.line(w / 2 - k * cell, 0, w / 2 - k * cell, h, GRID_LINE);
  }
  for (let k = 0; k * cell <= h / 2; k++) {
    gfx.line(0, h / 2 + k * cell, w, h / 2 + k * cell, GRID_LINE);
    gfx.line(0, h / 2 - k * cell, w, h / 2 - k * cell, GRID_LINE);
  }
  gfx.rect(w / 2 - 1, 0, 2, h, WHITE);
  gfx.rect(0, h / 2 - 1, w, 2, WHITE);
  gfx.rect(0, 0, w, 2, WHITE);
  gfx.rect(0, h - 2, w, 2, WHITE);
  gfx.rect(0, 0, 2, h, WHITE);
  gfx.rect(w - 2, 0, 2, h, WHITE);
  drawCircle(w / 2, h / 2, h * 0.45, WHITE);
  const corner = cell / 2;
  gfx.rect(0, 0, corner, corner, CORNERS[0]);
  gfx.rect(w - corner, 0, corner, corner, CORNERS[1]);
  gfx.rect(w - corner, h - corner, corner, corner, CORNERS[2]);
  gfx.rect(0, h - corner, corner, corner, CORNERS[3]);
  drawLabel(w, h, label);
}

/** Fine lines that melt into grey when the lens is off, a star that shows how far: turn the focus until they are crisp. */
function paintFocus(w: i32, h: i32): void {
  gfx.clear(BLACK);
  const cx = w / 2, cy = h / 2, radius = h * 0.42;
  for (let i: i32 = 0; i < STAR_SPOKES; i++) {
    const a = i / STAR_SPOKES * Math.PI * 2;
    gfx.line(cx, cy, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, WHITE);
  }
  const patch: i32 = Math.floor(h / 6) as i32;
  const corners: number[][] = [[0, 0], [w - patch, 0], [w - patch, h - patch], [0, h - patch]];
  for (const at of corners) {
    for (let band: i32 = 0; band < FINE_SPACINGS.length; band++) {
      const spacing: i32 = FINE_SPACINGS[band], top = at[1] + band * patch / FINE_SPACINGS.length, tall = patch / FINE_SPACINGS.length;
      for (let x: i32 = 0; x < patch; x += spacing * 2) gfx.rect(at[0] + x, top, spacing, tall, WHITE);
    }
  }
}

/** Colour bars, a grey ramp, and the shades near black and near white that a projector tends to lose. */
function paintColours(w: i32, h: i32): void {
  gfx.clear(BLACK);
  const barsTall = h * 0.6, rampTall = h * 0.2;
  for (let i: i32 = 0; i < BARS.length; i++) gfx.rect(i * w / BARS.length, 0, w / BARS.length + 1, barsTall, BARS[i]);
  for (let i: i32 = 0; i < GREY_STEPS; i++) gfx.rect(i * w / GREY_STEPS, barsTall, w / GREY_STEPS + 1, rampTall, grey(Math.round(i * 255 / (GREY_STEPS - 1)) as i32));
  for (let i: i32 = 0; i < NEAR_LEVELS.length; i++) gfx.rect(i * w / NEAR_LEVELS.length, barsTall + rampTall, w / NEAR_LEVELS.length + 1, h - barsTall - rampTall, grey(NEAR_LEVELS[i]));
}

function paintedCard(kind: string, w: i32, h: i32, label: string): i32 {
  const image = gfx.createImage(w, h);
  images.push(image);
  gfx.beginImage(image);
  if (kind === 'grid') paintGrid(w, h, label);
  else if (kind === 'focus') paintFocus(w, h);
  else if (kind === 'colours') paintColours(w, h);
  else gfx.clear(WHITE);
  gfx.endImage();
  return image;
}

/** The pixels a layer covers on the output, up to MAX_SIDE: the card's cells stay square on the surface. */
function layerCardSize(layer: i32): number[] {
  const c = JSON.parse(mapping.layerJson(layer)).corners as number[];
  const pixels = JSON.parse(mapping.info()).pixels as number[];
  const across = (a: i32, b: i32): number => Math.hypot((c[b * 2] - c[a * 2]) * pixels[0], (c[b * 2 + 1] - c[a * 2 + 1]) * pixels[1]);
  const w = Math.max(16, (across(0, 1) + across(3, 2)) / 2), h = Math.max(16, (across(0, 3) + across(1, 2)) / 2);
  const shrink = Math.min(1, MAX_SIDE / Math.max(w, h));
  return [Math.round(w * shrink), Math.round(h * shrink)];
}

function showOnLayer(kind: string, layer: i32): void {
  const size = layerCardSize(layer);
  const name = (JSON.parse(mapping.layerJson(layer)).name as string[])[0];
  mapping.set(layer, 'card', [paintedCard(kind, size[0] as i32, size[1] as i32, `${layer} ${name} ${size[0]}x${size[1]}`)]);
}

export function hideCards(): void {
  for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) mapping.set(layer, 'card', [-1]);
  for (const image of images) gfx.destroyImage(image);
  images = [];
  outputImage = -1;
  shown = OFF;
}

/** `kind` from CARDS or 'off'; `target` a layer, EVERY_LAYER or OUTPUT_TARGET. False when there is no such card or layer. */
export function showCard(kind: string, target: i32): boolean {
  if (kind !== OFF && CARDS.indexOf(kind) < 0) return false;
  if (target >= mapping.layerCount() || target < EVERY_LAYER) return false;
  hideCards();
  if (kind === OFF) return true;
  shown = kind;
  if (target === OUTPUT_TARGET) {
    const pixels = JSON.parse(mapping.info()).pixels as number[];
    outputImage = paintedCard(kind, gfx.width(), gfx.height(), `output ${pixels[0]}x${pixels[1]}`);
  } else if (target === EVERY_LAYER) {
    for (let layer: i32 = 0; layer < mapping.layerCount(); layer++) showOnLayer(kind, layer);
  } else {
    showOnLayer(kind, target);
  }
  return true;
}

/** In the frame, over the layers. */
export function drawOutputCard(): void {
  if (outputImage >= 0) gfx.drawImage(outputImage, 0, 0, gfx.width(), gfx.height(), 255, 0);
}
