// The output: every layer's warped surface, and the points of the selected one (corner pins, or the deformation grid).
import * as gfx from 'zinc:gfx';
import { ACCENT, CANVAS_BLACK, CURVE_STEPS, EDGE_BLEND, HIT_RADIUS, LINKED_POINT, MASK_HIDE, OTHER_CORNER, SELECTED_POINT } from '../constants';
import { Mat3, Point, apply, insidePolygon, invert, placementMatrix, placementTransform, warp } from '../model/geometry';
import { CornerRef, addLink, linkedCorners, removeLinksOf } from '../model/links';
import { EditablePoint, PointEditor } from '../model/pointEditor';
import { send } from '../services/link';
import { currentLayer, numbers, placementOf, saveShow, selectLayer, store, touch, word } from '../state';
import { PointCanvas } from './PointCanvas';

const LINK_RING = 3, OTHER_CORNER_RADIUS = 5, SELECTED_EDGE_WIDTH = 3;

export const outputEditor = new PointEditor();
export const MODE_CORNERS: i32 = 0, MODE_MESH: i32 = 1, MODE_EDGES: i32 = 2;
let mode: i32 = MODE_CORNERS;
let selectedEdge: i32 = -1;     // the side of the selected layer, in /edge's order: left, right, top, bottom
let linkFrom: CornerRef | null = null;   // while set, the next click on a corner of another layer links it to this one

export function setOutputMode(next: i32): void {
  mode = next;
  outputEditor.clear();
  selectedEdge = -1;
  linkFrom = null;
  touch();
}
export function outputMode(): i32 { return mode; }
export function currentEdge(): i32 { return selectedEdge; }
export function isLinking(): boolean { return linkFrom !== null; }

function selectedCorner(): CornerRef | null {
  const layer = currentLayer();
  if (layer === null || mode !== MODE_CORNERS || outputEditor.selection.length !== 1) return null;
  return { layer: word(layer, 'name'), corner: outputEditor.selection[0] };
}

export function selectedCornerIsLinked(): boolean {
  const corner = selectedCorner();
  return corner !== null && linkedCorners(store.links, corner).length > 0;
}

export function startLinking(): void {
  linkFrom = selectedCorner();
  touch();
}

export function unlinkSelectedCorner(): void {
  const corner = selectedCorner();
  if (corner === null) return;
  removeLinksOf(store.links, corner);
  saveShow();
  touch();
}

function layerNamed(name: string): i32 {
  return store.layers.findIndex((layer: any) => word(layer, 'name') === name) as i32;
}

/** Puts a corner of a layer at a point of the output. */
function moveCornerTo(index: i32, corner: i32, x: number, y: number): void {
  const layer = store.layers[index];
  const u = apply(invert(placementTransform(placementOf(layer), store.aspect)), x, y);
  const corners = numbers(layer, 'corners');
  corners[corner * 2] = u[0];
  corners[corner * 2 + 1] = u[1];
  send(`/layer/${index}/corner`, [corner, u[0], u[1]]);
}

function cornerOnOutput(layer: any, corner: i32): Point {
  const corners = numbers(layer, 'corners');
  return apply(placementTransform(placementOf(layer), store.aspect), corners[corner * 2], corners[corner * 2 + 1]);
}

/** A corner of a visible layer other than the selected one under (x, y), as [layer, corner]; null when none. */
function otherCornerAt(x: number, y: number, w: number, h: number): i32[] | null {
  for (let n: i32 = store.layers.length - 1; n >= 0; n--) {
    if (n === store.selected || numbers(store.layers[n], 'visible')[0] <= 0) continue;
    for (let corner: i32 = 0; corner < 4; corner++) {
      const p = cornerOnOutput(store.layers[n], corner);
      if (Math.hypot((p[0] - x) * w, (p[1] - y) * h) < HIT_RADIUS) return [n, corner];
    }
  }
  return null;
}

function linkToCornerAt(x: number, y: number, w: number, h: number): void {
  const from = linkFrom as CornerRef;
  linkFrom = null;
  outputEditor.pick(from.corner, false);   // the click went past the points: the selected one stays selected
  const hit = otherCornerAt(x, y, w, h);
  if (hit !== null) {
    const at = cornerOnOutput(store.layers[store.selected], from.corner);
    addLink(store.links, from, { layer: word(store.layers[hit[0]], 'name'), corner: hit[1] });
    moveCornerTo(hit[0], hit[1], at[0], at[1]);
    saveShow();
  }
  touch();
}

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
        for (const other of linkedCorners(store.links, { layer: word(layer, 'name'), corner: i })) {
          const index = layerNamed(other.layer);
          if (index >= 0) moveCornerTo(index, other.corner, nx, ny);
        }
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
  if (mode === MODE_EDGES) return [];
  return mode === MODE_MESH ? meshPoints(layer) : cornerPoints(layer);
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

/** The output line of one side of a layer, in /edge's order: left, right, top, bottom. `inward` is how far in from that side, in surface units. */
function sideLine(layer: any, side: i32, inward: number): Point[] {
  const at = surfaceToOutput(layer);
  const line: Point[] = [];
  for (let k: i32 = 0; k <= CURVE_STEPS; k++) {
    const along = k / CURVE_STEPS;
    if (side === 0) line.push(at(inward, along));
    else if (side === 1) line.push(at(1 - inward, along));
    else if (side === 2) line.push(at(along, inward));
    else line.push(at(along, 1 - inward));
  }
  return line;
}

function distanceToLine(line: Point[], x: number, y: number, w: number, h: number): number {
  let best = Infinity;
  for (let i: i32 = 1; i < line.length; i++) {
    const ax = line[i - 1][0] * w, ay = line[i - 1][1] * h, dx = line[i][0] * w - ax, dy = line[i][1] * h - ay;
    const lengthSquared = dx * dx + dy * dy;
    const along = lengthSquared > 0 ? Math.max(0, Math.min(1, ((x * w - ax) * dx + (y * h - ay) * dy) / lengthSquared)) : 0;
    best = Math.min(best, Math.hypot(ax + along * dx - x * w, ay + along * dy - y * h));
  }
  return best;
}

/** Selects the side nearest the click, on the selected layer first: two surfaces that share an edge both have one there. */
function selectEdgeAt(x: number, y: number, w: number, h: number): void {
  const order: i32[] = [];
  if (store.selected >= 0) order.push(store.selected);
  for (let n: i32 = store.layers.length - 1; n >= 0; n--) {
    if (n !== store.selected && numbers(store.layers[n], 'visible')[0] > 0) order.push(n);
  }
  for (const n of order) {
    let best: i32 = -1, nearest: number = HIT_RADIUS;
    for (let side: i32 = 0; side < 4; side++) {
      const distance = distanceToLine(sideLine(store.layers[n], side, 0), x, y, w, h);
      if (distance < nearest) {
        nearest = distance;
        best = side;
      }
    }
    if (best >= 0) {
      selectedEdge = best;
      if (n !== store.selected) selectLayer(n);
      touch();
      return;
    }
  }
  selectedEdge = -1;
  selectLayerAt(x, y);
  touch();
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

function drawSideMarks(layer: any, x: i32, y: i32, w: i32, h: i32): void {
  const edge = numbers(layer, 'edge'), inset = numbers(layer, 'inset');
  const onCanvas = (line: Point[]): Point[] => line.map((p: Point): Point => [x + p[0] * w, y + p[1] * h]);
  for (let side: i32 = 0; side < 4; side++) {
    if (inset[side] > 0) drawLine(onCanvas(sideLine(layer, side, inset[side])), MASK_HIDE);
    if (edge[side] > 0) drawLine(onCanvas(sideLine(layer, side, inset[side] + edge[side])), EDGE_BLEND);
  }
  if (selectedEdge >= 0) {
    const line = onCanvas(sideLine(layer, selectedEdge, 0));
    const flat: number[] = [];
    for (const p of line) flat.push(p[0], p[1]);
    gfx.stroke(flat, SELECTED_EDGE_WIDTH, SELECTED_POINT, 255, false);
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
  const shown = numbers(layer, 'visible')[0] > 0;   // a hidden layer that is selected shows its outline only: its points belong to something
  if (shown) gfx.polygon(fill, colour, Math.round(90 * numbers(layer, 'opacity')[0]) as i32);

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

/** The corners of the other layers: what can be linked to; green when they are linked. */
function drawOtherCorners(x: i32, y: i32, w: i32, h: i32): void {
  for (let n: i32 = 0; n < store.layers.length; n++) {
    const layer = store.layers[n];
    if (n === store.selected || numbers(layer, 'visible')[0] <= 0) continue;
    for (let corner: i32 = 0; corner < 4; corner++) {
      const p = cornerOnOutput(layer, corner);
      const linked = linkedCorners(store.links, { layer: word(layer, 'name'), corner }).length > 0;
      gfx.rrect(x + p[0] * w - OTHER_CORNER_RADIUS, y + p[1] * h - OTHER_CORNER_RADIUS, OTHER_CORNER_RADIUS * 2, OTHER_CORNER_RADIUS * 2, OTHER_CORNER_RADIUS, linked ? LINKED_POINT : OTHER_CORNER, 255);
    }
  }
}

function draw(x: i32, y: i32, w: i32, h: i32): void {
  gfx.rect(x, y, w, h, CANVAS_BLACK);
  for (let n: i32 = 0; n < store.layers.length; n++) {
    const layer = store.layers[n];
    if (numbers(layer, 'visible')[0] > 0 || n === store.selected) drawLayer(layer, n === store.selected, x, y, w, h);
  }
  const current = currentLayer();
  if (current !== null) drawSideMarks(current, x, y, w, h);
  if (mode === MODE_CORNERS) drawOtherCorners(x, y, w, h);
  const radius = mode === MODE_MESH ? 5 : 8;
  const all = outputPoints();
  for (let i: i32 = 0; i < all.length; i++) {
    const colour = outputEditor.isSelected(i) ? SELECTED_POINT : ACCENT;
    if (mode === MODE_CORNERS && current !== null && linkedCorners(store.links, { layer: word(current, 'name'), corner: i }).length > 0) {
      gfx.rrect(x + all[i].x * w - radius - LINK_RING, y + all[i].y * h - radius - LINK_RING, (radius + LINK_RING) * 2, (radius + LINK_RING) * 2, radius + LINK_RING, LINKED_POINT, 255);
    }
    gfx.rrect(x + all[i].x * w - radius, y + all[i].y * h - radius, radius * 2, radius * 2, radius, colour, 255);
  }
}

export function selectedPointText(): string {
  if (linkFrom !== null) return 'Click a corner of another layer: it joins this point and they move together.';
  if (mode === MODE_EDGES) return selectedEdge < 0 ? 'Click an edge of a layer to soften it.' : '';
  if (store.layers.length === 0) return 'An empty scene: Add makes a layer that covers the whole output.';
  const all = outputPoints();
  if (outputEditor.selection.length === 0) return 'Click a zone to select it. Click a point; the arrows move it by 1 pixel, with Shift by 10; Tab goes to the next one.';
  const first = all[outputEditor.selection[0]];
  if (first === undefined) return '';
  const many = outputEditor.selection.length > 1 ? `${outputEditor.selection.length} points, first at ` : '';
  return `${many}${(first.x * store.pixels[0]).toFixed(1)}, ${(first.y * store.pixels[1]).toFixed(1)} px`;
}

export function OutputCanvas(): i32 {
  return <PointCanvas className="w-full h-full" aspect={() => store.aspect} editor={outputEditor} points={() => linkFrom !== null ? [] : outputPoints()} pixelSize={() => store.pixels} draw={draw} onEmpty={(x: number, y: number, w: number, h: number) => {
    if (linkFrom !== null) linkToCornerAt(x, y, w, h);
    else if (mode === MODE_EDGES) selectEdgeAt(x, y, w, h);
    else selectLayerAt(x, y);
  }} />;
}
