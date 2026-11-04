// Files of the person using the editor: pick or drop media, save templates. The same on a page (a file chooser, a download) and in a native client (a dialog, a file).
import * as dialog from 'zinc:system/dialog';
import * as fs from 'zinc:fs';
import { on } from 'zinc:system';
import { platform } from 'zinc:sys';

export async function pickMedia(): Promise<string[]> {
  const options = new dialog.OpenOptions();
  options.title = 'Media to send to the mapper';
  options.multiple = true;
  const paths = await dialog.open(options);
  return paths === null ? [] : paths as string[];
}

/** What a folder holds, on a page as the files in it, in a native client as its path (expandFolders). */
export async function pickFolder(): Promise<string[]> {
  const options = new dialog.OpenOptions();
  options.title = 'Folder of media to send to the mapper';
  options.directory = true;
  const paths = await dialog.open(options);
  return paths === null ? [] : paths as string[];
}

/** The files under the folders among these paths. A page only has files, with no real path. */
export function expandFolders(paths: string[]): string[] {
  if (platform() === 'web') return paths;
  const files: string[] = [];
  for (const path of paths) {
    if (fs.stat(path).isDirectory) {
      const inside = fs.readDir(path).filter((entry: any): boolean => !(entry.name as string).startsWith('.')).map((entry: any): string => `${path}/${entry.name}`);
      for (const file of expandFolders(inside)) files.push(file);
    } else files.push(path);
  }
  return files;
}

export async function pickScene(): Promise<string | null> {
  const options = new dialog.OpenOptions();
  options.title = 'Scene file to bring to the mapper';
  const paths = await dialog.open(options);
  return paths === null || (paths as string[]).length === 0 ? null : (paths as string[])[0];
}

export function onFileDropped(handler: (path: string) => void): void {
  on('drop', (args: string[]) => {
    if (args.length > 0) handler(args[0]);
  });
}

async function askWhere(name: string): Promise<string | null> {
  const options = new dialog.SaveOptions();
  options.title = `Save ${name}`;
  options.defaultPath = name;
  return await dialog.save(options);
}

export async function saveText(name: string, text: string): Promise<void> {
  const path = await askWhere(name);
  if (path !== null) fs.writeText(path as string, text);
}

export async function saveBytes(name: string, bytes: u8[]): Promise<void> {
  const path = await askWhere(name);
  if (path !== null) fs.writeBytes(path as string, bytes);
}

/** A name the mapper accepts: letters, digits, - _ . and no more than 64 characters. */
export function mediaName(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[.-]+/, '');
  return clean.slice(Math.max(0, clean.length - 64));
}
