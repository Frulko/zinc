// Project files move together; device pairing, fleet and audio settings stay at startup's cwd.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';

let deviceRoot = '';
let projectRoot = '';
let mediaRoot = '';

export function initializePaths(): void {
  deviceRoot = fs.realpath(sys.cwd());
  projectRoot = deviceRoot;
  mediaRoot = `${projectRoot}/media`;
}
export function deviceFile(name: string): string { return `${deviceRoot}/${name}`; }
export function projectFile(name: string): string { return `${projectRoot}/${name}`; }
export function currentProjectPath(): string { return projectRoot; }
export function projectMediaPath(): string { return mediaRoot; }
export function setProjectPaths(root: string, media: string): void {
  projectRoot = root;
  mediaRoot = media;
}
