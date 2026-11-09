// The master's media come to this machine: pulled from its web server in slices, one file at a time, in a hidden file that takes its name at the end.
// A file is known by its size and the master's date for it; a cut copy goes on within the same master session. Files no longer offered stay.
import * as fs from 'zinc:fs';
import { isFileName } from 'zinc:mapping';
import { fetch, Headers } from 'zinc:net';
import { MediaFile, mediaPath, takeMedia } from './mediaStore';
import { mediaArrived, videoErrorMs } from './layerMedia';

const SLICE_BYTES = 1048576;       // what the frame loop may be held up by; 8 MiB at once stopped the picture for 200 ms
const BREATH_MS = 10;              // between two slices, for the frames: about 50 MB/s at most, a copy never competes with the show
const FILM_LATE_MS = 40;           // a film further than this from its place holds the copy
const FILM_WAIT_MS = 200;
const FILM_WAITS: i32 = 10;        // so at least 0.5 MB/s, whatever the film does
const SLICE_TIMEOUT_MS = 30000;
const RETRY_MS = 3000;
const STAMPS = '.fleet.json';   // hidden: never listed as a media

export interface CopyState { left: i32; name: string; done: number; total: number; problem: string }

let source = '', token = '';
let wanted: MediaFile[] = [];
let copying = false;
let owner: i32 = 0;
let generation: i32 = 0;
let sourceVersion: i32 = 0;
const partGeneration = new Map<string, i32>();
const partBytes = new Map<string, number>();
const verifiedGeneration = new Map<string, i32>();
let stamps = new Map<string, number>();
let stampsRead = false;
const state: CopyState = { left: 0, name: '', done: 0, total: 0, problem: '' };

export function copyState(): CopyState { return state; }

function readStamps(): void {
  if (stampsRead) return;
  stampsRead = true;
  if (!fs.exists(mediaPath(STAMPS))) return;
  try {
    for (const entry of JSON.parse(fs.readText(mediaPath(STAMPS))) as any[]) stamps.set(entry[0] as string, entry[1] as number);
  } catch (e) {
    console.error(`mapper: ${STAMPS} ignored: ${e}`);
  }
}

function writeStamps(): void {
  const list: any[] = [];
  stamps.forEach((stamp: number, name: string) => { list.push([name, stamp]); });
  fs.writeText(mediaPath(STAMPS), JSON.stringify(list));
}

/** A file already here at the right size and of no known date was copied by hand: it counts as the master's. */
function needed(file: MediaFile): boolean {
  if (!isFileName(file.name)) return false;
  // A hand-copied file is accepted for the first master; timestamps from another master cannot identify it.
  if (sourceVersion > 1 && verifiedGeneration.get(file.name) !== sourceVersion) return true;
  const path = mediaPath(file.name);
  if (!fs.exists(path) || fs.stat(path).size !== file.bytes) return true;
  if (stamps.has(file.name)) return stamps.get(file.name) !== file.stamp;
  stamps.set(file.name, file.stamp);
  writeStamps();
  return false;
}

function stillWanted(file: MediaFile): boolean {
  return wanted.some((other: MediaFile): boolean => other.name === file.name && other.stamp === file.stamp && other.bytes === file.bytes);
}

/** Between two slices. The film comes first: while it has fallen behind (a Pi reads it from the card the copy writes to) the copy waits, a bounded time so it always ends. */
async function breathe(): Promise<void> {
  let waited: i32 = 0;
  do {
    await new Promise<void>((go: () => void) => { setTimeout(go, waited === 0 ? BREATH_MS : FILM_WAIT_MS); });
  } while (videoErrorMs() > FILM_LATE_MS && ++waited < FILM_WAITS);
}

async function copy(file: MediaFile, started: i32): Promise<void> {
  const coming = mediaPath(`.${file.name}.part`), partKey = `.${file.name}.part`;
  // shortcut: partial files restart on a new session, until media hashes allow safe cross-session resume.
  if (partGeneration.get(file.name) !== started || partBytes.get(file.name) !== file.bytes || stamps.get(partKey) !== file.stamp || !fs.exists(coming)) {
    fs.writeText(coming, '');
    partGeneration.set(file.name, started);
    partBytes.set(file.name, file.bytes);
    stamps.set(partKey, file.stamp);
    writeStamps();
  }
  let done = fs.stat(coming).size;
  state.name = file.name;
  state.total = file.bytes;
  while (done < file.bytes) {
    if (started !== generation || !stillWanted(file)) return;
    state.done = done;
    const headers = new Headers();
    headers.set('x-zinc-token', token);
    headers.set('range', `bytes=${done}-${Math.min(done + SLICE_BYTES, file.bytes) - 1}`);
    const reply = await fetch(`${source}/media/${file.name}`, { headers, timeoutMs: SLICE_TIMEOUT_MS, saveTo: coming });
    if (started !== generation || !stillWanted(file)) return;
    if (reply.status !== 206) {
      fs.writeText(coming, '');
      throw new Error(`the master answers ${reply.status}`);
    }
    const now = fs.stat(coming).size;
    if (now > file.bytes) {
      fs.writeText(coming, '');
      throw new Error('the master sends too many bytes');
    }
    if (now === done) throw new Error('the master sends nothing');
    done = now;
    state.done = done;
    await breathe();
  }
  if (started !== generation || !stillWanted(file)) return;
  takeMedia(coming, file.name);
  stamps.delete(partKey);
  stamps.set(file.name, file.stamp);
  verifiedGeneration.set(file.name, sourceVersion);
  writeStamps();
  mediaArrived(file.name);
}

async function copyAll(): Promise<void> {
  if (copying) return;
  copying = true;
  try {
    for (;;) {
      const left = wanted.filter(needed);
      state.left = left.length;
      if (left.length === 0) break;
      const started = generation;
      try {
        await copy(left[0], started);
        if (started !== generation) continue;
        state.problem = '';
      } catch (e) {
        if (started !== generation) continue;
        state.problem = `${left[0].name}: ${e}`;
        await new Promise<void>((done: () => void) => { setTimeout(done, RETRY_MS); });
      }
    }
  } catch (e) {
    state.problem = `Media sync: ${e}`;
  } finally {
    state.name = '';
    state.done = 0;
    state.total = 0;
    copying = false;
  }
}

/** What the master has: copies what this machine lacks. No port: the master has no web server to take them from. */
export function copyMedia(host: string, port: i32, webToken: string, files: MediaFile[], master: i32): void {
  if (owner !== master) { owner = master; generation++; state.problem = ''; }
  if (port <= 0) { wanted = []; return; }
  readStamps();
  const nextSource = `http://${host}:${port}`;
  if (source !== nextSource || token !== webToken) sourceVersion++;
  source = nextSource;
  token = webToken;
  wanted = files;
  copyAll();
}

/** The master is gone: what is cut goes on when it is back. */
export function stopCopying(): void { generation++; wanted = []; }

/** A project activation invalidates in-flight writes and all metadata tied to the old media folder. */
export function resetMediaCopyCache(): void {
  stopCopying();
  stamps.clear();
  stampsRead = false;
  partGeneration.clear();
  partBytes.clear();
  verifiedGeneration.clear();
  sourceVersion++;
  state.left = 0; state.name = ''; state.done = 0; state.total = 0; state.problem = '';
}
