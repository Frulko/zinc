// Scenes: the layers and the columns under a name, in one file the person can also carry to another mapper. The media stay in the media folder.
// The scene on now is always saved by itself (mapping.json, show.json): a scene file is a copy to come back to.
import * as fs from 'zinc:fs';
import * as mapping from 'zinc:mapping';
import { PREVIOUS_SCENE, SCENES_DIR, SETUP_FILE } from '../constants';
import { hideCards } from './cards';
import { followLayerMedia } from './layerMedia';
import { replaceShow, resumeShow, showJson } from './show';

const EMPTY_SHOW = '{"columns":[],"active":-1}';

function scenePath(name: string): string { return `${SCENES_DIR}/${name}.json`; }

export function openScenes(): void { fs.mkdir(SCENES_DIR, true); }

/** Letters, digits, - and _: the name is a file name. */
export function isSceneName(name: string): boolean {
  return /^[A-Za-z0-9_-]{1,48}$/.test(name);
}

export function sceneListJson(): string {
  const names: string[] = [];
  for (const entry of fs.readDir(SCENES_DIR)) {
    if (entry.name.endsWith('.json')) names.push(entry.name.slice(0, entry.name.length - 5));
  }
  names.sort();
  return JSON.stringify(names);
}

function writeScene(name: string, json: string): void {
  const coming = `${scenePath(name)}.part`;
  fs.writeText(coming, json);
  fs.rename(coming, scenePath(name));   // a power cut leaves the old file or the new one
}

export function saveScene(name: string): void {
  writeScene(name, `{"mapping":${mapping.toJson()},"show":${showJson()}}`);
}

/** The file of a scene, '' when there is none. */
export function sceneJson(name: string): string {
  return fs.exists(scenePath(name)) ? fs.readText(scenePath(name)) : '';
}

function parsedScene(json: string): any {
  try {
    const scene = JSON.parse(json);
    return scene !== null && scene.mapping !== undefined && scene.show !== undefined && Array.isArray(scene.show.columns) ? scene : null;
  } catch (e) {
    return null;
  }
}

/** Keeps a scene file brought from elsewhere; false when it is not one. */
export function importScene(name: string, json: string): boolean {
  if (parsedScene(json) === null) return false;
  writeScene(name, json);
  return true;
}

/** Puts a whole setup on, and starts what it plays. */
export function restoreSetup(mappingJson: string, show: string): boolean {
  hideCards();
  if (!mapping.fromJson(mappingJson)) return false;
  if (replaceShow(show) !== '') return false;
  followLayerMedia();
  resumeShow();
  mapping.save(SETUP_FILE);
  return true;
}

function replaceScene(mappingJson: string, show: string): boolean {
  saveScene(PREVIOUS_SCENE);
  return restoreSetup(mappingJson, show);
}

export function loadScene(name: string): boolean {
  const scene = parsedScene(sceneJson(name));
  return scene !== null && replaceScene(JSON.stringify(scene.mapping), JSON.stringify(scene.show));
}

/** No layer and no column; the media stay. */
export function newScene(): void {
  replaceScene('{"version":1,"layers":[]}', EMPTY_SHOW);
}

export function deleteScene(name: string): boolean {
  return fs.exists(scenePath(name)) && fs.remove(scenePath(name));
}
