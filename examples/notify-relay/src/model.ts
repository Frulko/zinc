// What Zinc Relay knows and decides, with no system call: a notification read from Notification Center's record, the site of a web
// notification, and the settings (every app and site seen so far, allowed or blocked) that say what goes to the tablet.
import { base64Decode } from 'zinc:web';

/** One notification as Notification Center delivered it. */
export class Notif {
  id: string;          // the record's uuid (hex)
  app: string;         // the bundle id of the app that sent it (a browser's alert helper counts as the browser)
  title: string = '';
  subtitle: string = '';
  body: string = '';
  thread: string = '';
  date: number = 0;    // seconds since 1970
  /** The Mac showed it (a banner or an alert): false when a Focus held it back, or the app's notifications are silent. */
  presented: boolean = true;
  /** Where clicking it leads (the request's default action URL, `durl`), '' when the app itself. */
  url: string = '';
  /** 'message' for a messaging app or a record with a sender's image, else 'other'. */
  kind: string = 'other';
  /** The sender of a message (its title, as messaging apps post them), '' otherwise. */
  sender: string = '';
  /** Where the sender's image may be, best first (avatarSources). */
  avatars: string[] = [];
  /** From the communication context (`uncc`): the sender's handle (a phone or an address, '' when the app has no service), Contacts identifier. */
  /** What the message carries (a photo sent with it): Notification Center's attachments, never the sender's picture. */
  attachments: string[] = [];
  senderHandle: string = '';
  senderContact: string = '';
  constructor(id: string, app: string) { this.id = id; this.app = app; }
}

/** Seconds between 1970 and 2001, the epoch of Notification Center's dates (Core Foundation's absolute time). */
export const MAC_EPOCH: number = 978307200;

/** A field of the record's request: text, or (Screen Time and other system senders) a localisation key with its arguments. */
function text(v: any): string {
  if (typeof v === 'string') return v as string;
  if (Array.isArray(v)) {
    const parts: string[] = [];
    const a = v as any[];
    for (let i = 0; i < a.length; i++) if (typeof a[i] === 'string') parts.push(a[i] as string);
    return parts.join(' ');
  }
  return '';
}

/** Chrome posts alert-style notifications through a helper app of its own; the person knows it as Chrome. */
export function appOf(bundleId: string): string {
  const helper = '.framework.alertnotificationservice';
  return bundleId.toLowerCase().endsWith(helper) ? bundleId.slice(0, bundleId.length - helper.length) : bundleId;
}

/** Messaging apps: their notifications are messages from someone (the tablet shows the sender and the avatar). */
const MESSAGING: string[] = ['com.apple.MobileSMS', 'com.apple.iChat', 'net.whatsapp.WhatsApp', 'desktop.WhatsApp', 'ru.keepcoder.Telegram', 'org.telegram.desktop',
  'org.whispersystems.signal-desktop', 'com.tinyspeck.slackmacgap', 'com.hnc.Discord', 'com.facebook.archon', 'com.facebook.archon.developerID',
  'com.microsoft.teams2', 'com.microsoft.teams', 'jp.naver.line.mac', 'com.viber.osx', 'im.riot.app', 'com.skype.skype', 'com.apple.FaceTime'];
// Bundle ids are case-insensitive: Notification Center records Messages as `com.apple.mobilesms` (macOS 15.7)
function listed(list: string[], bundleId: string): boolean { const id = bundleId.toLowerCase(); for (const x of list) if (x.toLowerCase() === id) return true; return false; }
export function isMessaging(bundleId: string): boolean { return listed(MESSAGING, bundleId); }

/** The notification of a record of Notification Center (`record.data`, a property list: {app, date, req: {titl, subt, body, thre, iden,
 *  durl, ...}}, `presented` and `delivered_date` from the row). */
export function fromRecord(id: string, bundleId: string, plist: any, delivered: number, presented: boolean): Notif {
  const n = new Notif(id, appOf(bundleId));
  n.date = delivered > 0 ? Math.round(delivered + MAC_EPOCH) : 0;
  n.presented = presented;
  if (plist === null || typeof plist !== 'object') return n;
  const req = plist.req;
  if (req !== undefined && req !== null && typeof req === 'object') {
    n.title = text(req.titl);
    n.subtitle = text(req.subt);
    n.body = text(req.body);
    n.thread = text(req.thre);
    const u = text(req.durl);
    if (u.indexOf(':') > 0) n.url = u;
  }
  n.avatars = avatarSources(plist);
  n.attachments = attachmentSources(plist);
  const cs = req !== undefined && req !== null && typeof req === 'object' ? communicationSender(req.uncc) : ['', '', ''];
  if (cs[0] !== '') { n.kind = 'message'; n.sender = cs[0]; n.senderHandle = cs[1]; n.senderContact = cs[2]; }
  const imageOfSomeone = n.avatars.length > 0 && !n.avatars[0].startsWith('3:');
  if (n.sender === '' && (isMessaging(n.app) || imageOfSomeone)) { n.kind = 'message'; n.sender = n.title; }
  for (let i = 0; i < n.avatars.length; i++) n.avatars[i] = n.avatars[i].slice(2);
  return n;
}

/** A keyed archive's reference ("<CFKeyedArchiverUID 0x...>{value = 6}", as the plist reaches us) as its index, -1 when not one. */
function uidOf(v: any): i32 {
  if (typeof v !== 'string') return -1;
  const s = v as string, i = s.indexOf('value = ');
  return s.startsWith('<CFKeyedArchiverUID') && i >= 0 ? parseInt(s.slice(i + 8)) as i32 : -1;
}
/** The sender of a communication notification (UNNotificationCommunicationContext, `req.uncc`: Messages, Discord, WhatsApp...): its name,
 *  handle (only with a service: a phone or an address) and Contacts identifier, each '' when absent. */
export function communicationSender(uncc: any): string[] {
  const none = ['', '', ''];
  if (uncc === null || uncc === undefined || typeof uncc !== 'object' || uncc['$plist'] === undefined) return none;
  const p = uncc['$plist'];
  if (p === null || typeof p !== 'object' || !Array.isArray(p['$objects']) || p['$top'] === undefined) return none;
  const objs = p['$objects'] as any[];
  const at = (v: any): any => { const i = uidOf(v); return i > 0 && i < objs.length ? objs[i] : null; };
  const str = (v: any): string => { const o = at(v); return typeof o === 'string' ? o as string : ''; };
  const root = at(p['$top']['root']);
  if (root === null || typeof root !== 'object') return none;
  const who = at(root['sender']);
  if (who === null || typeof who !== 'object') return none;
  const name = str(who['displayName']) !== '' ? str(who['displayName']) : str(root['displayName']);
  return [name, str(who['serviceName']) !== '' ? str(who['handle']) : '', str(who['cnContactIdentifier'])];
}

// ---------------------------------------------------------------- the sender's image in a record

function b64Head(b64: string): u8[] { return base64Decode(b64.slice(0, 24)); }
/** Whether bytes start like a picture: PNG, JPEG, GIF, TIFF, or HEIF/AVIF (an ISO box `ftyp`). */
export function isImage(h: u8[]): boolean {
  if (h.length < 12) return false;
  if (h[0] === 0x89 && h[1] === 0x50 && h[2] === 0x4e && h[3] === 0x47) return true;
  if (h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff) return true;
  if (h[0] === 0x47 && h[1] === 0x49 && h[2] === 0x46) return true;
  if ((h[0] === 0x49 && h[1] === 0x49 && h[2] === 0x2a) || (h[0] === 0x4d && h[1] === 0x4d && h[3] === 0x2a)) return true;
  return h[4] === 0x66 && h[5] === 0x74 && h[6] === 0x79 && h[7] === 0x70;
}
function isUuid(s: string): boolean {
  if (s.length !== 36) return false;
  for (let i = 0; i < 36; i++) {
    const c = s.charCodeAt(i);
    const dash = i === 8 || i === 13 || i === 18 || i === 23;
    if (dash !== (c === 45)) return false;
    if (!dash && !((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102))) return false;
  }
  return true;
}
const IMAGE_EXT: string[] = ['.png', '.jpg', '.jpeg', '.heic', '.gif', '.tiff', '.webp'];
/** How likely a key path leads to the sender: 0 a communication context's identity image, 1 the people or the attachments, 2 an image
 *  elsewhere, 3 an icon (often the app's own). */
function rank(path: string): i32 {
  const p = path.toLowerCase();
  if (p.indexOf('identity') >= 0 || p.indexOf('avatar') >= 0 || p.indexOf('contentimage') >= 0) return 0;
  if (p.indexOf('cnta') >= 0 || p.indexOf('peop') >= 0 || p.indexOf('srce') >= 0 || p.indexOf('atta') >= 0 || p.indexOf('communication') >= 0 || p.indexOf('image') >= 0) return 1;
  if (p.endsWith('/icon') || p.indexOf('icon') >= 0) return 3;
  return 2;
}
function scan(v: any, path: string, out: string[]): void {
  if (v === null || v === undefined || out.length > 16) return;
  if (typeof v === 'string' && path.toLowerCase().indexOf('/atta') >= 0) {   // an attachment: what the message carries, not who sent it
    const s = v as string, low = s.toLowerCase();
    if (isUuid(s)) { out.push('a:uuid:' + s.toUpperCase()); return; }
    if (s.startsWith('/') || s.startsWith('file://')) for (const e of IMAGE_EXT) if (low.endsWith(e)) { out.push('a:' + s); return; }
    return;
  }
  if (typeof v === 'string') {
    const s = v as string;
    const low = s.toLowerCase();
    for (const e of IMAGE_EXT) if ((s.startsWith('/') || s.startsWith('file://')) && low.endsWith(e)) { out.push(rank(path) + ':' + s); return; }
    // a communication context (`uncc`, Discord, Messages...) names its sender's image by a file, a file URL without an extension, or a proxy
    // URL of the Intents image service (Discord, macOS 15.7): tried first
    if ((s.startsWith('/') || s.startsWith('file://') || s.startsWith('intents-remote-image-proxy:')) && path.indexOf('/uncc/') >= 0) { out.push('0:' + s); return; }
    if (isUuid(s) && path.indexOf('/uncc/') >= 0) { out.push('1:uuid:' + s.toUpperCase()); return; }
    if (isUuid(s) && path.toLowerCase().indexOf('atta') >= 0) out.push('1:uuid:' + s.toUpperCase());
    return;
  }
  if (Array.isArray(v)) { const a = v as any[]; for (let i = 0; i < a.length; i++) scan(a[i], path + '/' + i, out); return; }
  if (typeof v !== 'object') return;
  if (typeof v['$data'] === 'string') { const b = v['$data'] as string; if (isImage(b64Head(b))) out.push((path.toLowerCase().indexOf('/atta') >= 0 ? 'a' : '' + rank(path)) + ':' + b); return; }
  if (v['$plist'] !== undefined) { scan(v['$plist'], path + '/$plist', out); return; }
  if (Array.isArray(v['$keys'])) for (const k of v['$keys'] as string[]) scan(v[k], path + '/' + k, out);
}
/** The places a record holds an image of the sender, best first, each as '<rank>:' and a source: base64 bytes, an image file's path,
 *  or 'uuid:<UUID>' (an attachment in Notification Center's attachment store). The record's own plist, keyed archives inside it included. */
/** The images a record carries as attachments (a photo sent in a message), as 'uuid:<UUID>' or a file's path, in order. */
export function attachmentSources(plist: any): string[] {
  const found: string[] = [];
  scan(plist, '', found);
  const out: string[] = [];
  for (const f of found) if (f.startsWith('a:')) out.push(f.slice(2));
  return out;
}
export function avatarSources(plist: any): string[] {
  const found: string[] = [];
  scan(plist, '', found);
  const out: string[] = [];
  for (let r = 0; r <= 3; r++) for (const f of found) if (f.startsWith(r + ':')) out.push(f);
  return out;
}

// ---------------------------------------------------------------- the monogram when there is no image

/** One or two letters of a name, as iOS's contacts show them: "Anna Martin" AM, "anna" A, "+33 6 12" #, "" ?. */
export function initials(name: string): string {
  const words = name.trim().split(' ').filter((w: string) => w.length > 0);
  const letter = (w: string): string => {
    const c = w.charAt(0);
    return c.toUpperCase() !== c.toLowerCase() ? c.toUpperCase() : '';
  };
  if (words.length === 0) return '?';
  const a = letter(words[0]);
  const b = words.length > 1 ? letter(words[words.length - 1]) : '';
  if (a === '' && b === '') return '#';
  return a + b;
}
/** iOS-like gradient pairs (top, bottom) the monogram takes one of, by a hash of the name: the same person always gets the same one. */
export const GRADIENTS: i32[] = [0xa5b4fc, 0x6366f1, 0x93c5fd, 0x3b82f6, 0x86efac, 0x22c55e, 0xfda4af, 0xf43f5e, 0xfdba74, 0xf97316, 0xc4b5fd, 0x8b5cf6, 0x99f6e4, 0x14b8a6, 0xcbd5e1, 0x64748b];
export function gradientOf(name: string): i32 {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h = (h ^ name.charCodeAt(i)) >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return (h % (GRADIENTS.length / 2)) * 2;
}

// ---------------------------------------------------------------- the site of a web notification

/** Browsers whose web notifications go through Notification Center under the browser's own id: the site is in the text. */
const BROWSERS: string[] = ['com.google.Chrome', 'com.google.Chrome.beta', 'com.google.Chrome.dev', 'com.google.Chrome.canary', 'org.chromium.Chromium',
  'com.microsoft.edgemac', 'com.brave.Browser', 'company.thebrowser.Browser', 'com.vivaldi.Vivaldi', 'com.operasoftware.Opera',
  'org.mozilla.firefox', 'org.mozilla.firefoxdeveloperedition', 'org.mozilla.nightly', 'com.apple.Safari', 'com.apple.SafariTechnologyPreview'];

/** Safari's web push: each site is an app of its own, an id of `web.` and the reversed host (legacy push), or a push bundle named after the site. */
function safariSite(bundleId: string): boolean { const id = bundleId.toLowerCase(); return id.startsWith('web.') || id.indexOf('pushbundle') >= 0 || id.startsWith('com.apple.safari.webapp'); }

export function isBrowser(bundleId: string): boolean { return listed(BROWSERS, appOf(bundleId)) || safariSite(bundleId); }

function isLabel(s: string): boolean {
  if (s.length === 0 || s.length > 63 || s.startsWith('-') || s.endsWith('-')) return false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45)) return false;
  }
  return true;
}
/** `token` as a host name ("github.com", "https://www.github.com/x", "(news.example.org)", "example.com:8443"), without "www."; '' when it is not one. */
export function hostIn(token: string): string {
  let t = token.trim().toLowerCase();
  while (t.length > 0 && '([<"\'«'.indexOf(t.charAt(0)) >= 0) t = t.slice(1);
  while (t.length > 0 && ')]>"\'»,;:.!?…'.indexOf(t.charAt(t.length - 1)) >= 0) t = t.slice(0, t.length - 1);
  const scheme = t.indexOf('://');
  if (scheme >= 0) t = t.slice(scheme + 3);
  const slash = t.indexOf('/');
  if (slash >= 0) t = t.slice(0, slash);
  const colon = t.indexOf(':');
  if (colon >= 0) t = t.slice(0, colon);
  const labels = t.split('.');
  if (labels.length < 2) return '';
  for (const l of labels) if (!isLabel(l)) return '';
  const tld = labels[labels.length - 1];
  for (let i = 0; i < tld.length; i++) { const c = tld.charCodeAt(i); if (c < 97 || c > 122) return ''; }
  if (tld.length < 2) return '';
  return t.startsWith('www.') ? t.slice(4) : t;
}
/** The first host name among the words of `s` ("via news.example.org" gives news.example.org). */
function firstHost(s: string): string {
  for (const w of s.split(' ')) { const h = hostIn(w); if (h !== '') return h; }
  return '';
}

/** The site a browser's notification came from, '' for an app's. Chrome and the Chromium browsers put the origin in the subtitle
 *  ("github.com"), Firefox too ("via github.com"); Safari's sites are apps of their own, named after the site. */
export function domainOf(n: Notif, bundleId: string, appName: string): string {
  if (!isBrowser(bundleId)) return '';
  if (bundleId.startsWith('web.')) {   // web.com.example.news: the host, reversed
    const parts = bundleId.slice(4).split('.');
    parts.reverse();
    const h = hostIn(parts.join('.'));
    if (h !== '') return h;
  }
  if (safariSite(bundleId)) { const h = hostIn(appName); if (h !== '') return h; }
  const s = firstHost(n.subtitle);
  if (s !== '') return s;
  const b = firstHost(n.body);
  return b !== '' ? b : firstHost(n.title);
}

// ---------------------------------------------------------------- the settings

export class AppEntry {
  id: string; name: string;
  allowed: boolean = true;
  count: number = 0;
  last: number = 0;     // seconds since 1970; 0: never seen (added by hand)
  constructor(id: string, name: string) { this.id = id; this.name = name; }
}
export class DomainEntry {
  domain: string;
  allowed: boolean = true;
  count: number = 0;
  last: number = 0;
  constructor(domain: string) { this.domain = domain; }
}

/** What the relay does while a Focus (Do Not Disturb, Work, Sleep...) is on. */
export const FOCUS_RELAY: string = 'relay';     // relay anyway: the tablet is where one looks while the Mac is quiet (the default)
export const FOCUS_HOLD: string = 'hold';       // relay nothing
export const FOCUS_FOLLOW: string = 'follow';   // relay what the Focus lets through: what the Mac showed (allowed apps and people, time-sensitive)
export const FOCUS_DEFAULT: string = '';        // a mode's override: none, the general choice applies

/** The Focus on now: its id and name ('' when none). */
export class FocusState {
  id: string = '';
  name: string = '';
  constructor(id: string, name: string) { this.id = id; this.name = name; }
}

export class Settings {
  apps: AppEntry[] = [];
  domains: DomainEntry[] = [];
  paused: boolean = false;
  /** The first-run assistant was finished: it opens again by itself only when a required permission is missing. */
  welcomed: boolean = false;
  /** The optional steps of the assistant the person passed (contacts, network, notifications). */
  skipped: string[] = [];
  focus: string = FOCUS_RELAY;
  /** Per Focus mode (its id): FOCUS_RELAY, FOCUS_HOLD or FOCUS_FOLLOW instead of `focus`. */
  focusModes: Map<string, string> = new Map<string, string>();

  focusPolicy(modeId: string): string {
    const o = this.focusModes.get(modeId);
    return o !== undefined && o !== FOCUS_DEFAULT ? o : this.focus;
  }

  app(id: string): AppEntry | null { for (const a of this.apps) if (a.id === id) return a; return null; }
  domain(d: string): DomainEntry | null { for (const e of this.domains) if (e.domain === d) return e; return null; }

  /** Adds the app (or finds it) and sets whether it is relayed. */
  setApp(id: string, name: string, allowed: boolean): AppEntry {
    let a = this.app(id);
    if (a === null) { a = new AppEntry(id, name); this.apps.push(a); }
    a.allowed = allowed;
    return a;
  }
  setDomain(d: string, allowed: boolean): DomainEntry {
    let e = this.domain(d);
    if (e === null) { e = new DomainEntry(d); this.domains.push(e); }
    e.allowed = allowed;
    return e;
  }
  /** A blocked site blocks its subdomains too: blocking example.com silences news.example.com. */
  domainBlocked(d: string): boolean {
    for (const e of this.domains) if (!e.allowed && (d === e.domain || d.endsWith('.' + e.domain))) return true;
    return false;
  }

  /** Counts the notification under its app (and site) and says whether it goes to the tablet: '' when it does, else why not. */
  decide(n: Notif, appName: string, domain: string, focus: FocusState): string {
    let a = this.app(n.app);
    if (a === null) { a = new AppEntry(n.app, appName); this.apps.push(a); }
    if (a.name === '' || a.name === a.id) a.name = appName;
    a.count++;
    a.last = n.date;
    if (domain !== '') {
      let e = this.domain(domain);
      if (e === null) { e = new DomainEntry(domain); this.domains.push(e); }
      e.count++;
      e.last = n.date;
    }
    if (!a.allowed) return 'app blocked';
    if (domain !== '' && this.domainBlocked(domain)) return 'site blocked';
    if (this.paused) return 'paused';
    if (focus.id !== '') {
      const p = this.focusPolicy(focus.id);
      if (p === FOCUS_HOLD || (p === FOCUS_FOLLOW && !n.presented)) return 'focus';
    }
    return '';
  }

  toJson(): string {
    const apps: any[] = [];
    for (const a of this.apps) apps.push({ id: a.id, name: a.name, allowed: a.allowed, count: a.count, last: a.last });
    const domains: any[] = [];
    for (const e of this.domains) domains.push({ domain: e.domain, allowed: e.allowed, count: e.count, last: e.last });
    const modes: any[] = [];
    this.focusModes.forEach((p: string, id: string) => { if (p !== FOCUS_DEFAULT) modes.push({ id: id, policy: p }); });
    return JSON.stringify({ v: 1, paused: this.paused, welcomed: this.welcomed, skipped: this.skipped, focus: this.focus, focusModes: modes, apps: apps, domains: domains });
  }
}

/** The settings of a settings file's text; empty settings for a text that is not one. */
export function settingsFromJson(text: string): Settings {
  const s = new Settings();
  if (text.trim() === '') return s;
  const o = JSON.parse(text);
  if (o === null || typeof o !== 'object') return s;
  s.paused = o.paused === true;
  s.welcomed = o.welcomed === true;
  if (Array.isArray(o.skipped)) for (const x of o.skipped as any[]) if (typeof x === 'string') s.skipped.push(x as string);
  if (o.focus === FOCUS_HOLD || o.focus === FOCUS_FOLLOW) s.focus = o.focus as string;
  if (Array.isArray(o.focusModes)) for (const x of o.focusModes as any[]) if (typeof x.id === 'string' && typeof x.policy === 'string') s.focusModes.set(x.id as string, x.policy as string);
  if (Array.isArray(o.apps)) for (const x of o.apps as any[]) {
    if (typeof x.id !== 'string') continue;
    const a = new AppEntry(x.id as string, typeof x.name === 'string' ? x.name as string : x.id as string);
    a.allowed = x.allowed !== false;
    a.count = typeof x.count === 'number' ? x.count as number : 0;
    a.last = typeof x.last === 'number' ? x.last as number : 0;
    s.apps.push(a);
  }
  if (Array.isArray(o.domains)) for (const x of o.domains as any[]) {
    if (typeof x.domain !== 'string') continue;
    const e = new DomainEntry(x.domain as string);
    e.allowed = x.allowed !== false;
    e.count = typeof x.count === 'number' ? x.count as number : 0;
    e.last = typeof x.last === 'number' ? x.last as number : 0;
    s.domains.push(e);
  }
  return s;
}

/** The names of a JSON object's own fields, in order. ponytail: Zinc has no Object.keys yet, so they are read from JSON.stringify of the
 *  object (as examples/pinball3d does); fine for the small files of Focus. Property lists list their keys themselves ("$keys"). */
export function keysOf(o: any): string[] {
  const t = JSON.stringify(o);
  const keys: string[] = [];
  let depth = 0, i = 0;
  while (i < t.length) {
    const c = t.charCodeAt(i);
    if (c === 34) {
      let j = i + 1;
      while (j < t.length && t.charCodeAt(j) !== 34) j += t.charCodeAt(j) === 92 ? 2 : 1;
      if (depth === 1 && j + 1 < t.length && t.charCodeAt(j + 1) === 58) keys.push(JSON.parse(t.slice(i, j + 1)) as string);
      i = j + 1;
      continue;
    }
    if (c === 123 || c === 91) depth++;
    else if (c === 125 || c === 93) depth--;
    i++;
  }
  return keys;
}
