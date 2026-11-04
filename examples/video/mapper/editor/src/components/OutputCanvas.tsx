// The output: every layer's warped surface, and the points of the selected one (corner pins, or the deformation grid).
import * as gfx from 'zinc:gfx';
import { ACCENT, CANVAS_BLACK, CURVE_STEPS, SELECTED_POINT } from '../constants';
import { Mat3, Point, apply, insidePolygon, invert, placementMatrix, placementTransform, warp } from '../model/geometry';
import { EditablePoint, PointEditor } from '../model/pointEditor';
import { send } from '../services/link';
import { currentLayer, numbers, placementOf, selectLayer, store } from '../state';
import { PointCanvas } from './PointCanvas';

export const outputEditor = new PointEditor();
let meshMode = false;

export function setMeshMode(on: boolean): void {
  meshMode = on;
  outputEditor.clear();
}
export function inMeshMode(): boolean { return meshMode; }

function cornerPoints(layer: any): EditablePoint[] {
  const T = placementTransform(placementOf(layer), store.aspect), inverse = invert(T);
  const corners = numbers(layer, 'corners');
  const all: EditablePoint[] = [];
  for (let i: i32 = 0; i < 4; i++) {
    const q = apply(T, corners[i * 2], corners[i * 2 + 1]);
    all.push({
      x: q[0], y: q[1],
      set: (nx: number, ny: number) => {
        const u = apply(inverse, nx, ny);
        corners[i * 2] = u[0];
        corners[i * 2 + 1] = u[1];
        send(`/layer/${store.selected}/corner`, [i, u[0], u[1]]);
      },
    });
  }
  return all;
}

function meshPoints(layer: any): EditablePoint[] {
  const M = placementMatrix(placementOf(layer), store.aspect), inverse = invert(M);
  const mesh = numbers(layer, 'mesh');
  const cols: i32 = mesh[0] as i32, rows: i32 = mesh[1] as i32;
  const all: EditablePoint[] = [];
  for (let j: i32 = 0; j < rows; j++) {
    for (let i: i32 = 0; i < cols; i++) {
      const at = 2 + (j * cols + i) * 2;
      const q = apply(M, mesh[at], mesh[at + 1]);
      all.push({
        x: q[0], y: q[1],
        set: (nx: number, ny: number) => {
          const u = apply(inverse, nx, ny);
          mesh[at] = u[0];
          mesh[at + 1] = u[1];
          send(`/layer/${store.selected}/point`, [i, j, u[0], u[1]]);
        },
      });
    }
  }
  return all;
}

function outputPoints(): EditablePoint[] {
  const layer = currentLayer();
  if (layer === null) return [];
  return meshMode ? meshPoints(layer) : cornerPoints(layer);
}

function colourOf(values: number[]): u32 {
  const part = (v: number): u32 => Math.round(Math.min(1, Math.max(0, v)) * 255) as u32;
  return (part(values[0]) << 16) | (part(values[1]) << 8) | part(values[2]);
}

function drawLine(line: Point[], colour: u32): void {
  for (let i: i32 = 1; i < line.length; i++) gfx.line(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1], colour);
}

/** Where a point of the layer's surface lands on the output, 0..1. */
function surfaceToOutput(layer: any): (s: number, t: number) => Point {
  const placement = placementOf(layer);
  const M: Mat3 = placementMatrix(placement, store.aspect);
  return (s: number, t: number): Point => {
    const warped = warp(placement.mesh, s, t);
    return apply(M, warped[0], warped[1]);
  };
}

/** The warped border of a layer on the output: [x0, y0, x1, y1, ...]. */
function layerOutline(layer: any): number[] {
  const at = surfaceToOutput(layer);
  const outline: number[] = [];
  const addEdge = (along: (k: number) => Point): void => {
    for (let k: i32 = 0; k < CURVE_STEPS; k++) {
      const p = along(k / CURVE_STEPS);
      outline.push(p[0], p[1]);
    }
  };
  addEdge((k: number) => at(k, 0));
  addEdge((k: number) => at(1, k));
  addEdge((k: number) => at(1 - k, 1));
  addEdge((k: number) => at(0, 1 - k));
  return outline;
}

/** A click on a zone selects its layer, the top one where several overlap. */
function selectLayerAt(x: number, y: number): void {
  for (let n: i32 = store.layers.length - 1; n >= 0; n--) {
    const layer = store.layers[n];
    if (numbers(layer, 'visible')[0] > 0 && insidePolygon(layerOutline(layer), x, y)) {
      if (n !== store.selected) selectLayer(n);
      return;
    }
  }
}

function drawLayer(layer: any, isSelected: boolean, x: i32, y: i32, w: i32, h: i32): void {
  const placement = placementOf(layer);
  const toOutput = surfaceToOutput(layer);
  const at = (s: number, t: number): Point => {
    const q = toOutput(s, t);
    return [x + q[0] * w, y + q[1] * h];
  };
  const fill: number[] = layerOutline(layer);
  for (let i: i32 = 0; i < fill.length; i += 2) {
    fill[i] = x + fill[i] * w;
    fill[i + 1] = y + fill[i + 1] * h;
  }
  const colour = colourOf(numbers(layer, 'color'));
  gfx.polygon(fill, colour, Math.round(90 * numbers(layer, 'opacity')[0]) as i32);

  const stroke = isSelected ? ACCENT : colour;
  const cols: i32 = placement.mesh[0] as i32, rows: i32 = placement.mesh[1] as i32;
  for (let i: i32 = 0; i < cols; i++) {
    const line: Point[] = [];
    for (let k: i32 = 0; k <= CURVE_STEPS; k++) line.push(at(i / (cols - 1), k / CURVE_STEPS));
    drawLine(line, stroke);
  }
  for (let j: i32 = 0; j < rows; j++) {
    const line: Point[] = [];
    for (let k: i32 = 0; k <= CURVE_STEPS; k++) line.push(at(k / CURVE_STEPS, j / (rows - 1)));
    drawLine(line, stroke);
  }
}

function draw(x: i32, y: i32, w: i32, h: i32): void {
  gfx.rect(x, y, w, h, CANVAS_BLACK);
  for (let n: i32 = 0; n < store.layers.length; n++) {
    const layer = store.layers[n];
    if (numbers(layer, 'visible')[0] > 0) drawLayer(layer, n === store.selected, x, y, w, h);
  }
  const radius = meshMode ? 5 : 8;
  const all = outputPoints();
  for (let i: i32 = 0; i < all.length; i++) {
    const colour = outputEditor.isSelected(i) ? SELECTED_POINT : ACCENT;
    gfx.rrect(x + all[i].x * w - radius, y + all[i].y * h - radius, radius * 2, radius * 2, radius, colour, 255);
  }
}

export function selectedPointText(): string {
  if (store.layers.length === 0) return 'An empty scene: Add makes a layer that covers the whole output.';
  const all = outputPoints();
  if (outputEditor.selection.length === 0) return 'Click a zone to select it. Click a point; the arrows move it by 1 pixel, with Shift by 10; Tab goes to the next one.';
  const first = all[outputEditor.selection[0]];
  if (first === undefined) return '';
  const many = outputEditor.selection.length > 1 ? `${outputEditor.selection.length} points, first at ` : '';
  return `${many}${(first.x * store.pixels[0]).toFixed(1)}, ${(first.y * store.pixels[1]).toFixed(1)} px`;
}

export function OutputCanvas(): i32 {
  return <PointCanvas className="w-full aspect-video" editor={outputEditor} points={outputPoints} pixelSize={() => store.pixels} draw={draw} onEmpty={selectLayerAt} />;
}
