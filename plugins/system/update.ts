// Signed app updates. Check and download run on the engine's worker; only a validated candidate is staged.
import { call } from './core';
import { env, poll } from 'zinc:sys';

export class UpdateInfo { available: boolean = false; version: string = ''; notes: string = ''; }
interface PreparedUpdate { pending: boolean; available: boolean; version: string; notes: string; dir: string }

async function result(job: i32): Promise<PreparedUpdate> {
  const deterministic = env('ZINC_DETERMINISTIC');
  for (;;) {
    const r = call('update.poll', { job }) as PreparedUpdate;
    if (!r.pending) return r;
    // The virtual clock must not overtake external work. Real apps yield to frames and input between polls.
    if (deterministic !== '' && deterministic !== '0') poll(5);
    else await new Promise<void>(resolve => { setTimeout(() => resolve(), 10); });
  }
}
/** Checks the signed channel off the frame. An optional URL overrides zinc.json update.url. */
export async function check(url: string = ''): Promise<UpdateInfo> {
  const start = call('update.check', { url }) as { job: i32 };
  const r = await result(start.job);
  const u = new UpdateInfo();
  u.available = r.available; u.version = r.version; u.notes = r.notes;
  return u;
}
/** Downloads and verifies off the frame. `validate` reads the unpacked candidate directory and throws to refuse its content before staging. */
export async function download(url: string = '', validate: ((dir: string) => void) | null = null): Promise<string> {
  const start = call('update.download', { url }) as { job: i32 };
  const r = await result(start.job);
  try { if (validate !== null) validate(r.dir); }
  catch (e) { call('update.discard', { job: start.job }); throw e; }
  call('update.stage', { job: start.job });
  return r.version;
}
/** Starts the app again with the same arguments; the staged version runs on trial. */
export function restart(): void { call('update.restart', {}); }
/** Keeps the version on trial now (otherwise after 5 s or at a normal exit). */
export function healthy(): void { call('update.healthy', {}); }
