// Files, images and folders given to a turn, and how each CLI takes them (checked on the real CLIs on 2026-10-20, read-only):
//
// - The message field shows references as Claude Code and Codex write them: an image is `[Image #N]`, a file or folder
//   `@path` (relative to the conversation's folder when inside it, absolute otherwise; quoted when it holds a space).
// - Claude Code 2.1 resolves `@path` in a `-p` prompt itself, files, images and folders alike (`@"my dir/a b.ts"` too): an image's
//   `[Image #N]` becomes its `@path`.
// - Codex 0.162 takes images with `-i <file>` on `exec` and on `exec resume`, the prompt after `--` (`-i` takes several
//   values); files and folders stay `@path` in the prompt, which the model reads and lists with its tools (cat, rg).
// - opencode 2.0 attaches files and images with `-f <file>`, once per file; folders stay `@path` in the prompt (its read
//   tool lists them).
import * as fs from 'zinc:fs';

export const A_IMAGE = 0, A_FILE = 1, A_FOLDER = 2;

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

export class Attachment {
  readonly path: string;
  readonly kind: i32;
  /** An image's number in its conversation (`[Image #n]`); 0 for a file or a folder. */
  readonly n: i32;
  constructor(path: string, kind: i32, n: i32) { this.path = path; this.kind = kind; this.n = n; }
}

/** What a dropped path is. */
export function kindOf(path: string, isDirectory: boolean): i32 {
  if (isDirectory) return A_FOLDER;
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/') && IMAGE_EXT.indexOf(path.slice(dot + 1).toLowerCase()) >= 0 ? A_IMAGE : A_FILE;
}

/** The attachment for a dropped path (absolute), numbered after the images already given (`imagesSoFar`). */
export function attachmentOf(path: string, imagesSoFar: i32): Attachment {
  let dir = false;
  try { dir = fs.stat(path).isDirectory; } catch (e) { }
  const p = path.length > 1 && path.endsWith('/') ? path.slice(0, path.length - 1) : path;
  const kind = kindOf(p, dir);
  return new Attachment(p, kind, kind === A_IMAGE ? imagesSoFar + 1 : 0);
}

/** `path` relative to `folder` when inside it, else as it is. */
export function relative(path: string, folder: string): string {
  const f = folder.endsWith('/') ? folder : folder + '/';
  return path.startsWith(f) && path.length > f.length ? path.slice(f.length) : path;
}

/** `@p`, quoted when `p` holds a space or a quote. */
export function mention(p: string): string {
  return p.indexOf(' ') >= 0 || p.indexOf('"') >= 0 ? `@"${p.split('"').join('\\"')}"` : '@' + p;
}

/** What the message field shows for `a`. */
export function token(a: Attachment, folder: string): string {
  if (a.kind === A_IMAGE) return `[Image #${a.n}]`;
  return mention(relative(a.path, folder) + (a.kind === A_FOLDER ? '/' : ''));
}

/** `draft` without reference `t` where it stands as a word (`@src/` goes, `@src/word.ts` stays), nor the space after it. */
export function withoutToken(draft: string, t: string): string {
  let out = '', i = 0;
  while (i < draft.length) {
    const k = draft.indexOf(t, i);
    if (k < 0) break;
    const e = k + t.length;
    const before = k === 0 || draft.charAt(k - 1) === ' ' || draft.charAt(k - 1) === '\n';
    const after = e === draft.length || draft.charAt(e) === ' ' || draft.charAt(e) === '\n';
    if (before && after) { out += draft.slice(i, k); i = draft.charAt(e) === ' ' ? e + 1 : e; }
    else { out += draft.slice(i, e); i = e; }
  }
  return out + draft.slice(i);
}

/** `prompt` with each image's `[Image #n]` written as its `@path` (Claude Code reads the image itself). */
export function imagesAsMentions(prompt: string, atts: Attachment[], folder: string): string {
  let out = prompt;
  for (const a of atts) {
    if (a.kind !== A_IMAGE) continue;
    const t = token(a, folder), m = mention(relative(a.path, folder));
    out = out.indexOf(t) >= 0 ? out.split(t).join(m) : `${out} ${m}`;
  }
  return out;
}

/** The number the next image of a conversation gets. */
export function nextImage(atts: Attachment[], last: i32): i32 {
  let n = last;
  for (const a of atts) if (a.kind === A_IMAGE && a.n > n) n = a.n;
  return n;
}

/** The file index for `@` completion: paths under `folder` (relative), breadth first, at most `max`, without hidden folders
 *  and the usual build and dependency folders. */
export function filesUnder(folder: string, max: i32): string[] {
  const out: string[] = [];
  const queue: string[] = [''];
  while (queue.length > 0 && out.length < max) {
    const rel = queue.shift() as string;
    let entries: fs.DirEntry[] = [];
    try { entries = fs.readDir(rel === '' ? folder : `${folder}/${rel}`); } catch (e) { continue; }
    entries.sort((a: fs.DirEntry, b: fs.DirEntry) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const e of entries) {
      if (out.length >= max) break;
      if (e.name.startsWith('.') || SKIP.indexOf(e.name) >= 0) continue;
      const p = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory) { out.push(p + '/'); queue.push(p); } else out.push(p);
    }
  }
  return out;
}
const SKIP = ['node_modules', 'build', 'dist', 'target', '__pycache__', 'venv', 'out'];

/** The `@` word being typed at the end of `draft` (without its @), or null. */
export function typedMention(draft: string): string | null {
  const at = draft.lastIndexOf('@');
  if (at < 0 || (at > 0 && draft.charAt(at - 1) !== ' ' && draft.charAt(at - 1) !== '\n')) return null;
  const word = draft.slice(at + 1);
  return word.indexOf(' ') >= 0 || word.startsWith('"') ? null : word;
}

/** At most `max` paths of `index` that hold `word` (case-insensitive), the ones whose name starts with it first. */
export function complete(index: string[], word: string, max: i32): string[] {
  const w = word.toLowerCase();
  const first: string[] = [], rest: string[] = [];
  for (const p of index) {
    const l = p.toLowerCase();
    if (l.indexOf(w) < 0) continue;
    const name = l.endsWith('/') ? l.slice(0, l.length - 1) : l;
    if (name.slice(name.lastIndexOf('/') + 1).startsWith(w) || l.startsWith(w)) first.push(p); else rest.push(p);
    if (first.length >= max) break;
  }
  return [...first, ...rest].slice(0, max);
}
