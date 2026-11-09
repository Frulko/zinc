// Immutable project snapshots: file access is scoped to one random, expiring transfer ticket.
import * as fs from 'zinc:fs';
import * as mapping from 'zinc:mapping';
import { toHex } from 'zinc:hash';
import { Worker, MessageEvent, ErrorEvent } from 'zinc:worker';
import { randomBytes } from 'zinc:sys';
import { fetch, Headers, Reply } from 'zinc:net';
import { mediaFiles, mediaPath } from './mediaStore';
import { sceneListJson } from './scenes';
import { deviceFile, projectFile, currentProjectPath } from './projectPaths';
import { showJson, validateShow } from './show';

const SLICE = 1048576;
const LEASE_MS = 3600000;
export enum RevisionPhase { Idle, Preparing, Ready, Failed, Cancelling, Verifying }
export interface RevisionFile { name: string; bytes: number; digest: string }
export interface RevisionManifest { ticket: string; files: RevisionFile[] }
export interface RevisionStatus { phase: RevisionPhase; done: number; total: number; problem: string; path: string; ticket: string; activePath: string }
interface Offered { manifest: RevisionManifest; path: string; expires: number; timer: i32 }
const offered: Offered[] = [];
enum SnapshotPhase { Idle, Preparing }
let snapshotPhase = SnapshotPhase.Idle;
function transitionSnapshot(next: SnapshotPhase): void {
  if (snapshotPhase === next) throw new Error('Invalid snapshot transition');
  snapshotPhase = next;
}

function safePath(name: string): boolean {
  if (name === 'mapping.json' || name === 'show.json') return true;
  const parts = name.split('/');
  return parts.length === 2 && (parts[0] === 'media' || parts[0] === 'scenes') && mapping.isFileName(parts[1]);
}

interface SnapshotOutput { digests: string[]; bytes: number[]; problem: string }
async function snapshotFiles(root: string, names: string[], sources: string[]): Promise<RevisionFile[]> {
  return new Promise<RevisionFile[]>((resolve: (files: RevisionFile[]) => void, reject: (error: Error) => void) => {
    const worker = new Worker<{ root: string; names: string[]; sources: string[] }, SnapshotOutput>(new URL('./fleetSnapshot.worker.ts', import.meta.url));
    worker.onerror = (event: ErrorEvent) => { worker.terminate(); reject(new Error(event.message)); };
    worker.onmessage = (event: MessageEvent<SnapshotOutput>) => {
      worker.terminate();
      if (event.data.problem !== '') { reject(new Error(event.data.problem)); return; }
      resolve(names.map((name: string, index: i32): RevisionFile => ({ name, bytes: event.data.bytes[index], digest: event.data.digests[index] })));
    };
    worker.postMessage({ root, names, sources });
  });
}

function ownsDirectory(path: string, marker: string, expected: string): boolean {
  try {
    const file = `${path}/${marker}`, info = fs.lstat(file);
    return info.isFile && !info.isSymlink && info.size === expected.length && fs.readText(file) === expected;
  } catch (e) { return false; }
}

const pendingRoots: string[] = [];
const REVISION_OWNER = 'zinc-mapper-revision-v1';

/** Keep the active project and one previous prepared revision; never clean a directory this app did not mark. */
export function cleanPreparedRevisions(keep: string): void {
  const parent = deviceFile('.mapper-revisions');
  if (!fs.exists(parent)) return;
  const candidates: string[] = [];
  for (const entry of fs.readDir(parent)) {
    if (!entry.isDirectory || entry.isSymlink || !/^revision-[A-Za-z0-9]+$/.test(entry.name)) continue;
    const path = `${fs.realpath(parent)}/${entry.name}`;
    if (path === currentProjectPath() || path === keep || pendingRoots.includes(path)) continue;
    if (!ownsDirectory(path, '.mapper-revision-owner', REVISION_OWNER)) continue;
    if (!fs.exists(`${path}/revision.json`)) {
      if (Date.now() - fs.stat(path).mtimeMs > LEASE_MS) discardPrepared(path);
    } else candidates.push(path);
  }
  candidates.sort((a: string, b: string): number => fs.stat(b).mtimeMs - fs.stat(a).mtimeMs);
  for (let i: i32 = 1; i < candidates.length; i++) discardPrepared(candidates[i]);
}

function discardPrepared(root: string): void {
  if (root === '' || root === currentProjectPath()) return;
  const parent = `${fs.realpath(deviceFile('.mapper-revisions'))}/revision-`;
  if (!root.startsWith(parent) || fs.lstat(root).isSymlink) throw new Error('Invalid prepared project path');
  if (!fs.remove(root, true)) throw new Error(`Cannot remove unused prepared project: ${root}`);
}

/** Copy first: editing or replacing a source file cannot change a transfer in progress. */
export async function offerRevision(): Promise<RevisionManifest> {
  if (snapshotPhase !== SnapshotPhase.Idle) throw new Error('Another project snapshot is being prepared');
  for (let i: i32 = offered.length - 1; i >= 0; i--) {
    if (offered[i].expires > Date.now()) continue;
    clearTimeout(offered[i].timer);
    fs.remove(offered[i].path, true);
    offered.splice(i, 1);
  }
  if (offered.length >= 4) throw new Error('Four transfers are already prepared; wait for their expiry');
  const offers = deviceFile('.mapper-offers');
  if (!fs.mkdir(offers, true)) throw new Error('Cannot create snapshot folder');
  for (const entry of fs.readDir(offers)) {
    if (entry.isDirectory && !entry.isSymlink && /^offer-[A-Za-z0-9]+$/.test(entry.name)) {
      const path = `${offers}/${entry.name}`;
      if (ownsDirectory(path, '.mapper-offer-owner', 'zinc-mapper-offer-v1') && Date.now() - fs.stat(path).mtimeMs > LEASE_MS) fs.remove(path, true);
    }
  }
  transitionSnapshot(SnapshotPhase.Preparing);
  let root = '';
  try {
    root = fs.mkdtemp(`${offers}/offer-`);
    fs.writeText(`${root}/.mapper-offer-owner`, 'zinc-mapper-offer-v1');
    if (!fs.mkdir(`${root}/media`) || !fs.mkdir(`${root}/scenes`)) throw new Error('Cannot create snapshot folders');
    const mappingText = mapping.toJson(), showText = showJson();
    const media = mediaFiles(), mediaVersion = JSON.stringify(media);
    const scenes = JSON.parse(sceneListJson()) as string[];
    let metadataBytes = mappingText.length + showText.length;
    if (metadataBytes > 33554432) throw new Error('Project metadata exceeds 32 MiB');
    if (media.length + scenes.length > 4094) throw new Error('Too many project files');
    fs.writeText(`${root}/mapping.json`, mappingText);
    fs.writeText(`${root}/show.json`, showText);
    const names: string[] = ['mapping.json', 'show.json'];
    const sources: string[] = ['', ''];
    for (const file of media) {
      if (file.bytes > 2147483647) throw new Error(`Media exceeds 2 GiB: ${file.name}`);
      if (!mapping.isFileName(file.name) || fs.lstat(mediaPath(file.name)).isSymlink || !fs.stat(mediaPath(file.name)).isFile) throw new Error(`Invalid media name: ${file.name}`);
      sources.push(fs.realpath(mediaPath(file.name)));
      names.push(`media/${file.name}`);
    }
    for (const name of scenes) {
      const path = projectFile(`scenes/${name}.json`), info = fs.lstat(path);
      metadataBytes += info.size;
      if (info.isSymlink || !info.isFile || info.size > 16777216 || metadataBytes > 33554432) throw new Error('Invalid scene or project metadata exceeds 32 MiB');
      names.push(`scenes/${name}.json`);
      sources.push(fs.realpath(path));
    }
    const manifest: RevisionManifest = { ticket: toHex(randomBytes(24)), files: await snapshotFiles(root, names, sources) };
    if (mapping.toJson() !== mappingText || showJson() !== showText || JSON.stringify(mediaFiles()) !== mediaVersion) throw new Error('Project changed while preparing; prepare again');
    const timer = setTimeout(() => { releaseRevision(manifest.ticket); }, LEASE_MS);
    offered.push({ manifest, path: root, expires: Date.now() + LEASE_MS, timer });
    return manifest;
  } catch (e) {
    if (root !== '') fs.remove(root, true);
    throw e;
  } finally {
    transitionSnapshot(SnapshotPhase.Idle);
  }
}

export function releaseRevision(ticket: string): void {
  for (let i: i32 = offered.length - 1; i >= 0; i--) {
    if (offered[i].manifest.ticket !== ticket) continue;
    clearTimeout(offered[i].timer);
    fs.remove(offered[i].path, true);
    offered.splice(i, 1);
  }
}

/** This endpoint needs only its ticket, never the editor credential; the ticket permits reads of this snapshot only. */
export function revisionFileReply(path: string): Reply {
  const rest = path.slice('/revision-file/'.length), slash = rest.indexOf('/');
  const ticket = rest.slice(0, slash), name = rest.slice(slash + 1);
  for (const item of offered) {
    if (item.manifest.ticket !== ticket || item.expires <= Date.now() || !item.manifest.files.some((file: RevisionFile): boolean => file.name === name)) continue;
    return { status: 200, body: '', contentType: 'application/octet-stream', file: `${item.path}/${name}` };
  }
  return { status: 404, body: 'Transfer expired or unknown file', contentType: 'text/plain' };
}

function validateReferences(root: string, setup: any, show: any): void {
  if (setup === null || !Array.isArray(setup.layers) || validateShow(show) !== '') throw new Error('Invalid project');
  const required: string[] = [];
  for (const layer of setup.layers as any[]) {
    if (layer === null) throw new Error('Invalid layer');
    const name = Array.isArray(layer.media) ? layer.media[0] : layer.media;
    if (typeof name === 'string' && name !== '') required.push(name as string);
  }
  for (const column of show.columns as any[]) for (const cell of column.cells as any[]) {
    if (cell !== null && cell !== undefined && typeof cell.media === 'string' && cell.media !== '') required.push(cell.media as string);
  }
  for (const name of required) if (!mapping.isFileName(name) || !fs.exists(`${root}/media/${name}`)) throw new Error(`Missing media: ${name}`);
}

export class RevisionStage {
  readonly status: RevisionStatus = { phase: RevisionPhase.Idle, done: 0, total: 0, problem: '', path: '', ticket: '', activePath: '' };
  private generation: i32 = 0;
  private transition(next: RevisionPhase): void {
    const phase = this.status.phase;
    if (!((next === RevisionPhase.Preparing && (phase === RevisionPhase.Idle || phase === RevisionPhase.Ready || phase === RevisionPhase.Failed)) ||
      (phase === RevisionPhase.Preparing && (next === RevisionPhase.Ready || next === RevisionPhase.Failed || next === RevisionPhase.Cancelling)) ||
      ((phase === RevisionPhase.Cancelling || phase === RevisionPhase.Ready) && next === RevisionPhase.Idle) ||
      (phase === RevisionPhase.Ready && next === RevisionPhase.Verifying) ||
      (phase === RevisionPhase.Verifying && (next === RevisionPhase.Ready || next === RevisionPhase.Cancelling)))) throw new Error('Invalid revision transition');
    this.status.phase = next;
  }
  async verifiedPath(ticket: string, current: () => boolean): Promise<string> {
    if (this.status.phase !== RevisionPhase.Ready || ticket !== this.status.ticket) throw new Error('No matching verified project is ready');
    const root = this.status.path, started = this.generation;
    this.transition(RevisionPhase.Verifying);
    pendingRoots.push(root);
    try {
      const manifest = JSON.parse(fs.readText(`${root}/revision.json`));
      const files = manifest.files as RevisionFile[];
      for (const file of files) if (!safePath(file.name)) throw new Error('Invalid prepared file');
      const checked = await snapshotFiles(root, files.map((file: RevisionFile): string => file.name), files.map((file: RevisionFile): string => ''));
      for (let i: i32 = 0; i < files.length; i++) if (checked[i].digest !== files[i].digest || checked[i].bytes !== files[i].bytes) throw new Error(`Prepared file changed: ${files[i].name}`);
      if (started !== this.generation || !current()) throw new Error('Activation cancelled or disconnected');
      return root;
    } finally {
      const pending = pendingRoots.indexOf(root);
      if (pending >= 0) pendingRoots.splice(pending, 1);
      if (this.status.phase === RevisionPhase.Cancelling) {
        try { discardPrepared(root); } catch (e) { this.status.problem = `${e}`; }
        this.status.path = '';
        this.transition(RevisionPhase.Idle);
      } else this.transition(RevisionPhase.Ready);
    }
  }
  cancel(): void {
    if (this.status.phase === RevisionPhase.Ready) {
      try {
        discardPrepared(this.status.path);
        this.status.path = '';
        this.transition(RevisionPhase.Idle);
      } catch (e) { this.status.problem = `${e}`; }
      return;
    }
    if (this.status.phase !== RevisionPhase.Preparing && this.status.phase !== RevisionPhase.Verifying) return;
    this.generation++;
    this.transition(RevisionPhase.Cancelling);
  }
  async prepare(host: string, port: i32, manifest: RevisionManifest, current: () => boolean): Promise<void> {
    if (this.status.phase === RevisionPhase.Preparing || this.status.phase === RevisionPhase.Cancelling || this.status.phase === RevisionPhase.Verifying) return;
    this.transition(RevisionPhase.Preparing);
    const started = ++this.generation;
    const state = this.status;
    const previousPath = state.path;
    state.ticket = '';
    state.done = 0; state.total = 0; state.problem = ''; state.path = '';
    let root = '';
    try {
      discardPrepared(previousPath);
      cleanPreparedRevisions('');
      if (manifest === null || manifest === undefined || typeof manifest !== 'object') throw new Error('Invalid transfer manifest');
      state.ticket = manifest.ticket;
      if (port <= 0 || port > 65535 || !/^[A-Za-z0-9.:-]+$/.test(host) || !/^[a-f0-9]{48}$/.test(manifest.ticket) || !Array.isArray(manifest.files) || manifest.files.length > 4096) throw new Error('Invalid transfer manifest');
      const names: string[] = [];
      let metadataBytes = 0;
      for (const file of manifest.files) {
        if (!safePath(file.name) || names.includes(file.name) || !Number.isInteger(file.bytes) || file.bytes < 0 || file.bytes > 2147483647 || !/^[a-f0-9]{64}$/.test(file.digest)) throw new Error('Invalid transfer file');
        if (!file.name.startsWith('media/')) {
          metadataBytes += file.bytes;
          if (file.bytes > 16777216 || metadataBytes > 33554432) throw new Error('Project documents exceed their size limit');
        }
        names.push(file.name); state.total += file.bytes;
      }
      if (!names.includes('mapping.json') || !names.includes('show.json')) throw new Error('Incomplete project');
      const revisions = deviceFile('.mapper-revisions');
      if (!fs.mkdir(revisions, true)) throw new Error('Cannot create revisions folder');
      root = fs.realpath(fs.mkdtemp(`${revisions}/revision-`));
      pendingRoots.push(root);
      fs.writeText(`${root}/.mapper-revision-owner`, REVISION_OWNER);
      if (!fs.mkdir(`${root}/media`) || !fs.mkdir(`${root}/scenes`)) throw new Error('Cannot create project folders');
      const authority = host.includes(':') ? `[${host}]` : host;
      for (const file of manifest.files) {
        const path = `${root}/${file.name}`;
        fs.writeText(path, '');
        let done = 0;
        while (done < file.bytes) {
          if (started !== this.generation || !current()) throw new Error('Transfer disconnected or cancelled');
          const end = Math.min(done + SLICE, file.bytes) - 1;
          const headers = new Headers();
          headers.set('range', `bytes=${done}-${end}`);
          const url = `http://${authority}:${port}/revision-file/${manifest.ticket}/${file.name}`;
          const reply = await fetch(url, { headers, timeoutMs: 30000, saveTo: path, maxBytes: SLICE });
          if (started !== this.generation || !current()) throw new Error('Transfer disconnected or cancelled');
          if (reply.url !== url || reply.status !== 206 || reply.headers.get('content-range') !== `bytes ${done}-${end}/${file.bytes}` || fs.stat(path).size !== end + 1) throw new Error(`Invalid transfer response: ${file.name}`);
          state.done += end + 1 - done; done = end + 1;
          await new Promise<void>((resolve: () => void) => { setTimeout(resolve, 10); });
        }

      }
      const checked = await snapshotFiles(root, manifest.files.map((file: RevisionFile): string => file.name), manifest.files.map((file: RevisionFile): string => ''));
      for (let i: i32 = 0; i < manifest.files.length; i++) if (checked[i].digest !== manifest.files[i].digest || checked[i].bytes !== manifest.files[i].bytes) throw new Error(`Checksum mismatch: ${manifest.files[i].name}`);
      if (started !== this.generation || !current()) throw new Error('Transfer disconnected or cancelled');
      validateReferences(root, JSON.parse(fs.readText(`${root}/mapping.json`)), JSON.parse(fs.readText(`${root}/show.json`)));
      for (const file of manifest.files) if (file.name.startsWith('scenes/')) {
        const scene = JSON.parse(fs.readText(`${root}/${file.name}`));
        validateReferences(root, scene.mapping, scene.show);
      }
      if (started !== this.generation || !current()) throw new Error('Transfer disconnected or cancelled');
      fs.writeText(`${root}/revision.json`, JSON.stringify({ version: 1, files: manifest.files }));
      state.path = root;
      this.transition(RevisionPhase.Ready);
    } catch (e) {
      state.problem = `${e}`;
      if (root !== '' && !fs.remove(root, true)) state.problem += `; cannot remove incomplete ${root}`;
      this.transition(state.phase === RevisionPhase.Cancelling ? RevisionPhase.Idle : RevisionPhase.Failed);
    } finally {
      const pending = pendingRoots.indexOf(root);
      if (pending >= 0) pendingRoots.splice(pending, 1);
    }
  }
}
