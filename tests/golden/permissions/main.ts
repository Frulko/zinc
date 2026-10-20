// zinc.json "permissions" at run time (ZN-322.01): fs:read:data and net:127.0.0.1 are granted; what else the program tries is warned about
// while developing and refused, the error naming the permission, when enforced (tests/t0/permissions.sh).
import * as fs from 'zinc:fs';
import { fetch, serve, stop, Request, Reply } from 'zinc:net';

function attempt(what: string, f: () => string): void {
  try { console.log(`${what}: ${f()}`); } catch (e) { console.log(`${what}: ${(e as Error).message}`); }
}
attempt('read data/a.txt', (): string => fs.readText('data/a.txt').trim());
attempt('read zinc.json', (): string => `${fs.readText('zinc.json').length > 0}`);
attempt('read zinc.json again', (): string => `${fs.readText('zinc.json').length > 0}`);
attempt('write out.txt', (): string => { fs.writeText('out.txt', 'x'); fs.remove('out.txt'); return 'written'; });
attempt('serve', (): string => { serve(0, (r: Request): Reply => ({ status: 200, contentType: 'text/plain', body: '' })); return 'listening'; });

async function nets(): Promise<void> {
  try { await fetch('http://blocked.invalid/'); console.log('fetch blocked.invalid: done'); } catch (e) { console.log(`fetch blocked.invalid: ${(e as Error).message}`); }
  try { await fetch('http://127.0.0.1:9/'); console.log('fetch 127.0.0.1: done'); } catch (e) { console.log(`fetch 127.0.0.1: ${(e as Error).message.indexOf('permission') >= 0 ? 'refused' : 'allowed (no server)'}`); }
}
nets().then(() => stop());
