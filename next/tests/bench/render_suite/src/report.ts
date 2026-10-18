// The report of a sequence run (tools/zbench): the program writes it itself, a section at a time, to the file ZB_OUT, and the tool fetches that file with the
// device's own file transfer (adb run-as, novacom get, scp, the iOS app container). No log is read: a log truncates a long line (iOS cuts at 1000 characters),
// loses lines (a small logcat ring), does not say when the run is over and is not the same on any two platforms.
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { profSection } from 'zinc:gfx';

const parts: string[] = [];
let surface = '';
let path = '';

/** ZB_OUT is a file name; a leading ~ is the app's home (the iOS container is only known to the app). */
export function openReport(size: string): void {
  surface = size;
  path = sys.env('ZB_OUT');
  if (path.length > 0 && path.charAt(0) === '~') path = sys.env('HOME') + path.substring(1);
}

function save(done: boolean): void {
  if (path.length === 0) return;
  fs.writeText(path, '{"schema":"zbench-report/1","run":"' + sys.env('ZB_RUN') + '","surface":"' + surface + '","done":' + (done ? 'true' : 'false') + ',"sections":[' + parts.join(',') + ']}');
}

/** Closes the engine's profile section `id`, keeps its numbers in the report and writes the file (done: the last scene). */
export function closeSection(id: string, last: boolean): void {
  const j: string = profSection(id);
  if (j.length > 0) parts.push(j);
  save(last);
}
