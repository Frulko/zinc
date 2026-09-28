// External tools through zinc:process: diagnostics from `zinc check --json` and the terminal panel's `zinc run`.
// Both need the zinc CLI: $ZINC_ROOT/compiler/bin/zinc.mjs, else found relative to the working directory or to the
// sample project. Without it, the features stay quiet (no diagnostics, a message in the terminal).
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { root } from './project';
import { Buffer, Diagnostic, say } from './workspace';
import { L_TS } from './syntax';

function findCli(): string {
  const env = sys.env('ZINC_ROOT');
  const cands: string[] = [];
  if (env !== '') cands.push(env + '/compiler/bin/zinc.mjs');
  cands.push('compiler/bin/zinc.mjs');
  cands.push('../../compiler/bin/zinc.mjs');
  cands.push(root.path + '/../../../compiler/bin/zinc.mjs');
  for (const c of cands) if (fs.exists(c)) return c;
  return '';
}
const CLI: string = findCli();

// ---- diagnostics
/** Reads one JSON string starting at the quote at `i`: [value, index after the closing quote]. */
function jsonString(s: string, i: i32): string[] {
  let out = '', j = i + 1;
  while (j < s.length && s.charCodeAt(j) !== 34) {
    if (s.charCodeAt(j) === 92 && j + 1 < s.length) {
      const e = s.slice(j + 1, j + 2);
      if (e === 'n') out += '\n'; else if (e === 't') out += '\t';
      else if (e === 'u') { out += String.fromCharCode(parseInt(s.slice(j + 2, j + 6), 16)); j += 4; }
      else out += e;
      j += 2;
    } else { out += s.slice(j, j + 1); j++; }
  }
  return [out, `${j + 1}`];
}
function numberAfter(s: string, key: string, from: i32): i32 {
  const k = s.indexOf(key, from);
  if (k < 0) return -1;
  let j = k + key.length;
  while (j < s.length && (s.charCodeAt(j) === 32 || s.charCodeAt(j) === 58)) j++;
  let e = j;
  while (e < s.length && s.charCodeAt(e) >= 48 && s.charCodeAt(e) <= 57) e++;
  return e > j ? parseInt(s.slice(j, e)) : -1;
}
/** `zinc check --json` output (LSP-style: range.start, severity, message) to diagnostics. */
export function parseDiagnostics(json: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  let p = json.indexOf('"range"');
  while (p >= 0) {
    const end = json.indexOf('"range"', p + 7);
    const stop = end < 0 ? json.length : end;
    const line = numberAfter(json, '"line"', p), col = numberAfter(json, '"character"', p), sev = numberAfter(json, '"severity"', p);
    const m = json.indexOf('"message"', p);
    let msg = '';
    if (m >= 0 && m < stop) { const q = json.indexOf('"', m + 9); if (q >= 0) msg = jsonString(json, q)[0]; }
    if (line >= 0) out.push(new Diagnostic(line, col < 0 ? 0 : col, sev < 0 ? 1 : sev, msg));
    p = end;
  }
  return out;
}

const generation = new Map<string, i32>();
/** Type-checks a TypeScript buffer's file (as saved) and shows the result as squiggles and gutter dots. */
export function check(b: Buffer): void {
  if (CLI === '' || b.doc.lang !== L_TS) return;
  const gen = (generation.get(b.path) ?? 0) + 1;
  generation.set(b.path, gen);
  runCheck(b, gen);
}
async function runCheck(b: Buffer, gen: i32): Promise<void> {
  try {
    const r = await proc.run('node', [CLI, 'check', b.path, '--json'], {});
    if (generation.get(b.path) !== gen) return;   // a newer check is running
    b.setDiagnostics(parseDiagnostics(r.stdout));
  } catch (e) { say('zinc check: ' + (e as Error).message); }
}

// ---- terminal panel
/** A run of text in one ANSI colour (-1: default; 0..7 normal, 8..15 bright). */
export class Span {
  text: string; color: i32; bold: boolean;
  constructor(text: string, color: i32, bold: boolean) { this.text = text; this.color = color; this.bold = bold; }
}
export class TermLine {
  spans: Span[];
  constructor(spans: Span[]) { this.spans = spans; }
}
/** Splits a line at its SGR escapes (ESC [ ... m): colours 30-37 / 90-97, 1 bold, 0 / 39 reset; others dropped. */
export function parseAnsi(line: string, base: i32): Span[] {
  const out: Span[] = [];
  let color = base, bold = false, i: i32 = 0, text = '';
  while (i < line.length) {
    const c = line.charCodeAt(i);
    if (c === 27 && line.slice(i + 1, i + 2) === '[') {
      let j = i + 2;
      while (j < line.length && !((line.charCodeAt(j) >= 64 && line.charCodeAt(j) <= 126))) j++;
      if (text.length > 0) { out.push(new Span(text, color, bold)); text = ''; }
      if (j < line.length && line.slice(j, j + 1) === 'm') {
        for (const part of line.slice(i + 2, j).split(';')) {
          const v = part === '' ? 0 : parseInt(part);
          if (v === 0) { color = base; bold = false; }
          else if (v === 1) bold = true;
          else if (v === 22) bold = false;
          else if (v === 39) color = base;
          else if (v >= 30 && v <= 37) color = v - 30;
          else if (v >= 90 && v <= 97) color = v - 90 + 8;
        }
      }
      i = j + 1;
      continue;
    }
    if (c !== 13) text += line.slice(i, i + 1);
    i++;
  }
  if (text.length > 0 || out.length === 0) out.push(new Span(text, color, bold));
  return out;
}

const MAX_LINES: i32 = 500;
export const [termLines, setTermLines] = createSignal<TermLine[]>([]);
export const [running, setRunning] = createSignal<boolean>(false);
let buf: TermLine[] = [];
let child: proc.Process | null = null;
/** Frames left to keep the end of the output in view (its height is known after the next layout). */
let follow: i32 = 0;
/** True while the terminal should scroll to its end (called once per frame). */
export function takeFollow(): boolean { if (follow <= 0) return false; follow--; return true; }

function add(text: string, base: i32): void {
  buf.push(new TermLine(parseAnsi(text, base)));
  if (buf.length > MAX_LINES) buf = buf.slice(buf.length - MAX_LINES);
  setTermLines(buf.slice());
  follow = 2;
}
export function clearTerminal(): void { buf = []; setTermLines([]); }

/** Runs the project with `zinc run <project> --target sim` and streams its output. */
export function runProject(): void {
  if (child !== null) (child as proc.Process).kill(9);
  clearTerminal();
  if (CLI === '') { add('zinc CLI not found: set ZINC_ROOT to the zinc checkout', 1); return; }
  add(`$ zinc run ${root.path} --target sim`, 8 + 4);
  const t0 = sys.clock();
  try {
    const p = proc.spawn('node', [CLI, 'run', root.path, '--target', 'sim'], { env: ['FORCE_COLOR=1'] });
    child = p;
    setRunning(true);
    p.onStdout((l: string) => { add(l, -1); });
    p.onStderr((l: string) => { add(l, 0); });
    p.onExit((code: i32) => {
      if (child === p) { child = null; setRunning(false); }
      add(`[exit ${code} after ${Math.round(sys.clock() - t0)} ms]`, code === 0 ? 8 : 1);
    });
  } catch (e) { add((e as Error).message, 1); }
}
export function stopProject(): void { if (child !== null) (child as proc.Process).kill(); }
