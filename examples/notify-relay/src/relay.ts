// The tablet's side of the wire: zinc:link finds the tablets that advertise `notify`, pairs with the code one shows, and keeps a channel
// to the paired one (it reconnects by itself). On it, the relay protocol (docs/reports/notification-relay-design.md): hello after each
// connection, notif, icon once per hash and connection (need-icon asks again; avatars travel the same way), and from the tablet mute,
// open (the person tapped a notification) and ack (one arrived). Notifications wait in a bounded queue while the tablet is away.
import * as link from 'zinc:link';
import * as mac from 'zinc:notifymac';
import { sha256, base64Encode } from 'zinc:web';
import { Notif } from './model';
import { extract } from './emoji';

/** Notifications kept while the tablet is away; older ones are dropped first. */
export const QUEUE_MAX: i32 = 100;
export const ICON_PX: i32 = 128;
/** Notifications the tablet can still open by a tap. */
export const RECENT_MAX: i32 = 50;

function hex(b: u8[]): string {
  const d = '0123456789abcdef';
  let s = '';
  for (const x of b) s += d.charAt(x >> 4) + d.charAt(x & 15);
  return s;
}

export class Relay {
  service: string;
  host: string;
  /** The tablets discovery sees now (those with a pairing open show a code). */
  found: link.Peer[] = [];
  /** The paired tablet, null before the first pairing. */
  peer: link.Peer | null = null;
  /** What the menu shows: 'not paired', 'connecting', 'connected', or why the tablet is away. */
  state: string = 'not paired';
  /** Notifications sent since the start, and dropped from a full queue. */
  sent: i32 = 0;
  dropped: i32 = 0;
  queue: any[] = [];
  private ch: link.Channel | null = null;
  private iconOf: Map<string, string> = new Map<string, string>();   // app id -> the hash of its icon ('' when it has none)
  private pngOf: Map<string, string> = new Map<string, string>();    // hash -> the PNG in base64
  private given: string[] = [];                                       // hashes sent on this connection
  private changed: () => void;
  /** What the tablet asks: mute (app or domain), open (a notification id), ack (a notification id). */
  private asked: (what: string, a: string, b: string) => void;
  /** The last relayed notifications, to open one the person taps on the tablet: id -> [app id, url]. */
  private recent: Map<string, string[]> = new Map<string, string[]>();
  private recentIds: string[] = [];

  constructor(service: string, host: string, changed: () => void, asked: (what: string, a: string, b: string) => void) {
    this.service = service; this.host = host; this.changed = changed; this.asked = asked;
  }

  /** Connects to the tablet paired before (the last one) and starts looking for tablets. */
  start(): void {
    const known = link.peers().filter((p: link.Peer) => p.service === this.service || p.service === '');
    if (known.length > 0) this.open(known[known.length - 1]);
    link.browse(this.service, (p: link.Peer, present: boolean) => {
      this.found = this.found.filter((q: link.Peer) => q.id !== p.id);
      if (present) this.found.push(p);
      this.changed();
    });
  }

  /** Pairs with a tablet that shows `code` (one discovery found, or an address typed by hand) and makes it the tablet. */
  pair(to: link.Address, code: string): Promise<string> {
    this.state = 'pairing';
    this.changed();
    return link.pair(to, code).then((p: link.Peer) => {
      const old = this.peer;
      if (old !== null && old.id !== p.id) link.forget(old.id);
      this.open(p);
      return p.name;
    }).catch((e: Error) => {
      this.state = this.peer === null ? 'not paired' : this.state;
      this.changed();
      throw e;
    });
  }

  /** Forgets the tablet: its key is gone, pairing again needs a new code. */
  forget(): void {
    const p = this.peer;
    if (this.ch !== null) { (this.ch as link.Channel).close(); this.ch = null; }
    if (p !== null) link.forget(p.id);
    this.peer = null;
    this.state = 'not paired';
    this.changed();
  }

  connected(): boolean { return this.ch !== null && (this.ch as link.Channel).connected; }

  private open(p: link.Peer): void {
    if (this.ch !== null) (this.ch as link.Channel).close();
    this.peer = p;
    this.state = 'connecting';
    const ch = link.connect(p);
    this.ch = ch;
    ch.onOpen(() => {
      this.given = [];
      this.state = 'connected';
      ch.send({ t: 'hello', app: 'notify-relay', v: 1, host: this.host });
      const waiting = this.queue;
      this.queue = [];
      for (const m of waiting) this.deliver(m);
      this.changed();
    });
    ch.onMessage((m: any) => this.heard(m));
    ch.onClose((why: string) => { this.state = why === '' ? 'the tablet left' : why; this.changed(); });
  }

  private heard(m: any): void {
    const t = '' + m.t;
    if (t === 'need-icon') this.giveIcon('' + m.hash, true);
    else if (t === 'mute') this.asked('mute', typeof m.app === 'string' ? m.app as string : '', typeof m.domain === 'string' ? m.domain as string : '');
    else if (t === 'ack') this.asked('ack', '' + m.id, '');
    else if (t === 'open') {
      const r = this.recent.get('' + m.id);
      this.asked('open', r === undefined ? '' : r[0], r === undefined ? '' : r[1]);
    }
  }

  /** Keeps an image (an icon or an avatar as PNG, an attachment as JPEG) to send by its hash; the hash ('' for none). */
  keep(png: u8[]): string {
    if (png.length === 0) return '';
    const hash = hex(sha256(png));
    if (!this.pngOf.has(hash)) this.pngOf.set(hash, base64Encode(png));
    return hash;
  }
  /** The hash of the app's icon (its 128 px PNG), drawn once per app; '' when it has none. */
  icon(app: string): string {
    const h = this.iconOf.get(app);
    if (h !== undefined) return h;
    const hash = this.keep(mac.appIcon(app, ICON_PX));
    this.iconOf.set(app, hash);
    return hash;
  }
  /** The PNG of an icon by its hash, [] when unknown (the settings window draws it). */
  png(hash: string): string { const p = this.pngOf.get(hash); return p === undefined ? '' : p; }

  private giveIcon(hash: string, again: boolean): void {
    if (hash === '' || this.ch === null || (!again && this.given.indexOf(hash) >= 0)) return;
    const png = this.pngOf.get(hash);
    if (png === undefined) return;
    if ((this.ch as link.Channel).send({ t: 'icon', hash: hash, png: png }) && this.given.indexOf(hash) < 0) this.given.push(hash);
  }

  private deliver(m: any): void {
    if (!this.connected()) { if (this.peer !== null) this.wait(m); return; }   // no tablet yet: nothing to keep them for
    this.giveIcon('' + m.app.icon, false);
    if (m.avatar !== null) this.giveIcon('' + m.avatar, false);
    if (m.attachment !== undefined && m.attachment !== null) this.giveIcon('' + m.attachment, false);
    if ((this.ch as link.Channel).send(m)) this.sent++;
    else this.wait(m);
  }
  private wait(m: any): void {
    this.queue.push(m);
    while (this.queue.length > QUEUE_MAX) { this.queue.shift(); this.dropped++; }
  }

  /** Sends a notification that passed the filters (or keeps it until the tablet is back); `avatar` is the hash of the sender's image. */
  relay(n: Notif, appName: string, domain: string, avatar: string, attachment: string = ''): void {
    const et = extract(n.title), es = extract(n.subtitle), eb = extract(n.body);
    const m: any = { t: 'notif', id: n.id, app: { id: n.app, name: appName, icon: this.icon(n.app) }, title: et.text, subtitle: es.text, body: eb.text,
      date: n.date, domain: domain === '' ? null : domain, thread: n.thread, kind: n.kind, sender: n.kind === 'message' ? n.sender : '', avatar: avatar === '' ? null : avatar,
      emoji: et.images.concat(es.images).concat(eb.images), attachment: attachment === '' ? null : attachment };
    this.recent.set(n.id, [n.app, n.url]);
    this.recentIds.push(n.id);
    while (this.recentIds.length > RECENT_MAX) this.recent.delete(this.recentIds.shift() as string);
    this.deliver(m);
  }
}
