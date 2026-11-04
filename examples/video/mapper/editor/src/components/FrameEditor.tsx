// What a clip shows of its picture: what its fit does, and the picture with the part on screen, to drag. A drag changes nothing else: the panels stay, it is saved at its end.
import * as gfx from 'zinc:gfx';
import * as ui from 'zinc:ui';
import { Button } from 'zinc:ui/kit';
import { ACCENT, CANVAS_BLACK } from '../constants';
import { framedPart, zoneSize } from '../model/geometry';
import { Clip } from '../model/clips';
import { send } from '../services/link';
import { isPlaying, numbers, saveShow, store, touch } from '../state';
import { thumbnailOf } from '../services/thumbnails';
import { Row, ValueSlider } from './Field';

const MIN_ZOOM = 0.5, MAX_ZOOM = 4, DIM: i32 = 170, FRAME_WIDTH = 2;
const EPSILON = 0.005;

function fitText(fit: string): string {
  if (fit === 'stretch') return 'The whole picture, deformed to the zone.';
  if (fit === 'contain') return 'The whole picture, with bars where it does not reach.';
  if (fit === 'cover') return 'The zone is full; what exceeds is cut.';
  return fit === 'width' ? 'The width of the picture spans the zone.' : 'The height of the picture spans the zone.';
}

function percent(part: number): string { return `${Math.round(part * 100)}%`; }

/** What is cut and where the bars are. */
function outcome(part: number[]): string {
  const words: string[] = [];
  if (part[2] < 1 - EPSILON) words.push(`shows ${percent(part[2])} of its width`);
  if (part[3] < 1 - EPSILON) words.push(`shows ${percent(part[3])} of its height`);
  if (part[2] > 1 + EPSILON) words.push('bars left and right');
  if (part[3] > 1 + EPSILON) words.push('bars above and below');
  return words.length === 0 ? 'Nothing is cut.' : `It ${words.join(', ')}.`.replace('It bars', 'Bars');
}

function clamp(value: number, low: number, high: number): number { return Math.max(low, Math.min(high, value)); }

export function FrameEditor(props: { clip: Clip; layer: any }): i32 {
  const clip = props.clip;
  const zone = zoneSize(numbers(props.layer, 'corners'), store.aspect);
  const column = store.clipColumn, row = store.clipLayer;
  const image = (): i32 => thumbnailOf(clip.media);
  const ratio = (): number => {
    const known = image();
    return known < 0 ? 0 : gfx.imageWidth(known) / gfx.imageHeight(known) / (zone[0] / zone[1]);
  };
  const part = (): number[] => framedPart(clip.fit, ratio(), clip.frame);
  const follow = (): void => {
    if (isPlaying(column, row)) send(`/layer/${row}/frame`, clip.frame);
  };
  let pixelsPerPicture: number[] = [1, 1], lastX = 0, lastY = 0, pressed = false;
  const draw = (x: i32, y: i32, w: i32, h: i32): void => {
    gfx.rect(x, y, w, h, CANVAS_BLACK);
    const known = image();
    if (known < 0 || ratio() <= 0) return;
    const shown = part();
    const left = Math.min(0, shown[0]), top = Math.min(0, shown[1]);
    const spanW = Math.max(1, shown[0] + shown[2]) - left, spanH = Math.max(1, shown[1] + shown[3]) - top;
    const iw = gfx.imageWidth(known), ih = gfx.imageHeight(known);
    const k = Math.min(w / (spanW * iw), h / (spanH * ih));
    const sx = k * iw, sy = k * ih;   // a whole picture, in pixels
    pixelsPerPicture = [sx, sy];
    const ox = x + (w - spanW * sx) / 2 - left * sx, oy = y + (h - spanH * sy) / 2 - top * sy;
    gfx.drawImageRect(known, 0, 0, iw, ih, ox, oy, sx, sy);
    const fx = ox + shown[0] * sx, fy = oy + shown[1] * sy, fw = shown[2] * sx, fh = shown[3] * sy;
    // dims what stays out of the zone
    gfx.rrect(x, y, w, Math.max(0, fy - y), 0, CANVAS_BLACK, DIM);
    gfx.rrect(x, fy + fh, w, Math.max(0, y + h - fy - fh), 0, CANVAS_BLACK, DIM);
    gfx.rrect(x, fy, Math.max(0, fx - x), fh, 0, CANVAS_BLACK, DIM);
    gfx.rrect(fx + fw, fy, Math.max(0, x + w - fx - fw), fh, 0, CANVAS_BLACK, DIM);
    gfx.stroke([fx, fy, fx + fw, fy, fx + fw, fy + fh, fx, fy + fh], FRAME_WIDTH, ACCENT, 255, true);
  };
  const press = (e: ui.PointerEvent): void => {
    pressed = true;
    lastX = e.x;
    lastY = e.y;
  };
  const move = (e: ui.PointerEvent): void => {
    if (!pressed) return;
    const shown = part();
    // a slide of 1 moves the part by half of what it leaves; with the part as large as the picture there is nothing to slide
    if (Math.abs(1 - shown[2]) > EPSILON) clip.frame[0] = clamp(clip.frame[0] + (e.x - lastX) / pixelsPerPicture[0] / ((1 - shown[2]) * 0.5), -1, 1);
    if (Math.abs(1 - shown[3]) > EPSILON) clip.frame[1] = clamp(clip.frame[1] + (e.y - lastY) / pixelsPerPicture[1] / ((1 - shown[3]) * 0.5), -1, 1);
    lastX = e.x;
    lastY = e.y;
    follow();
  };
  const known = ratio() > 0;
  return <View className="gap-1 mt-1">
    <Text className="text-[11px] text-zinc-400">{fitText(clip.fit)}</Text>
    {known && <Text className="text-[11px] text-zinc-400">{outcome(part())}</Text>}
    {known && <Canvas className="w-full h-[150] cursor-move" grab="keep" onPointerDown={press} onPointerMove={move} onPointerUp={(e: ui.PointerEvent) => {
      pressed = false;
      saveShow();
      touch();
    }} onDraw={draw} />}
    {!known && <Text className="text-[11px] text-zinc-500">This device gives no picture of this media: the sliders still work.</Text>}
    {!known && <Row label="across"><ValueSlider min={-1} max={1} read={() => clip.frame[0]} write={(v: number) => { clip.frame[0] = v; follow(); saveShow(); }} /></Row>}
    {!known && <Row label="down"><ValueSlider min={-1} max={1} read={() => clip.frame[1]} write={(v: number) => { clip.frame[1] = v; follow(); saveShow(); }} /></Row>}
    <Row label="zoom"><ValueSlider min={MIN_ZOOM} max={MAX_ZOOM} read={() => clip.frame[2]} write={(v: number) => { clip.frame[2] = v; follow(); saveShow(); }} /></Row>
    <View className="items-start"><Button size="sm" variant="ghost" label="Centre" onClick={() => {
      clip.frame = [0, 0, 1];
      follow();
      saveShow();
      touch();
    }} /></View>
  </View>;
}
