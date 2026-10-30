// crash.txt, written by zinc-session when the app ends with an error: "key=value" lines (app, status, time), a
// blank line, then the last lines the app printed.
import * as fs from 'zinc:fs';

export class CrashReport {
  app: string = '';
  exitStatus: string = '';
  time: string = '';
  /** The app's last lines; one line saying so when it printed nothing. */
  output: string[] = [];
}

export function parseCrashReport(text: string): CrashReport {
  const report = new CrashReport();
  const blank = text.indexOf('\n\n');
  const header = blank < 0 ? text : text.slice(0, blank);
  for (const line of header.split('\n')) {
    const equals = line.indexOf('=');
    if (equals < 0) continue;
    const key = line.slice(0, equals), value = line.slice(equals + 1);
    if (key === 'app') report.app = value;
    else if (key === 'status') report.exitStatus = value;
    else if (key === 'time') report.time = value;
  }
  const output = blank < 0 ? '' : text.slice(blank + 2).trimEnd();
  report.output = output === '' ? ['It printed nothing.'] : output.split('\n');
  return report;
}

/** The report, or null when the app did not crash. */
export function readCrashReport(path: string): CrashReport | null {
  if (!fs.exists(path)) return null;
  try { return parseCrashReport(fs.readText(path)); } catch (e) { return null; }
}

export function deleteCrashReport(path: string): void { if (fs.exists(path)) fs.remove(path); }
