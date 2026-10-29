// The HTML page and the JSON of the iPods last seen: plain strings, no template engine. Every value is escaped.
import * as ipod from 'zinc:ipod';
import { Scan } from './state';
import { PAGE_REFRESH_S } from './constants';

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
  const used = d.totalBytes > 0 ? Math.round((d.totalBytes - d.freeBytes) * 100 / d.totalBytes) : 0;
  let html = `<section><h2>${esc(d.name !== '' ? d.name : 'iPod')}</h2>`;
  if (d.totalBytes > 0) html += `<div class="bar"><div style="width:${used}%"></div></div>`;
  html += '<table>';
  for (const r of rows(d)) html += `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`;
  return html + '</table></section>';
}

export function page(s: Scan): string {
  let body = '';
  if (s.error !== '') body += `<p class="err">${esc(s.error)}</p>`;
  if (s.pods.length === 0) body += '<p class="none">No iPod found. Plug one in: it shows here within a few seconds.</p>';
  for (const d of s.pods) body += card(d);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="${PAGE_REFRESH_S}"><title>iPod</title><style>
body{font:15px -apple-system,system-ui,sans-serif;margin:0;padding:24px;background:#f3f3f5;color:#1d1d1f}
h1{font-size:24px;margin:0 0 4px}.at{color:#6e6e73;font-size:12px;margin-bottom:20px}
section{background:#fff;border:1px solid #e4e4e7;border-radius:10px;padding:16px 20px;margin-bottom:16px;max-width:560px}
h2{font-size:18px;margin:0 0 10px}table{border-collapse:collapse;width:100%}
th{text-align:left;font-weight:500;color:#6e6e73;padding:4px 16px 4px 0;white-space:nowrap;vertical-align:top}td{padding:4px 0;word-break:break-all}
.bar{height:6px;background:#ececf0;border-radius:3px;overflow:hidden;margin-bottom:12px}.bar div{height:100%;background:#fa2d48}
.none{color:#6e6e73}.err{color:#d70015}
@media (prefers-color-scheme:dark){body{background:#1c1c1e;color:#f5f5f7}section{background:#2c2c2e;border-color:#38383c}.bar{background:#3a3a3e}}
</style></head><body><h1>iPod</h1><div class="at">Seen ${esc(s.at)} · refreshes every ${PAGE_REFRESH_S} s · <a href="/pod.json">JSON</a></div>
${body}</body></html>`;
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
