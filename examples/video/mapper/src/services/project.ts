// A project switch is synchronous: validate, save the old project, install, then publish its pointer.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as mapping from 'zinc:mapping';
import { call } from 'zinc:system';
import { sha256, toHex } from 'zinc:web';
import { hideCards } from './cards';
import { resetMediaCopyCache } from './fleetMedia';
import { startHistory } from './history';
import { flushLayerSave } from './layerCommands';
import { followLayerMedia, useMediaFolder, playbackPositions, restorePlayback } from './layerMedia';
import { mediaUploadsBusy, openMediaFolder } from './mediaStore';
import { currentProjectPath, deviceFile, initializePaths, projectFile, projectMediaPath, setProjectPaths } from './projectPaths';
import { installProjectShow, resumeShow, saveShow, showJson, validateShow } from './show';

export { currentProjectPath } from './projectPaths';
const POINTER = 'active-project.json';
enum ProjectPhase { Ready, Switching }
let phase = ProjectPhase.Ready;
let epoch = '';
export function projectEpoch(): string { return epoch; }
function transition(next: ProjectPhase): void {
  if (phase === next) throw new Error('Invalid project transition');
  phase = next;
}

function projectDocument(path: string): string {
  const info = fs.lstat(path);
  if (!info.isFile || info.isSymlink || info.size > 16777216) throw new Error(`Invalid project file: ${path}`);
  return fs.readText(path);
}

function requireMedia(name: string, root: string): void {
  if (!mapping.isFileName(name)) throw new Error(`Invalid media name: ${name}`);
  const info = fs.lstat(`${root}/${name}`);
  if (!info.isFile || info.isSymlink) throw new Error(`Missing regular media file: ${name}`);
}

/** Validation includes inactive columns: a project must be portable before it is opened. */
function validateFiles(setup: string, show: string, media: string): void {
  const parsed: any = JSON.parse(setup), columns: any = JSON.parse(show);
  if (parsed === null || !Array.isArray(parsed.layers)) throw new Error('Invalid mapping');
  const problem = validateShow(columns);
  if (problem !== '') throw new Error(problem);
  for (const layer of parsed.layers as any[]) {
    if (layer === null || typeof layer !== 'object') throw new Error('Invalid mapping layer');
    const name = Array.isArray(layer.media) ? layer.media[0] : layer.media;
    if (typeof name === 'string' && name !== '') requireMedia(name as string, media);
  }
  for (const column of columns.columns as any[]) {
    for (const clip of column.cells as any[]) {
      if (clip === null) continue;
      if (typeof clip !== 'object') throw new Error('Invalid clip');
      if (typeof clip.media === 'string' && clip.media !== '') requireMedia(clip.media as string, media);
    }
  }
}

function readProject(root: string, media: string): { setup: string; show: string } {
  const setup = projectDocument(`${root}/mapping.json`);
  const show = projectDocument(`${root}/show.json`);
  validateFiles(setup, show, media);
  if (!fs.stat(media).isDirectory || !fs.stat(`${root}/scenes`).isDirectory) throw new Error('Project needs media and scenes directories');
  for (const entry of fs.readDir(`${root}/scenes`)) {
    if (!entry.name.endsWith('.json')) continue;
    if (!/^[A-Za-z0-9_-]{1,48}\.json$/.test(entry.name)) throw new Error('Invalid scene filename');
    const scene: any = JSON.parse(projectDocument(`${root}/scenes/${entry.name}`));
    if (scene === null) throw new Error('Invalid scene');
    validateFiles(JSON.stringify(scene.mapping), JSON.stringify(scene.show), media);
  }
  return { setup, show };
}

/** Held for the process lifetime; a second mapper cannot change this device's active-project pointer. */
export function initializeProject(path: string, mediaOverride: string): void {
  initializePaths();
  const id = `mapper-${toHex(sha256(sys.utf8Encode(currentProjectPath())))}`;
  const lock = call('instance.lock', { id, argv: [] }) as { first: boolean };
  if (!lock.first) throw new Error('Another Mapper is already using this device folder');
  let root = path;
  let explicit = path !== '';
  if (root === '' && fs.exists(deviceFile(POINTER))) {
    const saved: any = JSON.parse(projectDocument(deviceFile(POINTER)));
    if (saved === null || typeof saved.path !== 'string') throw new Error('Invalid active project pointer');
    root = saved.path as string;
    explicit = true;
  }
  if (root === '') root = currentProjectPath();
  root = fs.realpath(root);
  const media = mediaOverride === '' ? `${root}/media` : fs.realpath(mediaOverride);
  if (explicit && (!fs.exists(`${root}/mapping.json`) || !fs.exists(`${root}/show.json`))) throw new Error(`Not a saved Mapper project: ${root}`);
  if (explicit) readProject(root, media);
  else if (fs.exists(`${root}/mapping.json`)) validateFiles(projectDocument(`${root}/mapping.json`), fs.exists(`${root}/show.json`) ? projectDocument(`${root}/show.json`) : '{"columns":[]}', media);
  setProjectPaths(root, media);
  epoch = toHex(sys.randomBytes(16));
}

export function saveProject(): void {
  if (phase !== ProjectPhase.Ready) throw new Error('Project switch is in progress');
  flushLayerSave();
  saveShow();
}

export function activateProject(path: string): void {
  if (phase !== ProjectPhase.Ready || mediaUploadsBusy()) throw new Error('Wait for the current project operation or upload to finish');
  const root = fs.realpath(path);
  if (!fs.stat(root).isDirectory) throw new Error('Project is not a folder');
  // Reopening the active folder must not reload the disk copy over pending edits.
  if (root === currentProjectPath()) { saveProject(); return; }
  const media = `${root}/media`;
  const documents = readProject(root, media);
  const setup = documents.setup, show = documents.show;
  // shortcut: the Android compositor resolves media relative to cwd; enable switches there after it accepts a media root.
  if (mapping.playsMedia() && root !== fs.realpath(sys.cwd())) throw new Error('This player cannot switch its native media folder');
  const nextEpoch = toHex(sys.randomBytes(16));
  saveProject();
  const previousRoot = currentProjectPath(), previousMedia = projectMediaPath();
  const previousSetup = mapping.toJson(), previousShow = showJson();
  const previousPlayback = playbackPositions();
  transition(ProjectPhase.Switching);
  try {
    // Native fromJson performs a dry parse before replacing any layer.
    if (!mapping.fromJson(setup)) throw new Error('Mapping was rejected by the compositor');
    setProjectPaths(root, media);
    openMediaFolder(media);
    useMediaFolder(media);
    installProjectShow(show);
    followLayerMedia();
    resumeShow();
    const coming = `${deviceFile(POINTER)}.part`;
    fs.writeText(coming, JSON.stringify({ path: root }));
    fs.rename(coming, deviceFile(POINTER));
    resetMediaCopyCache();
    epoch = nextEpoch;
  } catch (error) {
    setProjectPaths(previousRoot, previousMedia);
    mapping.fromJson(previousSetup);
    openMediaFolder(previousMedia);
    useMediaFolder(previousMedia);
    installProjectShow(previousShow);
    followLayerMedia();
    resumeShow();
    restorePlayback(previousPlayback);
    throw error;
  } finally {
    transition(ProjectPhase.Ready);
  }
  hideCards();
  startHistory();
}
