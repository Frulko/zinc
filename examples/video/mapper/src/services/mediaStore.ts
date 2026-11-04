// The media folder: what the editor lists, uploads and deletes. An upload arrives in a hidden file and takes its name at the end, so a layer never opens half a file.
import * as fs from 'zinc:fs';
import { isFileName } from 'zinc:mapping';
import { BodyStream } from 'zinc:net';
import { EXTENSIONS, isVideo } from 'zinc:video';

let folder = '';
let videos: i32 = 0;   // what the status card shows; counted when the folder changes, not at each frame

export function openMediaFolder(dir: string): void {
  folder = dir;
  fs.mkdir(folder, true);
  countVideos();
}

function countVideos(): void {
  videos = 0;
  for (const entry of fs.readDir(folder)) {
    if (!entry.name.startsWith('.') && isVideo(entry.name, EXTENSIONS)) videos++;
  }
}

export function videoCount(): i32 { return videos; }

export function mediaPath(name: string): string { return `${folder}/${name}`; }

export function mediaExists(name: string): boolean { return isFileName(name) && fs.exists(mediaPath(name)); }

/** [{"name":..,"bytes":..}] */
export function mediaListJson(): string {
  const files: string[] = [];
  for (const entry of fs.readDir(folder)) {
    if (entry.name.startsWith('.')) continue;
    const bytes = fs.stat(mediaPath(entry.name)).size;
    files.push(`{"name":${JSON.stringify(entry.name)},"bytes":${bytes}}`);
  }
  return `[${files.join(',')}]`;
}

export function deleteMedia(name: string): boolean {
  if (!isFileName(name)) return false;
  const removed = fs.remove(mediaPath(name));
  countVideos();
  return removed;
}

/** Writes the body to the folder under `name`. Rejects when the client leaves or the disk refuses; no partial file stays. */
export async function receiveMedia(name: string, body: BodyStream): Promise<void> {
  const coming = mediaPath(`.${name}.part`);
  fs.writeText(coming, '');
  try {
    await body.each((chunk: string) => { fs.appendText(coming, chunk); });
    fs.rename(coming, mediaPath(name));
    countVideos();
  } catch (e) {
    fs.remove(coming);
    throw e;
  }
}
