// The hub's protocol, shared by the server (app/hub-server) and the device app (app/hub): hex, SHA-256, the signed `key=value` manifests of
// `zinc publish` (zn::tc::signManifest) and the version order of `zinc update-app` (zn::tc::newerVersion).
import * as sys from 'zinc:sys';
import { subtle } from 'zinc:subtle';

export function hex(bytes: u8[]): string {
  const d = '0123456789abcdef';
  let s = '';
  for (const b of bytes) s += d.charAt((b >> 4) & 15) + d.charAt(b & 15);
  return s;
}
export function unhex(s: string): u8[] {
  const r: u8[] = [];
  for (let i: i32 = 0; i + 1 < s.length; i += 2) r.push(parseInt(s.slice(i, i + 2), 16) as u8);
  return r;
}
export async function sha256(bytes: u8[]): Promise<string> { return hex(await subtle.digest('SHA-256', bytes)); }

// a name that is safe as one path component: an app id, a channel, a version, a file
export function safe(s: string): boolean {
  if (s.length === 0 || s.length > 128 || s.charAt(0) === '.') return false;
  for (let i: i32 = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (!((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '.' || c === '-' || c === '_' || c === '+')) return false;
  }
  return true;
}

// semver order as zn::tc::newerVersion (src/tc/tc.cpp), which `zinc update-app` applies: 1.2.0 > 1.2.0-beta.2 > 1.2.0-beta.1, +build ignored
function isNum(t: string): boolean { if (t.length === 0) return false; for (let i: i32 = 0; i < t.length; i++) { const c = t.charAt(i); if (c < '0' || c > '9') return false; } return true; }
export function newer(a: string, b: string): boolean {
  const ca = a.split('+')[0], cb = b.split('+')[0];
  const da = ca.indexOf('-'), db = cb.indexOf('-');
  const pa = da < 0 ? '' : ca.slice(da + 1), pb = db < 0 ? '' : cb.slice(db + 1);
  const xa = (da < 0 ? ca : ca.slice(0, da)).split('.'), xb = (db < 0 ? cb : cb.slice(0, db)).split('.');
  for (let i: i32 = 0; i < xa.length || i < xb.length; i++) {
    const x = i < xa.length ? parseInt(xa[i]) : 0, y = i < xb.length ? parseInt(xb[i]) : 0;
    if (x !== y) return x > y;
  }
  if (pa.length === 0 || pb.length === 0) return pa.length === 0 && pb.length > 0;
  const ya = pa.split('.'), yb = pb.split('.');
  for (let i: i32 = 0; i < ya.length && i < yb.length; i++) {
    if (ya[i] === yb[i]) continue;
    if (isNum(ya[i]) && isNum(yb[i])) return parseInt(ya[i]) > parseInt(yb[i]);
    return isNum(ya[i]) !== isNum(yb[i]) ? !isNum(ya[i]) : ya[i] > yb[i];
  }
  return ya.length > yb.length;
}

// A manifest: `key=value` lines, the last `sig=<128 hex>` an Ed25519 signature of the other lines (zn::tc::signManifest).
export class Manifest {
  fields: string[] = [];
  values: string[] = [];
  body: string = '';
  sig: string = '';
  get(k: string): string { const i = this.fields.indexOf(k); return i < 0 ? '' : this.values[i]; }
}
export function parseManifest(text: string): Manifest {
  const m = new Manifest();
  for (const line of text.split('\n')) {
    if (line.length === 0) continue;
    if (line.startsWith('sig=')) { m.sig = line.slice(4).trim(); continue; }
    m.body += line + '\n';
    const eq = line.indexOf('=');
    if (eq > 0) { m.fields.push(line.slice(0, eq)); m.values.push(line.slice(eq + 1)); }
  }
  return m;
}
export async function verifyManifest(m: Manifest, keyHex: string): Promise<boolean> {
  if (m.sig.length !== 128 || keyHex.length !== 64) return false;
  const key = await subtle.importKey('raw', unhex(keyHex), { name: 'Ed25519' }, false, ['verify']);
  return await subtle.verify({ name: 'Ed25519' }, key, unhex(m.sig), sys.utf8Encode(m.body));
}
