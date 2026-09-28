// Project files: a `.zproj` folder holding project.json (the diagram and target settings), assets/ and the
// generated build/ (zinc.json + src/main.ts). Plain data only: the reactive editor model lives in model.ts.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

export const FORMAT = 'zincstudio/1';

export interface ParamFile { name: string; value: string }
export interface BoxFile { id: string; type: string; title: string; x: number; y: number; params: ParamFile[]; script: string }
/** A link from an output port to an input port. The diagram bars use the ids '@start' (output onStart) and '@end'
 *  (input onStopped). */
export interface LinkFile { from: string; out: string; to: string; inp: string }
export interface ProjectFile {
  format: string; name: string;
  /** Run target: sim | macos | preview | rpi1 | device (see runner.ts). */
  target: string;
  /** Screen size of the generated app (logical pixels). */
  width: i32; height: i32;
  /** ssh destination (user@host) for the device target. */
  device: string;
  boxes: BoxFile[]; links: LinkFile[];
}

export function emptyProject(name: string): ProjectFile {
  return { format: FORMAT, name: name, target: 'preview', width: 480, height: 320, device: '', boxes: [], links: [] };
}

// ---------------------------------------------------------------- paths
export function join(a: string, b: string): string { return a.endsWith('/') ? a + b : a + '/' + b; }
export function basename(p: string): string { const parts = trimSlash(p).split('/'); return parts[parts.length - 1]; }
export function dirname(p: string): string { const parts = trimSlash(p).split('/'); parts.pop(); return parts.length === 0 ? '.' : parts.join('/'); }
function trimSlash(p: string): string { return p.length > 1 && p.endsWith('/') ? p.slice(0, p.length - 1) : p; }
/** Absolute path (relative paths are taken from the current directory, $PWD). */
export function absolute(p: string): string {
  if (p.startsWith('/')) return p;
  const rel = p.startsWith('./') ? p.slice(2) : p;
  return rel === '.' || rel === '' ? sys.env('PWD') : join(sys.env('PWD'), rel);
}
/** Project name from its folder: hello-flow.zproj -> hello-flow. */
export function nameOf(dir: string): string { const b = basename(dir); return b.endsWith('.zproj') ? b.slice(0, b.length - 6) : b; }

// ---------------------------------------------------------------- JSON
/** Readable project.json: one box and one link per line, so diffs stay small. */
export function serialize(p: ProjectFile): string {
  const out: string[] = ['{'];
  out.push(`  "format": ${JSON.stringify(p.format)},`);
  out.push(`  "name": ${JSON.stringify(p.name)},`);
  out.push(`  "target": ${JSON.stringify(p.target)}, "width": ${p.width}, "height": ${p.height}, "device": ${JSON.stringify(p.device)},`);
  out.push('  "boxes": [');
  for (let i = 0; i < p.boxes.length; i++) out.push('    ' + JSON.stringify(p.boxes[i]) + (i + 1 < p.boxes.length ? ',' : ''));
  out.push('  ],');
  out.push('  "links": [');
  for (let i = 0; i < p.links.length; i++) out.push('    ' + JSON.stringify(p.links[i]) + (i + 1 < p.links.length ? ',' : ''));
  out.push('  ]');
  out.push('}');
  return out.join('\n') + '\n';
}

/** Parses project.json; missing optional fields get defaults. Throws on invalid JSON or a wrong shape. */
export function parse(text: string): ProjectFile {
  const p = JSON.parse(text) as ProjectFile;
  if (p.format !== FORMAT) throw new Error(`not a ZincStudio project (format "${p.format}")`);
  return p;
}

export function load(dir: string): ProjectFile { return parse(fs.readText(join(dir, 'project.json'))); }

export function save(dir: string, p: ProjectFile): void {
  fs.mkdir(dir);
  fs.mkdir(join(dir, 'assets'));
  fs.writeText(join(dir, 'project.json'), serialize(p));
}
