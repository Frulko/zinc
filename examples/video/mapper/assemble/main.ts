// Assemble a stopped Mapper's working directory into a new, portable folder.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

interface SceneFile { name: string; text: string }
interface MediaFile { name: string; size: number; stamp: number }

function validName(name: string): boolean {
  return name.length > 0 && name.length <= 64 && /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/.test(name);
}

function neededMedia(mapping: any, show: any, names: string[]): void {
  if (mapping === null || mapping === undefined || !Array.isArray(mapping.layers) || show === null || show === undefined || !Array.isArray(show.columns)) throw new Error('Invalid mapping or show structure');
  for (const layer of mapping.layers as any[]) {
    if (layer === null) continue;
    const media = Array.isArray(layer.media) ? layer.media[0] : layer.media;
    if (typeof media === 'string' && media !== '' && !names.includes(media as string)) names.push(media as string);
  }
  for (const column of show.columns as any[]) {
    if (column === null || !Array.isArray(column.cells)) throw new Error('Invalid show column');
    for (const cell of column.cells as any[]) {
      if (cell !== null && typeof cell.media === 'string' && cell.media !== '' && !names.includes(cell.media as string)) names.push(cell.media as string);
    }
  }
}

function requireFile(path: string): void {
  const stat = fs.lstat(path);
  if (!stat.isFile || stat.isSymlink) throw new Error(`Not a regular file: ${path}`);
}

function readProjectFile(path: string): string {
  requireFile(path);
  return fs.readText(path);
}

/** Copies the source without overwriting anything. A failed copy removes only its own new folder. */
function assemble(source: string, destination: string, mediaDir: string): string {
  const mappingText = readProjectFile(`${source}/mapping.json`);
  const showText = readProjectFile(`${source}/show.json`);
  const required: string[] = [];
  neededMedia(JSON.parse(mappingText), JSON.parse(showText), required);
  const scenes: SceneFile[] = [];
  const sceneDir = `${source}/scenes`;
  if (fs.exists(sceneDir)) {
    if (!fs.stat(sceneDir).isDirectory) throw new Error(`Not a scene directory: ${sceneDir}`);
    for (const entry of fs.readDir(sceneDir)) {
      if (!entry.name.endsWith('.json')) continue;
      const name = entry.name.slice(0, entry.name.length - 5);
      if (!/^[A-Za-z0-9_-]{1,48}$/.test(name)) throw new Error(`Invalid scene name: ${entry.name}`);
      const text = readProjectFile(`${sceneDir}/${entry.name}`);
      const scene: any = JSON.parse(text);
      if (scene === null) throw new Error(`Invalid scene: ${entry.name}`);
      neededMedia(scene.mapping, scene.show, required);
      scenes.push({ name: entry.name, text });
    }
  }
  const files: MediaFile[] = [];
  if (fs.exists(mediaDir)) {
    if (!fs.stat(mediaDir).isDirectory) throw new Error(`Not a media directory: ${mediaDir}`);
    for (const entry of fs.readDir(mediaDir)) {
      if (entry.name.startsWith('.')) continue;
      if (!validName(entry.name) || !entry.isFile || entry.isSymlink) throw new Error(`Invalid media file: ${entry.name}`);
      const stat = fs.stat(`${mediaDir}/${entry.name}`);
      files.push({ name: entry.name, size: stat.size, stamp: stat.mtimeMs });
    }
  }
  for (const name of required) {
    if (!validName(name)) throw new Error(`Invalid referenced media name: ${name}`);
    if (!files.some((file: MediaFile): boolean => file.name === name)) throw new Error(`Missing media: ${name}`);
  }
  if (!fs.stat(destination).isDirectory) throw new Error(`Not a destination directory: ${destination}`);
  const output = fs.mkdtemp(`${destination}/mapper-project-`);
  try {
    if (!fs.mkdir(`${output}/scenes`) || !fs.mkdir(`${output}/media`)) throw new Error('Cannot create project folders');
    fs.writeText(`${output}/mapping.json`, mappingText);
    fs.writeText(`${output}/show.json`, showText);
    for (const scene of scenes) fs.writeText(`${output}/scenes/${scene.name}`, scene.text);
    for (const file of files) {
      const from = `${mediaDir}/${file.name}`;
      requireFile(from);
      fs.copyFile(from, `${output}/media/${file.name}`);
      const current = fs.stat(from), copied = fs.stat(`${output}/media/${file.name}`);
      if (current.size !== file.size || current.mtimeMs !== file.stamp || copied.size !== file.size) throw new Error(`Media changed during copy: ${file.name}`);
    }
    fs.writeText(`${output}/README.txt`, 'Mapper project: open it with mapper --project <this-folder>. Keep mapping.json, show.json, scenes/ and media/ together.\n');
    return output;
  } catch (e) {
    if (!fs.remove(output, true)) throw new Error(`Could not remove incomplete project ${output}: ${e}`);
    throw e;
  }
}

const argv = sys.args();
if (argv.length < 2 || argv.length > 3) {
  console.error('Usage: zinc run examples/video/mapper/assemble -- <source-folder> <destination-folder> [media-folder]');
  sys.exit(2);
}
try {
  const mediaDir = argv.length === 3 ? argv[2] : `${argv[0]}/media`;
  console.log(`Project assembled: ${assemble(argv[0], argv[1], mediaDir)}`);
} catch (e) {
  console.error(`Project not assembled: ${e}`);
  sys.exit(1);
}
