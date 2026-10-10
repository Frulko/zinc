// The assets exemption of the permissions is read-only (ZN-646): with fs:read:data only, an enforced program reads its own assets without
// any permission, but writing a file or placing a link in its assets directory needs fs:write (else it could link any file there and read it).
import * as fs from 'zinc:fs';
import * as assets from 'zinc:assets';
import * as sys from 'zinc:sys';

function attempt(what: string, f: () => string): void {
  try { console.log(`${what}: ${f()}`); } catch (e) { console.log(`${what}: ${(e as Error).message.indexOf('fs:write') >= 0 ? 'refused (fs:write)' : (e as Error).message}`); }
}
const dir = sys.cwd() + '/assets';
attempt('read an asset', (): string => assets.readText('note.txt').trim());
attempt('write in the assets', (): string => { fs.writeText(dir + '/new.txt', 'x'); return 'written'; });
attempt('link in the assets', (): string => { fs.symlink('/etc/hosts', dir + '/hosts'); return 'linked'; });
