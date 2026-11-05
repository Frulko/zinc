// The media folder: what the editor lists, uploads and deletes. An upload arrives in a hidden file and takes its name at the end, so a layer never opens half a file.
import * as fs from 'zinc:fs';
import { isFileName } from 'zinc:mapping';
import { BodyStream } from 'zinc:net';
import { EXTENSIONS, isVideo } from 'zinc:video';

const THUMBNAILS = '.thumbs';   // hidden: never listed as a media
let folder = '';
let videos: i32 = 0, count: i32 = 0, bytes = 0;   // what the status card and the editor show; counted when the folder changes, not at each frame

export function openMediaFolder(dir: string): void {
  folder = dir;
  fs.mkdir(folder, true);
  fs.mkdir(`${folder}/${THUMBNAILS}`, true);
  countVideos();
}

function countVideos(): void {
  videos = 0;
  count = 0;
  bytes = 0;
  for (const entry of fs.readDir(folder)) {
    if (entry.name.startsWith('.')) continue;
    count++;
    bytes += fs.stat(mediaPath(entry.name)).size;
    if (isVideo(entry.name, EXTENSIONS)) videos++;
  }
}

export function videoCount(): i32 { return videos; }
export function mediaCount(): i32 { return count; }
export function mediaBytes(): number { return bytes; }

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

export interface MediaFile { name: string; bytes: number; stamp: number }

/** The files as another machine compares them: `stamp` changes when the file does. */
export function mediaFiles(): MediaFile[] {
  const files: MediaFile[] = [];
  for (const entry of fs.readDir(folder)) {
    if (entry.name.startsWith('.')) continue;
    const info = fs.stat(mediaPath(entry.name));
    files.push({ name: entry.name, bytes: info.size, stamp: info.mtimeMs });
  }
  return files;
}

/** Where a video's small picture goes. */
export function thumbnailPath(name: string): string { return `${folder}/${THUMBNAILS}/${name}.jpg`; }

function forgetThumbnail(name: string): void {
  if (fs.exists(thumbnailPath(name))) fs.remove(thumbnailPath(name));
}

export function deleteMedia(name: string): boolean {
  if (!isFileName(name)) return false;
  forgetThumbnail(name);
  const removed = fs.remove(mediaPath(name));
  countVideos();
  return removed;
}

/** A hidden file, whole, becomes the media `name`. */
export function takeMedia(coming: string, name: string): void {
  fs.rename(coming, mediaPath(name));
  forgetThumbnail(name);
  countVideos();
}

/** Writes the body to the folder under `name`. Rejects when the client leaves or the disk refuses; no partial file stays. */
export async function receiveMedia(name: string, body: BodyStream, onPart: (bytes: number) => void): Promise<void> {
  const coming = mediaPath(`.${name}.part`);
  fs.writeText(coming, '');
  try {
    await body.each((chunk: string) => {
      fs.appendText(coming, chunk);
      onPart(chunk.length);
    });
    takeMedia(coming, name);
  } catch (e) {
    fs.remove(coming);
    throw e;
  }
}
