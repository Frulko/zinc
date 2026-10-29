// The web page and the JSON of the iPods last seen: plain strings, no template engine. Every value the server writes is escaped;
// the page's script puts the library in with textContent only.
import * as ipod from 'zinc:ipod';
import { Scan } from '../state';
import { PAGE_REFRESH_S } from '../constants';
import { lib } from '../services/library';
import { STYLE } from './style';
import { shell } from './shell';
import { script } from './script';

function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
function bytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.round(n / 1e3)} KB`;
}
function hex4(n: i32): string { let s = n.toString(16); while (s.length < 4) s = '0' + s; return `0x${s}`; }

/** name and value rows of an iPod, '' values left out. */
function rows(d: ipod.Device): string[][] {
  const out: string[][] = [];
  const add = (name: string, value: string): void => { if (value !== '') out.push([name, value]); };
  add('Model', d.model);
  add('Generation', d.generation);
  add('Model number', d.modelNumber);
  add('Capacity', d.capacityGb > 0 ? `${d.capacityGb} GB` : '');
  if (d.connection === 'disk') {
    add('Mounted at', d.mountpoint);
    add('Storage', d.totalBytes > 0 ? `${bytes(d.totalBytes - d.freeBytes)} used of ${bytes(d.totalBytes)}, ${bytes(d.freeBytes)} free` : '');
    add('Database', d.hasDatabase ? 'present' : 'none');
    add('Access', d.readOnly ? 'read only' : 'read and write');
    add('Artwork', d.artwork ? 'yes' : 'no');
    add('Checksum', d.checksum);
    add('SysInfoExtended', d.sysInfoExtended ? 'present' : 'missing');
  } else {
    add('State', 'plugged in by USB, not mounted');
  }
  add('Firmware', d.firmware);
  add('Serial number', d.serial);
  add('FireWire GUID', d.firewireGuid);
  add('USB product', d.usbProduct !== 0 ? hex4(d.usbProduct) : '');
  return out;
}

function card(d: ipod.Device): string {
  let html = `<div class="pod"><h2>${esc(d.name !== '' ? d.name : 'iPod')}</h2><table class="kv">`;
  for (const r of rows(d)) html += `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`;
  return html + '</table></div>';
}

/** The management page: the header and the iPods plugged in are written here (escaped), the rest is filled by script.ts from /api. */
export function page(s: Scan): string {
  let summary = '';
  if (lib.mountpoint !== '') summary = `Serving ${esc(lib.name)} (${esc(lib.mountpoint)}): ${lib.tracks.length} songs, ${lib.albums.length} albums, ${lib.artists.length} artists`;
  else summary = esc(lib.error !== '' ? lib.error : 'No iPod open');
  let pods = '';
  if (s.error !== '') pods += `<p class="err">${esc(s.error)}</p>`;
  if (s.pods.length === 0) pods += '<p class="muted">No iPod found. Plug one in: it shows here within a few seconds.</p>';
  for (const d of s.pods) pods += card(d);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>iPod</title><style>${STYLE}</style></head><body>
${shell(summary, pods)}
<script>${script(PAGE_REFRESH_S)}</script></body></html>`;
}

function q(s: string): string {
  return '"' + s.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n') + '"';
}
export function json(s: Scan): string {
  const pods: string[] = [];
  for (const d of s.pods) {
    const fields: string[] = [];
    for (const r of rows(d)) fields.push(`${q(r[0])}: ${q(r[1])}`);
    pods.push(`{"name": ${q(d.name)}, "connection": ${q(d.connection)}, "specs": {${fields.join(', ')}}}`);
  }
  return `{"at": ${q(s.at)}, "error": ${q(s.error)}, "ipods": [${pods.join(', ')}]}\n`;
}
