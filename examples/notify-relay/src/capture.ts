// The capture: Notification Center's database (SQLite, WAL), opened read-only where it lies and asked every second for the records
// delivered since the last question. Only the tables `record` and `app` are read, and of them only what a notification shows; the file
// is never copied. Opening it needs Full Disk Access (macOS 15 keeps it in usernoted's group container); until then open() fails with
// EPERM and the first-run assistant says what to grant.
import * as sqlite from 'zinc:sqlite';
import * as mac from 'zinc:notifymac';
import { base64Decode } from 'zinc:web';
import { Notif, fromRecord, isImage } from './model';

const SINCE: string = 'SELECT r.uuid, a.identifier, r.data, r.delivered_date, r.presented FROM record r JOIN app a ON a.app_id = r.app_id ' +
  'WHERE r.delivered_date IS NOT NULL AND r.delivered_date >= ? ORDER BY r.delivered_date';

function hex(b: u8[]): string {
  const d = '0123456789abcdef';
  let s = '';
  for (const x of b) s += d.charAt(x >> 4) + d.charAt(x & 15);
  return s;
}

export class Capture {
  path: string;
  /** Why the database cannot be read now ('' when it can): 'permission' (Full Disk Access is not granted), else SQLite's message. */
  problem: string = '';
  private db: sqlite.Database | null = null;
  private query: sqlite.Statement | null = null;
  private since: number = -1;          // the delivered_date of the newest record seen (Core Foundation time)
  private seen: string[] = [];         // uuids of the records at `since` and just before: a record is relayed once
  constructor(path: string) { this.path = path; }

  /** Whether this process may open the database (Full Disk Access granted, or a file of its own in a test). */
  allowed(): boolean { return mac.openError(this.path) === 0; }

  private open(): boolean {
    const e = mac.openError(this.path);
    if (e !== 0) { this.problem = e === 1 ? 'permission' : e === 2 ? 'no database at ' + this.path : 'cannot open the database (errno ' + e + ')'; return false; }
    try {
      const db = new sqlite.Database(this.path, { readOnly: true, create: false });
      if (this.since < 0) {   // the first time: what is already there is history, not news
        const st = db.prepare('SELECT max(delivered_date) AS d FROM record');
        const r = st.get();
        st.finalize();
        this.since = r === null ? 0 : r.number('d');
      }
      const q = db.prepare(SINCE);
      if (this.seen.length === 0) for (const r of q.all([this.since])) this.seen.push(hex(r.bytes('uuid')));   // the newest of the history too
      this.query = q;
      this.db = db;
      this.problem = '';
      return true;
    } catch (err) {
      this.problem = (err as Error).message;
      return false;
    }
  }

  /** The notifications delivered since the last call (none the first time: they were there before the relay started). */
  poll(): Notif[] {
    const out: Notif[] = [];
    if (this.db === null && !this.open()) return out;
    const db = this.db as sqlite.Database;
    let rows: sqlite.Row[] = [];
    try {
      rows = (this.query as sqlite.Statement).all([this.since]);
    } catch (err) {   // the file was replaced or the permission withdrawn: open it again next time
      this.problem = (err as Error).message;
      (this.query as sqlite.Statement).finalize();
      db.close();
      this.query = null;
      this.db = null;
      return out;
    }
    for (const r of rows) {
      const id = hex(r.bytes('uuid'));
      if (this.seen.indexOf(id) >= 0) continue;
      const at = r.number('delivered_date');
      if (at > this.since) this.since = at;
      this.seen.push(id);
      out.push(fromRecord(id, r.text('identifier'), mac.plist(r.bytes('data')), at, r.isNull('presented') || r.number('presented') !== 0));
    }
    if (this.seen.length > 400) this.seen = this.seen.slice(this.seen.length - 200);
    return out;
  }

  /** The shape of the newest records, never their values: for each, the app's id, `presented` and `style`, then one line per key path of
   *  its plist with the value's type and size ("/req/titl string 12", "/req/cnta/$plist/$objects/7 data 5832 png"). What the owner runs
   *  once (`--inspect`) so the record's schema (where the avatars are) is learnt without reading anyone's messages. */
  shapes(limit: i32): string[] {
    const out: string[] = [];
    if (this.db === null && !this.open()) { out.push('cannot read the database: ' + this.problem); return out; }
    const st = (this.db as sqlite.Database).prepare('SELECT a.identifier, r.data, r.presented, r.style FROM record r JOIN app a ON a.app_id = r.app_id ORDER BY r.rec_id DESC LIMIT ?');
    for (const r of st.all([limit])) {
      out.push('record of ' + r.text('identifier') + ' presented ' + r.text('presented') + ' style ' + r.text('style'));
      shape(mac.plist(r.bytes('data')), '', out);
    }
    st.finalize();
    return out;
  }
}

/** What a string is, never what it says: a keyed archive's reference, a file (and whether it is a readable image), a URL's scheme, a UUID. */
function kindOf(s: string): string {
  if (s.startsWith('<CFKeyedArchiverUID')) { const i = s.indexOf('value = '); return ' uid ' + (i >= 0 ? s.slice(i + 8, s.indexOf('}', i)) : '?'); }
  if (s.startsWith('/') || s.startsWith('file://')) return (s.startsWith('/') ? ' path' : ' file-url') + (mac.imagePng(s, 8).length > 0 ? ' image' : ' not-an-image');
  const c = s.indexOf(':');
  if (c > 0 && c < 64 && /^[A-Za-z][A-Za-z0-9+.-]*$/.test(s.slice(0, c))) return ' url ' + s.slice(0, c) + (s.slice(c, c + 3) === '://' ? '://' : ':');
  if (s.indexOf('/') > 0) return ' relative-path';
  if (s.length === 36 && s.charAt(8) === '-' && s.charAt(13) === '-') return ' uuid';
  return '';
}
function shape(v: any, path: string, out: string[]): void {
  if (out.length > 4000) return;
  if (v === null || v === undefined) { out.push('  ' + path + ' null'); return; }
  if (typeof v === 'string') { out.push('  ' + path + ' string ' + (v as string).length + kindOf(v as string)); return; }
  if (typeof v === 'number' || typeof v === 'boolean') { out.push('  ' + path + ' ' + typeof v); return; }
  if (Array.isArray(v)) { const a = v as any[]; out.push('  ' + path + ' array ' + a.length); for (let i = 0; i < a.length; i++) shape(a[i], path + '/' + i, out); return; }
  if (typeof v['$data'] === 'string') {
    const b = v['$data'] as string;
    out.push('  ' + path + ' data ' + Math.floor(b.length * 3 / 4) + (isImage(base64Decode(b.slice(0, 24))) ? ' image' : ''));
    return;
  }
  if (v['$plist'] !== undefined) { shape(v['$plist'], path + '/$plist', out); return; }
  if (Array.isArray(v['$keys'])) for (const k of v['$keys'] as string[]) shape(v[k], path + '/' + k, out);
}
