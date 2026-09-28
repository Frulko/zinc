// zinc:path — POSIX path manipulation, the same results as Node's path (path.posix) and txiki's tjs:path. Written in
// Zinc: the same everywhere. join / resolve take up to six segments (no rest parameters in Zinc; empty segments are
// ignored, as in Node), joinAll / resolveAll a list.
import { cwd } from 'zinc:sys';

export const sep: string = '/';
export const delimiter: string = ':';

/** Resolves '.' and '..' segments; `allowAbove`: keep leading '..' of a relative path. */
function normalizeString(p: string, allowAbove: boolean): string {
  const out: string[] = [];
  for (const seg of p.split('/')) {
    if (seg.length === 0 || seg === '.') continue;
    if (seg === '..') {
      if (out.length > 0 && out[out.length - 1] !== '..') out.pop();
      else if (allowAbove) out.push('..');
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}
export function isAbsolute(p: string): boolean { return p.startsWith('/'); }
export function normalize(p: string): string {
  if (p.length === 0) return '.';
  const abs = isAbsolute(p);
  const trailing = p.endsWith('/');
  let s = normalizeString(p, !abs);
  if (s.length === 0 && !abs) s = '.';
  if (s.length > 0 && trailing) s += '/';
  return abs ? '/' + s : s;
}
export function joinAll(parts: string[]): string {
  const kept: string[] = [];
  for (const p of parts) if (p.length > 0) kept.push(p);
  return kept.length === 0 ? '.' : normalize(kept.join('/'));
}
export function join(a: string, b: string = '', c: string = '', d: string = '', e: string = '', f: string = ''): string { return joinAll([a, b, c, d, e, f]); }
/** Absolute path: the segments from right to left until one is absolute, then the working directory. */
export function resolveAll(parts: string[]): string {
  let resolved = '';
  let abs = false;
  for (let i = parts.length - 1; i >= 0 && !abs; i--) {
    const p = parts[i];
    if (p.length === 0) continue;
    resolved = resolved.length > 0 ? p + '/' + resolved : p;
    abs = isAbsolute(p);
  }
  if (!abs) resolved = cwd() + (resolved.length > 0 ? '/' + resolved : '');
  const s = normalizeString(resolved, false);
  return '/' + s;
}
export function resolve(a: string = '', b: string = '', c: string = '', d: string = '', e: string = '', f: string = ''): string { return resolveAll([a, b, c, d, e, f]); }
export function relative(from: string, to: string): string {
  const f = resolve(from), t = resolve(to);
  if (f === t) return '';
  const none: string[] = [];
  const fs = f === '/' ? none : f.slice(1).split('/'), ts = t === '/' ? none : t.slice(1).split('/');
  let i = 0;
  while (i < fs.length && i < ts.length && fs[i] === ts[i]) i++;
  const out: string[] = [];
  for (let k = i; k < fs.length; k++) out.push('..');
  for (let k = i; k < ts.length; k++) out.push(ts[k]);
  return out.join('/');
}
function trimSlashes(p: string): string {
  let end = p.length;
  while (end > 1 && p.charCodeAt(end - 1) === 47) end--;
  return end === p.length ? p : p.slice(0, end);
}
export function dirname(p: string): string {
  if (p.length === 0) return '.';
  const t = trimSlashes(p);
  const i = t.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return trimSlashes(t.slice(0, i));
}
export function basename(p: string, ext: string = ''): string {
  const t = trimSlashes(p);
  if (t === '/') return '';
  const b = t.slice(t.lastIndexOf('/') + 1);
  return ext.length > 0 && b.endsWith(ext) ? b.slice(0, b.length - ext.length) : b;
}
export function extname(p: string): string {
  const b = basename(p);
  const i = b.lastIndexOf('.');
  if (i <= 0 || b === '..') return '';
  return b.slice(i);
}
export class ParsedPath {
  root: string; dir: string; base: string; ext: string; name: string;
  constructor(root: string, dir: string, base: string, ext: string, name: string) { this.root = root; this.dir = dir; this.base = base; this.ext = ext; this.name = name; }
}
export function parse(p: string): ParsedPath {
  const root = isAbsolute(p) ? '/' : '';
  const base = basename(p);
  const ext = extname(p);
  const d = dirname(p);
  const dir = p.length === 0 || (d === '.' && !p.startsWith('./') && !trimSlashes(p).includes('/')) ? '' : d;
  return new ParsedPath(root, dir, base, ext, ext.length > 0 ? base.slice(0, base.length - ext.length) : base);
}
export function format(p: ParsedPath): string {
  const dir = p.dir.length > 0 ? p.dir : p.root;
  const base = p.base.length > 0 ? p.base : p.name + p.ext;
  if (dir.length === 0) return base;
  return dir === p.root ? dir + base : dir + '/' + base;
}
