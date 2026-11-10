import * as update from 'zinc:system/update';
import * as fs from 'zinc:fs';
import { env, poll } from 'zinc:sys';
import { call } from 'zinc:system/events';
import { ok as assert } from 'zinc:assert';
const root = env('UPDATE_FIXTURE');
const staged = env('ZINC_HOME') + '/apps/org.zinc.update-test/staged';
async function main(): Promise<void> {
  assert((await update.check()).available, 'signed newer manifest');
  let refused = false;
  try { await update.download('file://' + root + '/bad.manifest', (dir: string) => { JSON.parse(fs.readText(dir + '/assets/project.json')); }); }
  catch (e) { refused = true; }
  assert(refused && !fs.exists(staged), 'invalid content was staged');
  const version = await update.download('', (dir: string) => { JSON.parse(fs.readText(dir + '/assets/project.json')); });
  assert(version === '1.1.0' && fs.exists(staged), 'valid content was not staged after a refusal');
  const before = fs.readText(staged);
  const bytes = fs.readBytes(before.trim());
  for (const name of ['bad', 'other', 'tampered', 'same-name']) {
    refused = false;
    try { await update.download('file://' + root + '/' + name + '.manifest', (dir: string) => { JSON.parse(fs.readText(dir + '/assets/project.json')); }); }
    catch (e) { refused = true; }
    assert(refused && fs.readText(staged) === before, 'a refused candidate changed staging');
  }
  const after = fs.readBytes(before.trim());
  assert(after.length === bytes.length, 'refused same-name content replaced a staged package');
  for (let i = 0; i < bytes.length; i++) assert(bytes[i] === after[i], 'staged bytes changed after a refusal');
  assert((await update.check()).available, 'failed operation left the updater busy');
  const prepared = call('update.download', { url: '' }) as { job: i32 };
  while ((call('update.poll', { job: prepared.job }) as { pending: boolean }).pending) poll(5);
  call('update.discard', { job: prepared.job });
  assert((await update.check()).available, 'discarded operation was not reset');
  refused = false;
  try { call('update.stage', { job: prepared.job }); } catch (e) { refused = true; }
  assert(refused && fs.readText(staged) === before, 'a stale prepared operation staged content');
  console.log('candidate checks passed');
}
main();
