// The sender's picture of a message, as a 128 px square PNG ready for a round crop. Sources, tried in order (README, "Avatars"):
//   1. the record: an image in its plist (a communication notification's identity image, a keyed archive inside it, an image file's
//      path), or an attachment of Notification Center's attachment store named by a uuid of the record;
//   2. Messages: the handle (phone or email) of the incoming message at the notification's time in ~/Library/Messages/chat.db, then that
//      contact's photo (Contacts);
//   3. Contacts by the sender's name (the exact full name, else the only contact that matches);
//   4. a monogram: the initials on a gradient chosen by a hash of the name. The tablet never shows an empty avatar.
// A picture found for a sender is kept for the run. Names, photos and messages are never logged; only which source answered.
import * as fs from 'zinc:fs';
import * as sqlite from 'zinc:sqlite';
import { env } from 'zinc:sys';
import * as mac from 'zinc:notifymac';
import { Notif, MAC_EPOCH, initials, gradientOf, GRADIENTS } from './model';

export const AVATAR_PX: i32 = 128;

function home(): string { return env('HOME'); }
/** The attachment stores of Notification Center (macOS 15's group container, and the per-user directory of earlier systems). */
function attachmentDirs(dbPath: string): string[] {
  const d = env('RELAY_ATTACHMENTS');
  if (d !== '') return [d];
  const db2 = dbPath.slice(0, dbPath.lastIndexOf('/'));
  return [db2.slice(0, db2.lastIndexOf('/')) + '/attachments', home() + '/Library/Group Containers/group.com.apple.usernoted/attachments'];
}
/** The first image file under `dir` whose path holds `uuid` (a folder per attachment, or a file named after it). */
function findAttachment(dir: string, uuid: string, depth: i32): string {
  let names: string[] = [];
  try { names = fs.list(dir); } catch (e) { return ''; }
  for (const n of names) {
    const p = dir + '/' + n;
    const inside = n.toUpperCase().indexOf(uuid) >= 0;
    let isDir = false;
    try { isDir = fs.stat(p).isDirectory; } catch (e) { continue; }
    if (isDir && depth < 3) { const f = findAttachment(p, inside ? '' : uuid, depth + 1); if (f !== '') return f; }
    else if (!isDir && (inside || uuid === '')) return p;
  }
  return '';
}

export class Avatars {
  dbPath: string;
  private bySender: Map<string, u8[]> = new Map<string, u8[]>();
  private messages: sqlite.Database | null = null;
  private messagesTried = false;
  /** Which source gave each avatar this run: record, messages, contacts, monogram (what the settings show). */
  counts: Map<string, i32> = new Map<string, i32>();
  constructor(dbPath: string) { this.dbPath = dbPath; }

  private fromRecord(n: Notif): u8[] {
    for (const s of n.avatars) {
      if (s.startsWith('uuid:')) {
        for (const d of attachmentDirs(this.dbPath)) {
          const f = findAttachment(d, s.slice(5), 0);
          if (f !== '') { const png = mac.imagePng(f, AVATAR_PX); if (png.length > 0) return png; }
        }
        continue;
      }
      const png = mac.imagePng(s, AVATAR_PX);
      if (png.length > 0) return png;
    }
    return [];
  }

  /** The handle of the incoming message nearest the notification's time (within a minute) in Messages' database; '' when none. */
  private messagesHandle(n: Notif): string {
    if (!this.messagesTried) {
      this.messagesTried = true;
      const p = env('RELAY_MESSAGES_DB') !== '' ? env('RELAY_MESSAGES_DB') : home() + '/Library/Messages/chat.db';
      if (mac.openError(p) === 0) try { this.messages = new sqlite.Database(p, { readOnly: true, create: false }); } catch (e) { this.messages = null; }
    }
    const db = this.messages;
    if (db === null || n.date <= 0) return '';
    const at = (n.date - MAC_EPOCH) * 1e9;   // message.date: nanoseconds since 2001 (macOS 10.13 and later)
    try {
      const st = db.prepare('SELECT h.id AS handle FROM message m JOIN handle h ON h.ROWID = m.handle_id WHERE m.is_from_me = 0 AND m.date BETWEEN ? AND ? ORDER BY abs(m.date - ?) LIMIT 1');
      const r = st.get([at - 60e9, at + 60e9, at]);
      st.finalize();
      return r === null ? '' : r.text('handle');
    } catch (e) {
      return '';
    }
  }

  private count(source: string): void { const c = this.counts.get(source); this.counts.set(source, c === undefined ? 1 : c + 1); }

  /** The sender's picture for a message (a PNG, never empty for a message with a sender), and which source gave it. */
  of(n: Notif): u8[] {
    const key = n.app + '\u001f' + n.sender;
    let png = this.fromRecord(n);
    let source = 'record';
    if (png.length === 0) {
      const kept = this.bySender.get(key);
      if (kept !== undefined) { png = kept; source = 'cache'; }
    }
    if (png.length === 0 && n.app === 'com.apple.MobileSMS') {
      const h = this.messagesHandle(n);
      if (h !== '') { png = mac.contactImage(h, '', AVATAR_PX); source = 'messages'; }
    }
    if (png.length === 0 && n.sender !== '') { png = mac.contactImage('', n.sender, AVATAR_PX); source = 'contacts'; }
    if (png.length > 0 && source !== 'cache') this.bySender.set(key, png);
    if (png.length === 0) {
      const g = gradientOf(n.sender);
      png = mac.monogram(initials(n.sender), GRADIENTS[g], GRADIENTS[g + 1], AVATAR_PX);
      source = 'monogram';
    }
    this.count(source);
    console.log('avatar ' + source);
    return png;
  }
}
