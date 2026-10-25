// ============================================================================
// services/apps.ts — The apps a computer sent to this device, read from the agent's files
// ============================================================================
// The agent keeps each app in <ZINC_HOME>/agent/apps/<name>/ (zinc device deploy; zinc dev --device keeps its program
// there once the session ends) with app.json beside it: its title, its icon (zinc.json app.icon, copied with the app),
// when it was sent (seconds since 1970) and whether zinc dev sent it (src/agent/server.cpp recordApp). An app sent by an
// agent older than that has no app.json: its folder's name and date stand in.

import * as fs from 'zinc:fs';
import { imageFromBytes } from 'zinc:gfx';

export class InstalledApp {
  /** The folder's name: what `zinc device apps` lists. */
  name: string = '';
  /** The name shown (zinc.json app.name). */
  title: string = '';
  directory: string = '';
  /** The icon's path, '' when it has none. */
  iconPath: string = '';
  sentSeconds: f64 = 0;
  isDev: boolean = false;
}

/** The apps, newest first. */
export function readInstalledApps(agentDirectory: string): InstalledApp[] {
  const apps: InstalledApp[] = [];
  const appsDirectory = agentDirectory + '/apps';
  let entries: fs.DirEntry[] = [];
  try {
    entries = fs.readDir(appsDirectory);
  } catch (e) {
    return apps;
  }
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    // .incoming-*: an install that has not finished
    if (!entry.isDirectory || entry.name.startsWith('.')) continue;
    const app = new InstalledApp();
    app.name = entry.name;
    app.title = entry.name;
    app.directory = appsDirectory + '/' + entry.name;
    try {
      app.sentSeconds = fs.stat(app.directory).mtimeMs / 1000;
      const meta: any = JSON.parse(fs.readText(app.directory + '/app.json'));
      if (typeof meta.title === 'string' && (meta.title as string) !== '') app.title = meta.title as string;
      if (typeof meta.icon === 'string' && (meta.icon as string) !== '') app.iconPath = app.directory + '/' + (meta.icon as string);
      if (typeof meta.sent === 'number') app.sentSeconds = meta.sent as f64;
      if (meta.dev === true) app.isDev = true;
    } catch (e) {
      // no app.json (an older agent) or a damaged one: the folder's name and date
    }
    apps.push(app);
  }
  apps.sort((a: InstalledApp, b: InstalledApp) => b.sentSeconds - a.sentSeconds);
  return apps;
}

/** What the list shows, to redraw only when it changed. */
export function appsSignature(apps: InstalledApp[]): string {
  let signature = '';
  for (let index = 0; index < apps.length; index++) {
    const app = apps[index];
    signature += app.name + '|' + app.title + '|' + app.iconPath + '|' + app.sentSeconds + '|' + app.isDev + ';';
  }
  return signature;
}

/** Removes the app from the device, as `zinc device uninstall` does: its folder and its logs. */
export function deleteInstalledApp(agentDirectory: string, app: InstalledApp): boolean {
  fs.remove(agentDirectory + '/logs/' + app.name + '.log', false);
  fs.remove(agentDirectory + '/logs/' + app.name + '.log.1', false);
  return fs.remove(app.directory, true);
}

// The icons, decoded once (PNG or JPEG; another format shows the default icon).
// ponytail: the images of deleted apps stay decoded until the player ends; a few kilobytes each
const iconPaths: string[] = [];
const iconImages: i32[] = [];

/** The image of the app's icon, -1 when it has none that can be read. */
export function appIconImage(app: InstalledApp): i32 {
  if (app.iconPath === '') return -1;
  const key = app.iconPath + '@' + app.sentSeconds;
  const index = iconPaths.indexOf(key);
  if (index >= 0) return iconImages[index];
  let image: i32 = -1;
  try {
    image = imageFromBytes(fs.readBytes(app.iconPath));
  } catch (e) {
    image = -1;
  }
  iconPaths.push(key);
  iconImages.push(image);
  return image;
}
