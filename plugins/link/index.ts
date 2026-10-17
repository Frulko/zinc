// zinc:link: two Zinc programs find each other on the local network, pair once with a 6-digit code, then talk over an authenticated,
// encrypted channel that reconnects by itself while both are paired (docs/plugins/link.md). The protocol is zinc agent's (DNS-SD, TLS
// EC J-PAKE with the code, TLS 1.3 with the paired key); this file holds the policy: the instances seen, reconnecting, promises.
import L from './native/link.spec';
import { env } from 'zinc:sys';

/** Where to reach a program: an address typed by the user when the network blocks discovery, or a Peer. */
export interface Address { host: string; port: number; }

/** A program seen on the network, or paired with this one. */
export interface Peer {
  id: string;
  name: string;
  host: string;
  port: number;
  service: string;
  /** It has a pairing open (it shows a code). */
  pairing: boolean;
  /** This program holds a key for it. */
  paired: boolean;
}

export interface InitOptions {
  /** How this program presents itself to its peers (default: the app's name). */
  name?: string;
  /** The file that keeps its identity and its peers' keys (default: $ZINC_HOME/link/<app>.keys, mode 0600). */
  store?: string;
}

export interface AdvertiseOptions {
  /** What the program offers ("notify"): browse(service) on the other side finds it. */
  service: string;
  /** The name shown in the other side's list (default: the name of init()). */
  name?: string;
  /** The TCP port (default 7744, or any free one when it is taken). */
  port?: number;
}

export const DEFAULT_PORT: number = 7744;

const SEEN_MS = 12000;     // an instance not heard for this long is gone
const ASK_MS = 4000;       // a question on the network this often while browsing
const RETRY_MAX_MS = 30000;

let ready = false;
let selfId = '';
let selfName = '';
let serverPort = -1;
let advertised = '';

/** A conversation with one peer. One made by connect() reconnects by itself after a drop while the peer is paired; close() ends it. */
export class Channel {
  peer: Peer;
  connected: boolean = false;
  handle: i32 = -1;
  readonly mine: boolean;   // made by connect(): this side reconnects
  ended: boolean = false;
  retryMs: number = 1000;
  retry: i32 = -1;
  openCbs: (() => void)[] = [];
  messageCbs: ((msg: any) => void)[] = [];
  bytesCbs: ((kind: i32, bytes: u8[]) => void)[] = [];
  closeCbs: ((reason: string) => void)[] = [];

  constructor(peer: Peer, mine: boolean) { this.peer = peer; this.mine = mine; }

  /** Sends a value as JSON; false while disconnected (nothing is queued). */
  send(msg: any): boolean { return this.connected && L.send(this.handle, JSON.stringify(msg)); }
  /** Sends bytes with a kind of 0 to 255 (at most 1 MiB); false while disconnected. */
  sendBytes(kind: i32, bytes: u8[]): boolean { return this.connected && L.sendBytes(this.handle, kind, bytes); }
  /** Each time the channel is up (again). */
  onOpen(cb: () => void): Channel { this.openCbs.push(cb); if (this.connected) cb(); return this; }
  /** Each JSON message, parsed. */
  onMessage(cb: (msg: any) => void): Channel { this.messageCbs.push(cb); return this; }
  onBytes(cb: (kind: i32, bytes: u8[]) => void): Channel { this.bytesCbs.push(cb); return this; }
  /** Each drop, with its reason ('' when the peer ended it); a channel of connect() then tries again unless the peer refused it. */
  onClose(cb: (reason: string) => void): Channel { this.closeCbs.push(cb); return this; }
  close(): void {
    this.ended = true;
    if (this.retry >= 0) { clearTimeout(this.retry); this.retry = -1; }
    if (this.handle >= 0) { L.close(this.handle); chans.delete(this.handle); this.handle = -1; }
    this.connected = false;
  }

  dial(): void {
    this.retry = -1;
    if (this.ended) return;
    const at = seen.get(this.peer.id);   // where discovery saw it last, else where it was
    if (at !== undefined) { this.peer.host = at.host; this.peer.port = at.port; }
    const h = L.connect(this.peer.host, this.peer.port, this.peer.id);
    if (h < 0) { this.dropped(L.error()); return; }
    this.handle = h;
    chans.set(h, this);
    watch();
  }
  opened(): void {
    this.connected = true;
    this.retryMs = 1000;
    for (const cb of this.openCbs) cb();
  }
  dropped(reason: string): void {
    if (this.handle >= 0) chans.delete(this.handle);
    this.handle = -1;
    this.connected = false;
    for (const cb of this.closeCbs) cb(reason);
    if (!this.mine || this.ended) return;
    if (reason.startsWith('the peer does not accept') || !isPaired(this.peer.id)) { this.ended = true; return; }   // pair again first
    this.retry = setTimeout(() => this.dial(), this.retryMs);
    this.retryMs = this.retryMs * 2 > RETRY_MAX_MS ? RETRY_MAX_MS : this.retryMs * 2;
  }
}

const chans = new Map<i32, Channel>();
const pairs = new Map<i32, (p: Peer | null, why: string) => void>();
const seen = new Map<string, Peer>();
const heard = new Map<string, number>();
let browsing = '';
let browseCb: ((peer: Peer, present: boolean) => void) | null = null;
let browseTimer: i32 = -1;
const acceptCbs: ((ch: Channel) => void)[] = [];
const pairedCbs: ((peer: Peer) => void)[] = [];
const pairingCbs: ((state: string) => void)[] = [];

function peerOf(j: any, pairing: boolean): Peer {
  const id = '' + j.id;
  return { id: id, name: '' + j.name, host: '' + j.host, port: j.port as number, service: '' + j.service, pairing: pairing, paired: isPaired(id) };
}

function isPaired(id: string): boolean {
  for (const p of peers()) if (p.id === id) return true;
  return false;
}

// The native side's events, taken on a timer while something is open (a server, a browse, a channel, a pairing): no native callback, so
// the three engines run this file alike.
const PUMP_MS = 10;
let pump: i32 = -1;
const NONE: u8[] = [];
function watch(): void { if (pump < 0) pump = setInterval(drain, PUMP_MS); }
function drain(): void {
  for (let i = 0; i < 64; i++) {
    const e = L.next();
    if (e === '') break;
    const a = e.indexOf('\u001f');
    const b = e.indexOf('\u001f', a + 1);
    const kind = parseInt(e.slice(0, a));
    try { onEvent(parseInt(e.slice(a + 1, b)), kind, e.slice(b + 1), kind === 5 ? L.bytes() : NONE); } catch (x) { console.error('zinc:link: ' + (x as Error).message); }
  }
  if (serverPort < 0 && browsing === '' && chans.size === 0 && pairs.size === 0 && pump >= 0) { clearInterval(pump); pump = -1; }
}

function onEvent(h: i32, kind: i32, text: string, bytes: u8[]): void {
  if (kind === 0) { found(JSON.parse(text)); return; }
  if (kind === 7) { for (const cb of pairingCbs) cb(text); return; }
  if (kind === 1) {
    const p = peerOf(JSON.parse(text), false);
    p.paired = true;
    const done = pairs.get(h);
    if (done !== undefined) { pairs.delete(h); done(p, ''); }
    for (const cb of pairedCbs) cb(p);
    for (const cb of pairingCbs) cb('paired');
    return;
  }
  if (kind === 3) {   // a peer opened a session to this program
    const p = peerOf(JSON.parse(text), false);
    p.paired = true;
    const ch = new Channel(p, false);
    ch.handle = h;
    chans.set(h, ch);
    ch.connected = true;
    for (const cb of acceptCbs) cb(ch);
    return;
  }
  if (kind === 6) {
    const done = pairs.get(h);
    if (done !== undefined) { pairs.delete(h); done(null, text); return; }
  }
  const ch = chans.get(h);
  if (ch === undefined) return;
  if (kind === 2) ch.opened();
  else if (kind === 4) { const m = JSON.parse(text); for (const cb of ch.messageCbs) cb(m); }
  else if (kind === 5) { const k = parseInt(text); for (const cb of ch.bytesCbs) cb(k, bytes); }
  else if (kind === 6) ch.dropped(text);
}

function found(j: any): void {
  const p = peerOf(j, j.pairing as boolean);
  const before = seen.get(p.id);
  seen.set(p.id, p);
  heard.set(p.id, Date.now());
  const changed = before === undefined || before.host !== p.host || before.port !== p.port || before.pairing !== p.pairing || before.name !== p.name;
  const cb = browseCb;
  if (changed && cb !== null) cb(p, true);
}

function ask(): void {
  if (browsing === '') return;
  L.browse(browsing);
  const now = Date.now();
  const gone: string[] = [];
  heard.forEach((at: number, id: string) => { if (now - at > SEEN_MS) gone.push(id); });
  for (const id of gone) {
    const p = seen.get(id);
    heard.delete(id);
    seen.delete(id);
    const cb = browseCb;
    if (p !== undefined && cb !== null) cb(p, false);
  }
}

/** Loads this program's identity and paired peers (once; again to change them). Its id. */
export function init(opts: InitOptions = {}): string {
  selfName = opts.name ?? (env('ZINC_APP_NAME') !== '' ? env('ZINC_APP_NAME') : 'zinc');
  selfId = L.init(opts.store ?? '', selfName);
  ready = true;
  return selfId;
}
function ensure(): void { if (!ready) init({}); }

/** This program's id (16 hex digits): what its peers know it by. */
export function id(): string { ensure(); return selfId; }

/** Announces this program for `service` and accepts pairings and sessions; the TCP port it listens on. Throws when it cannot listen. */
export function advertise(opts: AdvertiseOptions): number {
  ensure();
  if (serverPort < 0) {
    serverPort = L.listen(opts.port ?? DEFAULT_PORT);
    if (serverPort < 0 && opts.port === undefined) serverPort = L.listen(0);   // the default port is taken: any other, said in the record
    if (serverPort < 0) throw new Error('zinc:link: ' + L.error());
  }
  watch();
  advertised = opts.service;
  if (!L.advertise(opts.service, opts.name ?? selfName)) console.error('zinc:link: not announced (' + L.error() + '); the address can still be typed');
  return serverPort;
}
export function stopAdvertising(): void { if (advertised !== '') { L.advertise('', ''); advertised = ''; } }

/** The programs that offer `service`: cb(peer, true) when one appears or changes (address, open pairing), cb(peer, false) when it is gone. */
export function browse(service: string, cb: (peer: Peer, present: boolean) => void): void {
  ensure();
  browsing = service;
  browseCb = cb;
  seen.clear();
  heard.clear();
  if (!L.browse(service)) console.error('zinc:link: ' + L.error());
  watch();
  if (browseTimer < 0) browseTimer = setInterval(ask, ASK_MS);
}
export function stopBrowsing(): void {
  browsing = '';
  browseCb = null;
  L.browse('');
  if (browseTimer >= 0) { clearInterval(browseTimer); browseTimer = -1; }
}

/** Opens a pairing: the 6-digit code to show, valid five minutes, three tries, for one peer. advertise() first. */
export function openPairing(): string {
  ensure();
  const c = L.openPairing();
  if (c === '') throw new Error('zinc:link: ' + L.error());
  return c;
}
export function closePairing(): void { L.closePairing(); }
/** The advertiser's pairing: 'try 1', 'try 2' (a wrong code), 'closed' (three wrong codes, or five minutes), 'paired'. */
export function onPairing(cb: (state: string) => void): void { ensure(); pairingCbs.push(cb); }
/** A pairing that succeeded, on either side. */
export function onPaired(cb: (peer: Peer) => void): void { ensure(); pairedCbs.push(cb); }

/** Pairs with the program at `to` (a Peer of browse(), or an address typed by the user) with the code it shows. */
export function pair(to: Address, code: string): Promise<Peer> {
  ensure();
  return new Promise<Peer>((resolve, reject) => {
    const h = L.pair(to.host, to.port, code.trim());
    if (h < 0) { reject(new Error('zinc:link: ' + L.error())); return; }
    pairs.set(h, (p: Peer | null, why: string) => { if (p !== null) resolve(p); else reject(new Error('zinc:link: ' + why)); });
    watch();
  });
}

/** A channel to a paired peer; it opens as soon as the peer answers and reconnects after a drop. Throws when the peer is not paired. */
export function connect(peer: Peer): Channel {
  ensure();
  if (!isPaired(peer.id)) throw new Error('zinc:link: not paired with ' + peer.name + ' (' + peer.id + ')');
  const ch = new Channel(peer, true);
  ch.dial();
  return ch;
}

/** Each channel a paired peer opens to this program (advertise() first). */
export function onConnection(cb: (ch: Channel) => void): void { ensure(); acceptCbs.push(cb); }

/** The paired peers, from the store. */
export function peers(): Peer[] {
  ensure();
  const out: Peer[] = [];
  const list = JSON.parse(L.peers());
  for (let i = 0; i < (list.length as i32); i++) {
    const j = list[i];
    out.push({ id: '' + j.id, name: '' + j.name, host: '' + j.host, port: j.port as number, service: '' + j.service, pairing: false, paired: true });
  }
  return out;
}

/** Forgets a peer: its key, and its open channels. */
export function forget(peerId: string): boolean { ensure(); return L.forget(peerId); }

/** This machine's IPv4 addresses on its networks: what to show for typing on the other side when discovery is blocked. */
export function addresses(): string[] {
  const a = L.addresses();
  return a === '' ? [] : a.split(',');
}
