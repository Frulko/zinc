// The log of what the app did: every operation (open, mount, eject, add, download, backup, restore, delete, check, repair) with its
// time and result, newest first on the Logs page, and appended to a file beside the iPod backups (<backups>/logs/demo.log:
// ~/.zinc/ipod/logs/demo.log by default, as zinc:ipod places its backups: ZINC_IPOD_BACKUPS, else ZINC_HOME/ipod).
import { createSignal } from 'zinc:ui/solid';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { LOG_KEEP } from '../constants';

export class LogEntry {
  time: string; what: string; result: string; ok: boolean;
  constructor(time: string, what: string, result: string, ok: boolean) { this.time = time; this.what = what; this.result = result; this.ok = ok; }
}

export const [logEntries, setLogEntries] = createSignal<LogEntry[]>([]);

/** Where zinc:ipod keeps the backups (the same rule as its backupRoot()). */
export function backupPlace(): string {
  const b = sys.env('ZINC_IPOD_BACKUPS');
  if (b !== '') return b;
  const h = sys.env('ZINC_HOME');
  return h !== '' ? `${h}/ipod` : `${sys.env('HOME')}/.zinc/ipod`;
}
export function logFile(): string { return `${backupPlace()}/logs/demo.log`; }

function pad2(n: number): string { return n < 10 ? `0${n}` : `${n}`; }
/** Now as 'YYYY-MM-DD HH:MM:SS', local time. */
export function now(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Records an operation: on the Logs page and at the end of the log file (a file that cannot be written loses the line, not the app). */
export function log(what: string, result: string, ok: boolean): void {
  const e = new LogEntry(now(), what, result, ok);
  const old = logEntries();
  const next: LogEntry[] = [e];
  for (let i = 0; i < old.length && i < LOG_KEEP - 1; i++) next.push(old[i]);
  setLogEntries(next);
  try {
    fs.mkdir(`${backupPlace()}/logs`, true);
    fs.appendText(logFile(), `${e.time}\t${ok ? 'ok' : 'error'}\t${what}\t${result.split('\n').join(' ')}\n`);
  } catch (err) { /* a read-only home: the page still has it */ }
}
