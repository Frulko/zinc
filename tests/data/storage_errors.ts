import * as storage from 'zinc:storage';
import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
import { equal, ok } from 'zinc:assert';

const root = fs.mkdtemp(fs.tmpdir() + '/clear-storage-');
const original = sys.env('ZINC_STORAGE');
try {
  const file = root + '/store.kv';
  sys.setEnv('ZINC_STORAGE', file);
  storage.set('title', 'Keep me');
  storage.set('escaped', 'line\nwith\ttab\\slash');
  equal(storage.get('escaped'), 'line\nwith\ttab\\slash');
  const before = fs.readText(file);
  fs.chmod(root, 0o500);
  let failed = false;
  try { storage.set('title', 'Lose me'); } catch (error) { failed = error.message.indexOf('storage') >= 0; }
  ok(failed, 'failed storage write must throw');
  equal(fs.readText(file), before, 'old store survives a failed replacement');
  fs.chmod(root, 0o700);
  equal(fs.list(root).length, 1, 'failed write leaves no temporary files');
  storage.remove('escaped');
  equal(storage.get('escaped'), '');
  equal(storage.get('title'), 'Keep me');
  sys.setEnv('ZINC_STORAGE', root);
  failed = false;
  try { storage.set('title', 'Do not replace a directory'); } catch (error) { failed = true; }
  ok(failed, 'unreadable store must not be replaced by defaults');
  equal(fs.readText(file), 'title\tKeep me\n');
  console.log('storage-errors: pass');
} finally {
  fs.chmod(root, 0o700);
  fs.remove(root, true);
  if (original === '') sys.unsetEnv('ZINC_STORAGE');
  else sys.setEnv('ZINC_STORAGE', original);
}
