// The selected layer's own square: crop, edge blend, polygon masks. Arrows step in pixels of what the layer covers on the output.
import * as gfx from 'zinc:gfx';
import { ACCENT, CROP_LINE, EDGE_BLEND, GRID_LINE, MASK_HIDE, MASK_SHOW, MAX_MASK_VALUES, SELECTED_POINT, SURFACE_BLACK } from '../constants';
import { footprint, insertMaskPoint, maskOutline, smoothHandles } from '../model/geometry';
import { EditablePoint, PointEditor } from '../model/pointEditor';
import { MASK_SLOTS, currentLayer, maskValues, numbers, placementOf, setLayer, store } from '../state';
import { PointCanvas } from './PointCanvas';

const GRID_DIVISIONS: i32 = 8;
const CROP_POINTS: i32 = 2;

const editor = new PointEditor();
let selectedMask: i32 = 0;

export function selectMask(slot: i32): void {
  selectedMask = slot;
  editor.clear();
}
export function currentMask(): i32 { return selectedMask; }

function surfacePoints(): EditablePoint[] {
  const layer = currentLayer();
  if (layer === null) return [];
  const crop = numbers(layer, 'crop');
  const all: EditablePoint[] = [];
  for (let k: i32 = 0; k < CROP_POINTS; k++) {
    all.push({
      x: crop[k * 2], y: crop[k * 2 + 1],
      set: (x: number, y: number) => {
        crop[k * 2] = x;
        crop[k * 2 + 1] = y;
        setLayer('crop', crop);
      },
    });
  }
  const mask = maskValues(layer, selectedMask);
  if (mask.length < 8) return all;
  for (let i: i32 = 2; i < mask.length; i += 2) {
    all.push({
      x: mask[i], y: mask[i + 1],
      set: (x: number, y: number) => {
        mask[i] = x;
        mask[i + 1] = y;
        setLayer(`mask/${selectedMask}`, mask);
      },
    });
  }
  const curve = curveValues(layer, selectedMask), count: i32 = ((mask.length - 2) / 2) as i32;
  for (let i: i32 = 0; i < count; i++) {
    const at = i * 4;
    if (at + 3 >= curve.length || isCorner(curve, at)) continue;
    for (const side of [0, 2]) {   // the two handles stay opposite, so the curve stays smooth through its point
      all.push({
        x: mask[2 + i * 2] + curve[at + side], y: mask[3 + i * 2] + curve[at + side + 1],
        set: (x: number, y: number) => {
          const dx = x - mask[2 + i * 2], dy = y - mask[3 + i * 2], other = 2 - side;
          curve[at + side] = dx;
          curve[at + side + 1] = dy;
          curve[at + other] = -dx;
          curve[at + other + 1] = -dy;
          setLayer(`maskcurve/${selectedMask}`, curve);
        },
      });
    }
  }
  return all;
}

function isCorner(curve: number[], at: i32): boolean { return curve[at] === 0 && curve[at + 1] === 0 && curve[at + 2] === 0 && curve[at + 3] === 0; }

/** Its handles, four numbers per point of the mask. */
function curveValues(layer: any, slot: i32): number[] {
  const count: i32 = ((maskValues(layer, slot).length - 2) / 2) as i32;
  const saved = layer[`maskcurve/${slot}`];
  const curve: number[] = saved === undefined || saved === null ? [] : saved as number[];
  while (curve.length < count * 4) curve.push(0);
  return curve;
}

/** The selected points of the mask, or all of them, become curve points or corners. */
export function curveChosenPoints(on: boolean): void {
  const layer = currentLayer();
  if (layer === null) return;
  const mask = maskValues(layer, selectedMask);
  if (mask.length < 8) return;
  const curve = curveValues(layer, selectedMask), points = mask.slice(2), count: i32 = (points.length / 2) as i32;
  const chosen = editor.selection.filter((index: i32) => index >= CROP_POINTS && index < CROP_POINTS + count);
  for (let i: i32 = 0; i < count; i++) {
    if (chosen.length > 0 && chosen.indexOf(CROP_POINTS + i) < 0) continue;
    const handles = on ? smoothHandles(points, i) : [0, 0, 0, 0];
    for (let k: i32 = 0; k < 4; k++) curve[i * 4 + k] = handles[k];
  }
  editor.clear();   // the handles come after the points: their places change
  setLayer(`maskcurve/${selectedMask}`, curve);
}

function addMaskPoint(x: number, y: number): void {
  const layer = currentLayer();
  if (layer === null) return;
  const mask = maskValues(layer, selectedMask);
  if (mask.length < 8 || mask.length >= MAX_MASK_VALUES) return;
  const curve = curveValues(layer, selectedMask);
  const at = insertMaskPoint(mask, x, y);
  curve.splice(at * 4, 0, 0, 0, 0, 0);
  editor.clear();
  setLayer(`mask/${selectedMask}`, mask);
  setLayer(`maskcurve/${selectedMask}`, curve);
}

/** Shift-click: takes the point out of the mask (the two crop points stay). */
function removeMaskPoint(index: i32): void {
  const layer = currentLayer();
  if (layer === null || index < CROP_POINTS) return;
  const mask = maskValues(layer, selectedMask);
  if (mask.length <= 8 || index - CROP_POINTS >= (mask.length - 2) / 2) return;   // a handle is not a point
  const curve = curveValues(layer, selectedMask);
  mask.splice(2 + (index - CROP_POINTS) * 2, 2);
  curve.splice((index - CROP_POINTS) * 4, 4);
  setLayer(`mask/${selectedMask}`, mask);
  setLayer(`maskcurve/${selectedMask}`, curve);
}

function draw(x: i32, y: i32, w: i32, h: i32): void {
  gfx.rect(x, y, w, h, SURFACE_BLACK);
  for (let i: i32 = 1; i < GRID_DIVISIONS; i++) {
    gfx.line(x + i * w / GRID_DIVISIONS, y, x + i * w / GRID_DIVISIONS, y + h, GRID_LINE);
    gfx.line(x, y + i * h / GRID_DIVISIONS, x + w, y + i * h / GRID_DIVISIONS, GRID_LINE);
  }
  const layer = currentLayer();
  if (layer === null) return;

  const edge = numbers(layer, 'edge');
  gfx.rrect(x, y, edge[0] * w, h, 0, EDGE_BLEND, 64);
  gfx.rrect(x + w - edge[1] * w, y, edge[1] * w, h, 0, EDGE_BLEND, 64);
  gfx.rrect(x, y, w, edge[2] * h, 0, EDGE_BLEND, 64);
  gfx.rrect(x, y + h - edge[3] * h, w, edge[3] * h, 0, EDGE_BLEND, 64);

  const crop = numbers(layer, 'crop');
  const left = x + crop[0] * w, top = y + crop[1] * h, right = x + crop[2] * w, bottom = y + crop[3] * h;
  gfx.line(left, top, right, top, CROP_LINE);
  gfx.line(right, top, right, bottom, CROP_LINE);
  gfx.line(right, bottom, left, bottom, CROP_LINE);
  gfx.line(left, bottom, left, top, CROP_LINE);

  for (const slot of MASK_SLOTS) {
    const mask = maskValues(layer, slot);
    if (mask.length < 8) continue;
    const curve = curveValues(layer, slot);
    const shape = maskOutline(mask.slice(2), curve);
    const outline: number[] = [];
    for (let i: i32 = 0; i + 1 < shape.length; i += 2) outline.push(x + shape[i] * w, y + shape[i + 1] * h);
    if (slot === selectedMask) {
      for (let i: i32 = 0; i * 4 + 3 < curve.length; i++) {
        if (isCorner(curve, i * 4)) continue;
        const px = x + mask[2 + i * 2] * w, py = y + mask[3 + i * 2] * h;
        gfx.line(px + curve[i * 4] * w, py + curve[i * 4 + 1] * h, px + curve[i * 4 + 2] * w, py + curve[i * 4 + 3] * h, CROP_LINE);
      }
    }
    gfx.polygon(outline, mask[1] > 0 ? MASK_HIDE : MASK_SHOW, 60);
    const stroke = slot === selectedMask ? ACCENT : CROP_LINE;
    for (let i: i32 = 0; i < outline.length; i += 2) {
      const next = (i + 2) % outline.length;
      gfx.line(outline[i], outline[i + 1], outline[next], outline[next + 1], stroke);
    }
  }
  const all = surfacePoints();
  for (let i: i32 = 0; i < all.length; i++) {
    const colour = editor.isSelected(i) ? SELECTED_POINT : ACCENT;
    gfx.rrect(x + all[i].x * w - 5, y + all[i].y * h - 5, 10, 10, 5, colour, 255);
  }
}

function layerPixels(): number[] {
  const layer = currentLayer();
  if (layer === null) return [1, 1];
  const covered = footprint(placementOf(layer), store.aspect, store.pixels);
  return [covered[0], covered[1]];
}

export function SurfaceCanvas(): i32 {
  return <PointCanvas className="w-full h-[360]" editor={editor} points={surfacePoints} pixelSize={layerPixels} draw={draw} onEmpty={addMaskPoint} onShiftPoint={removeMaskPoint} />;
}
