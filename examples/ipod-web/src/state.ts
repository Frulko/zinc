// The iPods last seen: detect() every few seconds. It only reads the mounted volumes and the system's USB list, so this program
// never opens an iPod's database and never writes to it.
import * as ipod from 'zinc:ipod';

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
}
