// Export a stopped local Mapper project as a portable Cavalry project.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { footprint, mediaSize, Placement } from '../editor/src/model/geometry';
import { Mask } from '../editor/src/model/templates';
import { cavalryScene, CavalryZone } from '../editor/src/model/cavalryScene';

function numbers(layer: any, key: string, count: i32): number[] {
  const value = layer[key];
  if (!Array.isArray(value) || value.length < count || !(value as any[]).every((v: any): boolean => typeof v === 'number' && Number.isFinite(v as number))) throw new Error(`Invalid mapping ${key}`);
  return value as number[];
}
function text(layer: any, key: string): string {
  const value = layer[key];
  if (!Array.isArray(value) || value.length !== 1 || typeof value[0] !== 'string') throw new Error(`Invalid mapping ${key}`);
  return value[0] as string;
}
function regular(path: string): void {
  const stat = fs.lstat(path);
  if (!stat.isFile || stat.isSymlink) throw new Error(`Not a regular file: ${path}`);
}

function exportProject(source: string, destination: string, mediaDir: string, width: number, height: number, fps: number, duration: number): string {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 4 || height < 4 || width > 30000 || height > 30000) throw new Error('Output dimensions must be integers between 4 and 30000');
  regular(`${source}/mapping.json`);
  const original = fs.readText(`${source}/mapping.json`);
  const mapping: any = JSON.parse(original);
  if (mapping === null || !Array.isArray(mapping.layers)) throw new Error('Invalid mapping');
  const showPath = `${source}/show.json`;
  let showText = '';
  let surfaces: any = {};
  if (fs.exists(showPath)) {
    regular(showPath);
    showText = fs.readText(showPath);
    const show: any = JSON.parse(showText);
    if (show === null || typeof show !== 'object' || Array.isArray(show)) throw new Error('Invalid show');
    if (show.surfaces !== undefined) {
      if (show.surfaces === null || typeof show.surfaces !== 'object' || Array.isArray(show.surfaces)) throw new Error('Invalid surface dimensions');
      surfaces = show.surfaces;
    }
  }
  const zones: CavalryZone[] = [];
  for (const layer of mapping.layers as any[]) {
    if (layer === null) throw new Error('Invalid layer');
    const placement: Placement = { corners: numbers(layer, 'corners', 8), position: numbers(layer, 'position', 2), scale: numbers(layer, 'scale', 1)[0], rotation: numbers(layer, 'rotation', 1)[0], mesh: numbers(layer, 'mesh', 2) };
    const name = text(layer, 'name');
    const surface = surfaces[name];
    if (surface !== undefined && (!Array.isArray(surface) || surface.length !== 2 || !(surface as any[]).every((v: any): boolean => typeof v === 'number' && Number.isFinite(v as number) && v >= 0))) throw new Error(`Invalid surface dimensions: ${name}`);
    const size = mediaSize(footprint(placement, width / height, [width, height]), surface === undefined ? 0 : surface[0], surface === undefined ? 0 : surface[1]);
    const masks: Mask[] = [];
    for (let slot: i32 = 0; slot < 4; slot++) {
      if (layer[`mask/${slot}`] === undefined) continue;
      const values = numbers(layer, `mask/${slot}`, 0);
      if (values.length > 0) {
        if (values.length < 8 || values.length % 2 !== 0) throw new Error('Invalid mask');
        masks.push({ feather: values[0], hideInside: values[1] > 0, points: values.slice(2) });
      }
    }
    zones.push({ name, width: size[0], height: size[1], masks, media: text(layer, 'media') });
  }
  const names: string[] = [];
  if (fs.exists(mediaDir)) {
    for (const file of fs.readDir(mediaDir)) {
      if (file.name.startsWith('.')) continue;
      regular(`${mediaDir}/${file.name}`);
      names.push(file.name);
    }
  }
  // Scene generation validates media names and every referenced file before copying.
  const scene = cavalryScene(zones, names, fps, duration);
  if (!fs.stat(destination).isDirectory) throw new Error('Destination must be a directory');
  const output = fs.mkdtemp(`${destination}/mapper-cavalry-`);
  try {
    for (const dir of ['Assets', 'Assets/Palettes', 'Scenes', 'Renders', 'Autosave']) {
      if (!fs.mkdir(`${output}/${dir}`, true)) throw new Error(`Cannot create ${dir}`);
    }
    for (const name of names) {
      const from = `${mediaDir}/${name}`;
      regular(from);
      const before = fs.stat(from);
      fs.copyFile(from, `${output}/Assets/${name}`);
      const after = fs.stat(from);
      if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || fs.stat(`${output}/Assets/${name}`).size !== before.size) throw new Error(`Media changed during export: ${name}`);
    }
    if (fs.readText(`${source}/mapping.json`) !== original) throw new Error('Mapping changed during export; stop the player and retry');
    if ((fs.exists(showPath) ? fs.readText(showPath) : '') !== showText) throw new Error('Show changed during export; stop the player and retry');
    fs.writeText(`${output}/projectDescription.json`, JSON.stringify({ description: { assets: '@project/Assets', autoSave: '@project/Autosave', name: 'Mapper', palettes: '@project/Assets/Palettes', renders: '@project/Renders', scenes: '@project/Scenes' } }));
    fs.writeText(`${output}/Scenes/path-to-project`, '..');
    fs.writeText(`${output}/Scenes/Mapper.cv`, scene);
    fs.writeText(`${output}/mapper-mapping.json`, original);
    fs.writeText(`${output}/README.txt`, 'Open Scenes/Mapper.cv in Cavalry. Keep this entire folder together.\nOne flat composition per zone; active mapping media are linked, other media are in Assets.\nZone and mask outlines are non-rendering guides. Procedural sources, live inputs, cue sequences, audio, warps, feather and colour corrections are not converted.\nMedia starts at time zero at its native size; adjust its scale/fit in Cavalry.\n');
    return `${output}/Scenes/Mapper.cv`;
  } catch (error) {
    if (!fs.remove(output, true)) throw new Error(`Incomplete project remains at ${output}: ${error}`);
    throw error;
  }
}

const argv = sys.args();
if (argv.length !== 7) {
  console.error('Usage: zinc run examples/video/mapper/cavalry -- <project> <destination> <media> <output-width> <output-height> <fps> <seconds>');
  sys.exit(2);
}
try {
  console.log(`Wrote ${exportProject(argv[0], argv[1], argv[2], Number(argv[3]), Number(argv[4]), Number(argv[5]), Number(argv[6]))}`);
} catch (error) {
  console.error(`Cavalry project not exported: ${error}`);
  sys.exit(1);
}
