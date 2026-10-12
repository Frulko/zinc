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

// ---- devices (ZN-729.06): what `zinc device` prints with --json

export interface Device { name: string; address: string; state: string; kind: string; id: string }

/** The rows of `zinc device list --json`: the agents the network shows and the paired devices. Anything else: no row. */
export function parseDevices(json: string): Device[] {
  const out: Device[] = [];
  try {
    for (const d of JSON.parse(json)) {
      const name: string = d.name, address: string = d.address, state: string = d.state, kind: string = d.kind, id: string = d.id;
      out.push({ name, address, state, kind, id });
    }
  } catch (e) { /* not a list: the command failed and said why on stderr */ }
  return out;
}

export interface DeviceApp { name: string; running: boolean; rss: number }
/** What a device is and how it is doing: one sample of `zinc device top --json`. `temp` is in °C, -1 when the system gives none. */
export interface Figures { name: string; kind: string; system: string; cpu: string; load: number; memFree: number; memTotal: number; temp: number; apps: DeviceApp[] }

/** One line of `zinc device top --json` (the device's info, a sample a second), or null when the line is not one. */
export function parseFigures(line: string): Figures | null {
  try {
    const d = JSON.parse(line);
    const name: string = d.name, kind: string = d.kind, os: string = d.os, version: string = d.osVersion, arch: string = d.arch, chip: string = d.cpu;
    const cores: i32 = d.cores, load: number = d.load1, memFree: number = d.memFree, memTotal: number = d.memTotal;
    let temp: number = -1;
    if (d.tempC !== undefined) temp = d.tempC;
    const apps: DeviceApp[] = [];
    for (const a of d.apps) {
      const app: string = a.name, running: boolean = a.running;
      let rss: number = 0;
      if (a.rss !== undefined) rss = a.rss;   // a stopped app has none
      apps.push({ name: app, running, rss });
    }
    return { name, kind, system: `${os} ${version} ${arch}`, cpu: `${chip === '' ? '' : chip + ', '}${cores} core${cores > 1 ? 's' : ''}`, load, memFree, memTotal, temp, apps };
  } catch (e) { return null; }
}

/** '3.1 GiB', '160 MiB': a size as `zinc device info` writes it. */
export function sizeText(bytes: number): string {
  return bytes >= 1073741824 ? (bytes / 1073741824).toFixed(1) + ' GiB' : Math.round(bytes / 1048576) + ' MiB';
}

// ---------------------------------------------------------------- the step lines of a command
/** A step line of the CLI: two spaces, a name, its text in columns ("  compile    6 files      35 ms"). The notes of a command are steps too
 *  ("  device     spark is linux aarch64: exporting for rpi"), and so is the progress of a transfer ("  send       45%  16 MiB of 35 MiB
 *  2.1 MiB/s"). Returns [the name, the text with its columns joined by commas]; [] for any other line: what a program prints, an error. */
export function stepOf(text: string): string[] {
  const gap = text.indexOf('  ', 3);
  if (!text.startsWith('  ') || text.length <= 4 || text.charCodeAt(2) === 32 || gap <= 0 || gap >= 14) return [];
  const cols: string[] = [];
  for (const c of text.slice(gap).split('  ')) if (c.trim() !== '') cols.push(c.trim());
  return [text.slice(2, gap), cols.join(', ')];
}
