import * as fs from 'zinc:fs';
import * as sys from 'zinc:sys';
const dir = fs.mkdtemp(fs.tmpdir() + '/zinc-engines-');
try {
  const file = dir + '/sample';
  fs.writeText(file, 'hello');
  fs.appendText(file, ' zinc');
  console.log('file', fs.exists(file), fs.readText(file));
  fs.copyFile(file, dir + '/copy');
  fs.rename(dir + '/copy', dir + '/moved');
  console.log('copy', fs.readText(dir + '/moved'), fs.remove(dir + '/moved'));
  sys.setEnv('ZINC_ENGINE_SERVICE_TEST', 'native-service');
  console.log('env', sys.env('ZINC_ENGINE_SERVICE_TEST'));
  sys.unsetEnv('ZINC_ENGINE_SERVICE_TEST');
  console.log('unset', sys.env('ZINC_ENGINE_SERVICE_TEST') === '');
  try { fs.readText(dir + '/missing'); }
  catch (e) { console.log('caught', e.name, e.message !== ''); }
} finally { console.log('cleanup', fs.remove(dir, true)); }
