// Zinc Atelier model: the parts of the app that are plain data in, plain data out (diagnostics, profiles, the project tree).
import * as fs from 'zinc:fs';

export interface Diag { file: string; line: i32; col: i32; severity: string; code: string; message: string }

/** `path:line:col: error Z0103: message` lines of `zinc check`, as printed by the compiler. */
export function parseDiagnostics(text: string): Diag[] {
  const out: Diag[] = [];
  const lines = text.split('\n');
  for (let i: i32 = 0; i < lines.length; i++) {
    const l = lines[i];
    const at = l.indexOf(': error ');
    if (at < 0) continue;
    const head = l.substring(0, at).split(':');
    if (head.length < 3) continue;
    const rest = l.substring(at + 8);
    const sp = rest.indexOf(': ');
    out.push({ file: head.slice(0, head.length - 2).join(':'), line: parseInt(head[head.length - 2]), col: parseInt(head[head.length - 1]),
               severity: 'error', code: sp < 0 ? '' : rest.substring(0, sp), message: sp < 0 ? rest : rest.substring(sp + 2) });
  }
  return out;
}

export interface Hot { name: string; self: i32; share: i32 }

/** The functions with the most self samples of a folded-stacks profile (`a;b;c count` per line), most first. */
export function hottest(folded: string, limit: i32): Hot[] {
  const counts = new Map<string, i32>();
  let total: i32 = 0;
  const lines = folded.split('\n');
  for (let i: i32 = 0; i < lines.length; i++) {
    const l = lines[i];
    const sp = l.lastIndexOf(' ');
    if (sp < 0) continue;
    const n = parseInt(l.substring(sp + 1));
    const frames = l.substring(0, sp).split(';');
    const name = frames[frames.length - 1];
    counts.set(name, (counts.has(name) ? (counts.get(name) as i32) : 0) + n);
    total += n;
  }
  const out: Hot[] = [];
  counts.forEach((v: i32, k: string) => { out.push({ name: k, self: v, share: total > 0 ? Math.round(v * 100 / total) : 0 }); });
  out.sort((a: Hot, b: Hot) => b.self - a.self);
  return out.slice(0, limit);
}

export interface Phase { name: string; total: i32; count: i32 }

/** The phases of a ZINC_TRACE file (Chrome trace events, `{"name":"layout","ph":"X","ts":..,"dur":123}`): microseconds and count per name, longest first.
 *  A text scan, not JSON.parse: a program that uses `any` cannot use zinc:ui (the undefined of Dyn differs from null). */
export function tracePhases(json: string): Phase[] {
  const sum = new Map<string, i32>();
  const cnt = new Map<string, i32>();
  const parts = json.split('{"name":"');
  for (let i: i32 = 1; i < parts.length; i++) {
    const e = parts[i];
    const q = e.indexOf('"');
    const d = e.indexOf('"dur":');
    if (q < 0 || d < 0 || e.indexOf('"ph":"X"') < 0) continue;
    const name = e.substring(0, q);
    const rest = e.substring(d + 6);
    let end = 0;
    while (end < rest.length && rest.charCodeAt(end) >= 48 && rest.charCodeAt(end) <= 57) end++;
    sum.set(name, (sum.has(name) ? (sum.get(name) as i32) : 0) + parseInt(rest.substring(0, end)));
    cnt.set(name, (cnt.has(name) ? (cnt.get(name) as i32) : 0) + 1);
  }
  const out: Phase[] = [];
  sum.forEach((v: i32, k: string) => { out.push({ name: k, total: v, count: cnt.get(k) as i32 }); });
  out.sort((a: Phase, b: Phase) => b.total - a.total);
  return out;
}

function walk(dir: string, rel: string, depth: i32, out: string[]): void {
  const entries = fs.readDir(dir);
  for (let i: i32 = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'build') continue;
    const r = rel === '' ? e.name : rel + '/' + e.name;
    if (e.isDirectory) { if (depth < 3) walk(dir + '/' + e.name, r, depth + 1, out); }
    else if (e.name.endsWith('.ts') || e.name.endsWith('.tsx')) out.push(r);
  }
}

/** The source files of a project (.ts, .tsx), relative to `root`, up to three levels deep, sorted. */
export function projectFiles(root: string): string[] {
  const out: string[] = [];
  walk(root, '', 0, out);
  out.sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}
