// What a designer takes away: SVG templates to compose over in Premiere, Cavalry or After Effects. The output template shows the stage as the projector
// draws it; a layer's template is flat, what the media must look like before the mapper warps it.
import { Placement, Point, apply, placementMatrix, warp } from './geometry';

const CURVE_STEPS: i32 = 32;
const GRID_DIVISIONS: i32 = 8;

export interface Mask { feather: number; hideInside: boolean; points: number[] }
export interface TemplateLayer { name: string; placement: Placement; edge: number[]; masks: Mask[] }

function pathOf(line: Point[]): string {
  let d = '';
  for (let i: i32 = 0; i < line.length; i++) d += `${i > 0 ? 'L' : 'M'}${line[i][0].toFixed(2)} ${line[i][1].toFixed(2)}`;
  return d;
}

function escapeXml(text: string): string { return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

function header(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
}

/** The stage on the output: each layer's warped grid and its name. */
export function outputSvg(layers: TemplateLayer[], aspect: number, pixels: number[]): string {
  const width = pixels[0], height = pixels[1];
  const parts: string[] = [header(width, height)];
  for (const layer of layers) {
    const M = placementMatrix(layer.placement, aspect);
    const at = (s: number, t: number): Point => {
      const w = warp(layer.placement.mesh, s, t);
      const q = apply(M, w[0], w[1]);
      return [q[0] * width, q[1] * height];
    };
    parts.push(`<g fill="none" stroke="#ffb020" stroke-width="1">`);
    for (let n: i32 = 0; n <= GRID_DIVISIONS; n++) {
      const down: Point[] = [], across: Point[] = [];
      for (let k: i32 = 0; k <= CURVE_STEPS; k++) {
        down.push(at(n / GRID_DIVISIONS, k / CURVE_STEPS));
        across.push(at(k / CURVE_STEPS, n / GRID_DIVISIONS));
      }
      parts.push(`<path d="${pathOf(down)}"/><path d="${pathOf(across)}"/>`);
    }
    const label = at(0, 0);
    parts.push(`<text x="${label[0] + 6}" y="${label[1] + 18}" fill="#ffb020" stroke="none" font-family="sans-serif" font-size="14">${escapeXml(layer.name)}</text></g>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}

/** The media's own square at its recommended size: a grid, the edge blend zones and the masks. */
export function layerSvg(layer: TemplateLayer, size: Point): string {
  const width = size[0], height = size[1];
  const parts: string[] = [header(width, height)];
  parts.push(`<g fill="none" stroke="#888" stroke-width="1"><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}"/>`);
  for (let i: i32 = 1; i < GRID_DIVISIONS; i++) parts.push(`<path d="M${i * width / GRID_DIVISIONS} 0V${height}M0 ${i * height / GRID_DIVISIONS}H${width}"/>`);
  parts.push('</g><g fill="#508cff" fill-opacity="0.25">');
  const e = layer.edge;
  if (e[0] > 0) parts.push(`<rect width="${e[0] * width}" height="${height}"/>`);
  if (e[1] > 0) parts.push(`<rect x="${width - e[1] * width}" width="${e[1] * width}" height="${height}"/>`);
  if (e[2] > 0) parts.push(`<rect width="${width}" height="${e[2] * height}"/>`);
  if (e[3] > 0) parts.push(`<rect y="${height - e[3] * height}" width="${width}" height="${e[3] * height}"/>`);
  parts.push('</g>');
  for (const mask of layer.masks) {
    const line: Point[] = [];
    for (let i: i32 = 0; i + 1 < mask.points.length; i += 2) line.push([mask.points[i] * width, mask.points[i + 1] * height]);
    const colour = mask.hideInside ? '#ff3c3c' : '#3cff78';
    parts.push(`<path d="${pathOf(line)}Z" fill="${colour}" fill-opacity="0.25" stroke="${colour}"/>`);
  }
  parts.push('</svg>');
  return parts.join('\n');
}
