// The iPods last seen: detect() every few seconds reads the mounted volumes and the system's USB list; then the library follows
// them (services/library.ts opens the iPod to serve, reopens it when it comes back, closes it when it goes).
import * as ipod from 'zinc:ipod';
import { sync } from './services/library';
import { options } from './services/options';
import { writeWaiting } from './services/plays';

export class Scan {
  pods: ipod.Device[] = [];
  at: string = '';
  error: string = '';
}
export const last = new Scan();

export async function scan(): Promise<void> {
  try {
    last.pods = await ipod.detect();
    last.error = '';
  } catch (e) {
    last.error = (e as Error).message;
  }
  last.at = new Date().toISOString();
  await sync(last.pods, options.mount);
  await writeWaiting();
}
