import { tryLock, unlock, readText, writeText, exists } from 'zinc:fs';
import { env } from 'zinc:sys';
const base = env('FS_LOCK_DIR');
function expectError(code: string, action: () => void): void {
  let caught = false;
  try { action(); } catch (error) { if (!error.message.startsWith(code + ':')) throw error; caught = true; }
  if (!caught) throw new Error('expected ' + code);
}
const path = base + '/stable.lock';
writeText(path, 'unchanged');
const first = tryLock(path);
if (first <= 0 || tryLock(path) !== 0 || tryLock(base + '/../allowed/stable.lock') !== 0) throw new Error('exclusive');
const other = tryLock(base + '/other.lock');
if (other <= 0) throw new Error('independent');
unlock(other);
unlock(first);
const next = tryLock(path);
if (next <= first) throw new Error('token reused');
expectError('EBADF', () => unlock(first));
if (tryLock(path) !== 0) throw new Error('stale release');
unlock(next);
expectError('EBADF', () => unlock(next));
expectError('EBADF', () => unlock(0));
try { const token = tryLock(path); try { throw new Error('critical'); } finally { unlock(token); } } catch (error) { if (error.message !== 'critical') throw error; }
const after = tryLock(path); if (after <= 0) throw new Error('finally'); unlock(after);
const backslash = tryLock(base + '/legal\\name.lock'); if (backslash <= 0) throw new Error('backslash'); unlock(backslash);
expectError('ENOENT', () => { tryLock(base + '/missing/file.lock'); });
expectError('EINVAL', () => { tryLock(base + '/nul\u0000hidden.lock'); });
expectError('EISDIR', () => { tryLock(base); });
expectError('ELOOP', () => { tryLock(base + '/link.lock'); });
expectError('EACCES', () => { tryLock(base + '/../denied.lock'); });
expectError('EACCES', () => { tryLock(base + '/../assets/denied.lock'); });
expectError('EACCES', () => { tryLock(base + '/escape/denied.lock'); });
if (exists(base + '/../denied.lock') || exists(base + '/../assets/denied.lock') || exists(base + '/../outside/denied.lock')) throw new Error('created denied path');
if (readText(path) !== 'unchanged') throw new Error('truncated');
console.log('public filesystem locks: pass');
