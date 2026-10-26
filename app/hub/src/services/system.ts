// The Info page: the hub, the engine and the tablet, read from /proc, /sys and /etc when the page opens (a few small files and one df).
// ZINC_HUB_SYS_ROOT replaces / for those files in the tests.
import * as fs from 'zinc:fs';
import * as proc from 'zinc:process';
import * as sys from 'zinc:sys';
import { HUB_DIR } from '../constants';

const ROOT = sys.env('ZINC_HUB_SYS_ROOT');

export class InfoLine {
  label: string = '';
  value: string = '';
}
export class InfoSection {
  title: string = '';
  lines: InfoLine[] = [];
  add(label: string, value: string): void { if (value === '') return; const l = new InfoLine(); l.label = label; l.value = value; this.lines.push(l); }
}

function read(path: string): string {
  const p = ROOT + path;
  try { return fs.exists(p) ? fs.readText(p).split('\0').join('').trim() : ''; } catch (e) { return ''; }
}
function keyOf(text: string, key: string): string {
  for (const line of text.split('\n')) if (line.startsWith(key + '=')) return line.slice(key.length + 1).split('"').join('');
  return '';
}
function kb(text: string, key: string): number {
  for (const line of text.split('\n')) if (line.startsWith(key + ':')) return parseInt(line.slice(key.length + 1).trim());
  return -1;
}
function size(kbytes: number): string {
  return kbytes >= 1048576 ? (kbytes / 1048576).toFixed(1) + ' GB' : Math.round(kbytes / 1024).toString() + ' MB';
}
function duration(s: number): string {
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return d > 0 ? d.toString() + ' d ' + (h % 24).toString() + ' h' : h > 0 ? h.toString() + ' h ' + (m % 60).toString() + ' min' : m.toString() + ' min';
}

/** The device tree's board name, as reMarkable sells it. */
function model(): string {
  const m = read('/proc/device-tree/model');
  return m.indexOf('Ferrari') >= 0 ? 'reMarkable Paper Pro' : m.indexOf('Chiappa') >= 0 ? 'reMarkable Paper Pro Move' : m;
}

/** The power supplies: the tablet's battery (the first of type Battery with a capacity), the charger, and the Marker. The Paper Pro reports
 *  the Marker twice: nfc-marker-battery while it is attached to the tablet's side (charging) and elants-marker-battery while the screen sees
 *  it; the one that is not present keeps its last capacity. One line: the present one (attached first), else the last reading. */
function battery(s: InfoSection): void {
  const dir = '/sys/class/power_supply';
  if (!fs.exists(ROOT + dir)) return;
  let tablet = '', plugged = false, marker = '', markerRank = 0;
  for (const n of fs.list(ROOT + dir)) {
    const p = dir + '/' + n, type = read(p + '/type'), cap = read(p + '/capacity'), st = read(p + '/status');
    if (n.indexOf('marker') >= 0) {
      if (cap === '' || cap === '0') continue;
      const present = read(p + '/present') === '1', attached = present && n.indexOf('nfc') >= 0;
      const rank = attached ? 3 : present ? 2 : 1;
      if (rank > markerRank) {
        markerRank = rank;
        marker = cap + '%' + (st === 'Charging' ? ' · charging' : st === 'Full' ? ' · charged' : attached ? ' · attached' : present ? '' : ' · last reading');
      }
      continue;
    }
    if (type === 'Battery' && cap !== '' && tablet === '') tablet = cap + '%' + (st !== '' && st !== 'Unknown' ? ' · ' + st.toLowerCase() : '');
    if (type === 'USB' && (read(p + '/online') === '1' || st === 'Charging')) plugged = true;
  }
  s.add('Tablet', tablet + (tablet !== '' && plugged ? ' · plugged in' : ''));
  s.add('Marker', marker);
}

export async function loadInfo(hubVersion: string, engine: string, zbc: i32, rt: i32, server: string): Promise<InfoSection[]> {
  const zinc = new InfoSection(); zinc.title = 'Zinc';
  zinc.add('Hub', hubVersion !== '' ? hubVersion : 'development build');
  zinc.add('Engine', engine);
  if (zbc > 0) zinc.add('Runs', 'ZBC ' + zbc.toString() + ' · ' + rt.toString() + ' runtime calls');
  zinc.add('Server', server);

  const tab = new InfoSection(); tab.title = 'Tablet';
  tab.add('Model', model());
  tab.add('System', keyOf(read('/etc/os-release'), 'IMG_VERSION'));
  const up = read('/proc/uptime');
  if (up !== '') tab.add('Up for', duration(parseFloat(up.split(' ')[0])));
  tab.add('Kernel', read('/proc/sys/kernel/osrelease'));

  const power = new InfoSection(); power.title = 'Battery';
  battery(power);

  const mem = new InfoSection(); mem.title = 'Memory and storage';
  const mi = read('/proc/meminfo'), total = kb(mi, 'MemTotal'), avail = kb(mi, 'MemAvailable');
  if (total > 0 && avail >= 0) mem.add('Memory', size(avail) + ' free of ' + size(total));
  try {   // df -kP <dir>: "<fs> <total> <used> <free> <use%> <mount>" on one line (without -P BusyBox wraps a long <fs> name onto its own
          // line); read from the end, so a wrapped line would still give the right columns
    const r = await proc.run('df', ['-kP', HUB_DIR], {});
    const w = (r.stdout.trim().split('\n').pop() as string).split(' ').filter((x: string) => x !== '');
    if (r.code === 0 && w.length >= 5) mem.add('Storage', size(parseInt(w[w.length - 3])) + ' free of ' + size(parseInt(w[w.length - 5])));
  } catch (e) { }

  return [zinc, tab, power, mem].filter((x: InfoSection) => x.lines.length > 0);
}

/** The running hub's version: its record when the hub installed itself, else the zinc.json inside its package (deploy.sh copies it). */
export async function hubVersion(installed: string, zapp: string): Promise<string> {
  if (installed !== '') return installed;
  if (!fs.exists(zapp)) return '';
  try {
    const r = await proc.run('tar', ['xOf', zapp, 'zinc.json'], {});
    return r.code === 0 ? '' + JSON.parse(r.stdout).app.version : '';
  } catch (e) { return ''; }
}
