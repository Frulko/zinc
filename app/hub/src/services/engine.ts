// The engine on the tablet (ZN-844): the hub replaces the directory it runs from (ENGINE_DIR, /home/root/zinc) with the bundle the signed
// catalog offers, as integrations/remarkable-engine/deploy.sh does over ssh. The bundle is checked (SHA-256 and size of the catalog), unpacked
// beside the engine (<dir>.new), its zinc must run and say what the catalog says (`zinc --engine-info`), and only then the directories are
// swapped: <dir> -> <dir>.old, the new one -> <dir>, <dir>.old removed. A failure at any step keeps the old engine. The hub itself keeps
// running on the engine it was started with; the new one runs from the next start of an app. xochitl is never touched.
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import { newerEngine } from '../../../hub-server/src/protocol';
import { HubConfig } from './config';
import { CatalogEngine, downloadEngine } from './server';
import { ENGINE_DIR, ENGINE_ZBC, ENGINE_RT } from '../constants';

/** The version of the running engine: its bundle's engine.json (tools/rmpp-engine), else the package's VERSION, '' when unknown. */
export function engineVersion(): string {
  const json = ENGINE_DIR + '/share/zinc/rmpp/engine.json', stamp = ENGINE_DIR + '/share/zinc/VERSION';
  if (fs.exists(json)) return '' + JSON.parse(fs.readText(json)).version;
  return fs.exists(stamp) ? fs.readText(stamp).trim() : '';
}

/** The catalog's engine is offered when it runs more than the engine installed now (more runtime calls, or a newer version for the same
 *  ones). The installed one is read from its engine.json, not from the engine the hub runs on: after an update the hub runs the old one
 *  until it is opened again, and a newer engine published meanwhile is offered at once. Another ZBC version is not offered: every installed
 *  app would have to be packed again (deploy.sh does that change). */
export function engineOffered(e: CatalogEngine | null): boolean {
  if (ENGINE_DIR === '' || e === null) return false;
  const c = e as CatalogEngine;
  let zbc = ENGINE_ZBC, rt = ENGINE_RT;
  const json = ENGINE_DIR + '/share/zinc/rmpp/engine.json';
  if (fs.exists(json)) {   // a bundle of tools/rmpp-engine says both; an older one only its version
    const j = JSON.parse(fs.readText(json));
    if (typeof j.zbc === 'number') zbc = j.zbc as i32;
    if (typeof j.rt === 'number') rt = j.rt as i32;
  }
  if (zbc !== 0 && c.zbc !== zbc) return false;
  if (c.rt !== rt) return c.rt > rt;
  const now = engineVersion();
  return now === '' || newerEngine(c.version, now);
}

/** The new engine's own answer, which must be the catalog's: it runs on this tablet and is what was offered. */
async function check(bin: string, e: CatalogEngine): Promise<void> {
  const want = 'zinc-engine zbc=' + e.zbc.toString() + ' rt=' + e.rt.toString() + ' version=' + e.version;
  let got = '';
  try { const r = await proc.run(bin, ['--engine-info'], {}); got = r.code === 0 ? r.stdout.trim() : 'exit ' + r.code.toString() + ' ' + r.stderr.trim(); }
  catch (err) { got = err.message; }
  if (got !== want) throw new Error('Refused: the new engine does not run on this tablet as offered (' + got + '). The engine was not changed.');
}

export async function installEngine(cfg: HubConfig, e: CatalogEngine): Promise<string> {
  const dir = ENGINE_DIR, part = dir + '.download.tar.gz', fresh = dir + '.new', old = dir + '.old';
  if (!fs.exists(dir) && fs.exists(old)) fs.rename(old, dir);   // a swap cut short (power lost between the two renames): the old engine back
  const clean = (): void => { if (fs.exists(part)) fs.remove(part); if (fs.exists(fresh)) fs.remove(fresh, true); };
  clean();
  if (fs.exists(old)) fs.remove(old, true);
  try {
    await downloadEngine(cfg, e, part);
    fs.mkdir(fresh, true);
    const r = await proc.run('tar', ['xzf', part, '-C', fresh], {});   // BusyBox tar on the tablet
    if (r.code !== 0 || !fs.exists(fresh + '/zinc/bin/zinc')) throw new Error('Refused: the engine ' + e.version + ' does not unpack (' + r.stderr.trim() + '). The engine was not changed.');
    await check(fresh + '/zinc/bin/zinc', e);
    fs.rename(dir, old);
    try { fs.rename(fresh + '/zinc', dir); }
    catch (err) { fs.rename(old, dir); throw new Error('The new engine could not be put in place (' + err.message + '). The engine was not changed.'); }
  } catch (err) { clean(); throw err; }
  clean();
  fs.remove(old, true);
  return 'Engine updated to ' + e.version + '. Close the Hub and open it again to use it.';
}
