// Render one output frame from a saved mapping and optional decoded video frames.
import * as gfx from 'zinc:gfx';
import * as mapping from 'zinc:mapping';
import * as fs from 'zinc:fs';
import { args } from 'zinc:sys';

function fail(message: string): void {
  throw new Error(`mapper bake: ${message}`);
}

const argv = args();
const at = argv.indexOf('--mapping');
const mediaAt = argv.indexOf('--media');
const framesAt = argv.indexOf('--frames');
const layerAt = argv.indexOf('--video-layers');
const countAt = argv.indexOf('--count');
const startAt = argv.indexOf('--start');
for (const option of [at, mediaAt, framesAt, layerAt, countAt, startAt]) {
  if (option >= 0 && option + 1 >= argv.length) fail('an option is missing its value');
}
const framesDir = framesAt >= 0 ? argv[framesAt + 1] : '';
const videoLayers: i32[] = [];
if (layerAt >= 0) {
  for (const part of argv[layerAt + 1].split(',')) {
    const layer = parseInt(part);
    if (part === '' || !Number.isFinite(layer) || layer < 0 || videoLayers.includes(layer)) fail('invalid video layers');
    videoLayers.push(layer as i32);
  }
}
const frameCount = countAt >= 0 ? parseInt(argv[countAt + 1]) : 0;
if ((framesDir === '' && (videoLayers.length > 0 || countAt >= 0 || startAt >= 0)) || (framesDir !== '' && (videoLayers.length === 0 || frameCount < 1))) fail('invalid decoded-frame options');
if (at < 0 || at + 1 >= argv.length) fail('pass --mapping <mapping.json>');
const path = argv[at + 1];
const mediaDir = mediaAt >= 0 && mediaAt + 1 < argv.length ? argv[mediaAt + 1] : 'media';
let setup: any = null;
try { setup = JSON.parse(fs.readText(path)); } catch (e) { fail(`cannot read mapping: ${path}`); }
if (setup === null || !Array.isArray(setup.layers)) fail('mapping must contain layers');
for (const layer of videoLayers) if (layer >= (setup.layers as any[]).length) fail('video layer is outside the mapping');
// Reject before drawing: falling back to a test pattern would produce a plausible but wrong export.
for (let index: i32 = 0; index < (setup.layers as any[]).length; index++) {
  const layer = (setup.layers as any[])[index];
  if (layer === null) fail('invalid layer');
  const media: string = Array.isArray(layer.media) && typeof layer.media[0] === 'string' ? layer.media[0] as string : '';
  if (Array.isArray(layer.maskimage) && typeof layer.maskimage[0] === 'number' && (layer.maskimage[0] as number) >= 0) fail('runtime image masks cannot be restored from mapping.json');
  const source: string = Array.isArray(layer.source) && typeof layer.source[0] === 'string' ? layer.source[0] as string : 'pattern';
  if (media !== '') {
    if (!mapping.isFileName(media)) fail(`unsafe media name: ${media}`);
    const lower = media.toLowerCase();
    if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !(framesDir !== '' && videoLayers.includes(index))) fail(`animated or unsupported media: ${media}`);
    if (!fs.exists(`${mediaDir}/${media}`)) fail(`missing media: ${media}`);
  } else if (source === 'image') fail('an image layer has no media file');
}
if (!mapping.fromJson(JSON.stringify(setup))) fail('invalid mapping');
for (let i: i32 = 0; i < mapping.layerCount(); i++) {
  const layer = (setup.layers as any[])[i];
  const media: string = Array.isArray(layer.media) && typeof layer.media[0] === 'string' ? layer.media[0] as string : '';
  if (media === '' || videoLayers.includes(i)) continue;
  const image = gfx.imageFromBytes(fs.readBytes(`${mediaDir}/${media}`));
  if (image < 0) fail(`cannot decode image: ${media}`);
  if (!mapping.setImage(i, image)) fail(`cannot bind image: ${media}`);
}
let frameIndex: i32 = startAt >= 0 ? parseInt(argv[startAt + 1]) - 1 : 0;
if (framesDir !== '' && (frameIndex < 0 || frameIndex >= frameCount)) fail('frame index is outside the sequence');
const previousImages: i32[] = videoLayers.map((layer: i32): i32 => -1);
gfx.onFrame((dt: number) => {
  if (framesDir !== '' && frameIndex < frameCount) {
    frameIndex++;
    for (let i: i32 = 0; i < videoLayers.length; i++) {
      const layer = videoLayers[i];
      const framePath = `${framesDir}/${layer}/frame-${frameIndex}.png`;
      if (!fs.exists(framePath)) fail(`missing decoded frame: layer ${layer}, frame ${frameIndex}`);
      const image = gfx.imageFromBytes(fs.readBytes(framePath));
      if (image < 0) fail(`cannot decode frame: layer ${layer}, frame ${frameIndex}`);
      if (!mapping.setImage(layer, image)) fail(`cannot bind video frame: layer ${layer}`);
      if (previousImages[i] >= 0) gfx.destroyImage(previousImages[i]);
      previousImages[i] = image;
    }
  }
  gfx.clear(0);
});
