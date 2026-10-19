// The Mac's notifications on the tablet (ZN-758, docs/reports/notification-relay-design.md): Zinc Relay on the Mac pairs once with this app
// over zinc:link (a 6-digit code shown here), then sends each notification it lets through. One arriving wakes the screen and plays over
// whatever shows: StandBy's overlay on the clock and on a sleeping screen, iOS's grey cards elsewhere (below); several queue or stack. The carousel's last slide
// lists the last 50, grouped by app, newest first, a swipe to the left deletes one, "Tout effacer" all, a touch opens it on the Mac; they are
// kept in notifications.json beside the program and the icons and avatars in notif-icons/ (one PNG per hash, asked once with need-icon).
// Not paired yet: the same slide is the pairing assistant.
// ZINC_MUSIC_RELAY=<file> replaces the link for the tests: lines "<seconds> <message JSON>" given to the app as if the Mac sent them.
import { rrect, drawImage, drawText, imageFromBytes, imageWidth, imageHeight, textWidth, fontAscent, font } from 'zinc:gfx';
import { exists, readText, writeText, readBytes, writeBytes, mkdir } from 'zinc:fs';
import { env } from 'zinc:sys';
import { base64Decode } from 'zinc:web';
import * as link from 'zinc:link';
import gsap, { Timeline } from 'gsap';
import { ui, F, TEXT, TEXT2, TEXT3, ACCENT, GREEN, CARD, FILL, Scroll, picture, onTap, onDrag, beginScroll, endScroll, label, centered, wrap, glyph, pill, spinner, separator, cardShadow } from './ui';

export class Notif {
  id: string = ''; appId: string = ''; appName: string = ''; icon: string = '';
  title: string = ''; subtitle: string = ''; body: string = ''; date: number = 0; domain: string = ''; thread: string = ''; emoji: string[] = [];
  /** 'message' (a person wrote: sender and avatar), 'track' (the next song, from this app: its cover) or 'other'. */
  kind: string = 'other'; sender: string = ''; avatar: string = '';
  /** The hash of a photo the message carries (a JPEG fitted in 640 px), '' when none. */
  attachment: string = '';
  /** A track's cover: a picture URL (ui.ts picture), '' when none. */
  art: string = '';
}

const MAX = 50, FILE = 'notifications.json', ICONS = 'notif-icons';
const CODE = font('sans-bold', 96);
let port = link.DEFAULT_PORT;
let list: Notif[] = load();
let relayName = '';           // the Mac that sends, from its hello
let connected = 0;            // its channels open now
const channels: link.Channel[] = [];
const asked = new Map<string, boolean>();   // need-icon sent this session
const icons = new Map<string, i32>();       // hash -> image, -1 none on disk yet

function str(v: any): string { return v === undefined || v === null ? '' : '' + v; }
function load(): Notif[] {
  const out: Notif[] = [];
  if (!exists(FILE)) return out;
  try {
    const a = JSON.parse(readText(FILE));
    for (let i = 0; i < (a.length as i32) && out.length < MAX; i++) out.push(fromJson(a[i]));
  } catch (e) { console.error('music: notifications.json unreadable'); }
  return out;
}
function fromJson(j: any): Notif {
  const n = new Notif();
  n.id = str(j.id); n.title = str(j.title); n.subtitle = str(j.subtitle); n.body = str(j.body); n.domain = str(j.domain); n.thread = str(j.thread); n.emoji = Array.isArray(j.emoji) ? j.emoji as string[] : [];
  n.kind = str(j.kind) === 'message' ? 'message' : 'other'; n.sender = str(j.sender); n.avatar = str(j.avatar); n.attachment = str(j.attachment);
  n.date = j.date !== undefined && j.date !== null ? j.date as number : Date.now() / 1000;
  if (j.app !== undefined && j.app !== null) { n.appId = str(j.app.id); n.appName = str(j.app.name); n.icon = str(j.app.icon); }
  return n;
}
function save(): void {
  const a: any[] = [];
  for (const n of list) a.push({ id: n.id, app: { id: n.appId, name: n.appName, icon: n.icon }, title: n.title, subtitle: n.subtitle, body: n.body, date: n.date, domain: n.domain, thread: n.thread, kind: n.kind, sender: n.sender, avatar: n.avatar, emoji: n.emoji, attachment: n.attachment });
  try { writeText(FILE, JSON.stringify(a) + '\n'); } catch (e) { console.error(`music: ${FILE}: ${e.message}`); }
}
/** The notifications kept, newest first. */
export function notifications(): Notif[] { return list; }
export function removeNotif(id: string): void { list = list.filter((n: Notif) => n.id !== id); save(); ui.dirty = true; }
export function clearNotifs(): void { list = []; save(); ui.dirty = true; }

// ---------------------------------------------------------------- emoji images, decoded once per notification
function placeholders(s: string): i32 { let k: i32 = 0; for (let i = 0; i < s.length; i++) if (s.charAt(i) === '\uFFFC') k++; return k; }
function plain(s: string): string { return s.replace(/\uFFFC/g, ''); }
/** The width drawInline takes: the text without its placeholders, plus one emoji of `h` (and 2 px) for each. */
function inlineWidth(f: i32, s: string, h: number): number { return textWidth(f, plain(s), 0) + placeholders(s) * (emojiSize(f) + 3); }
const emojiImgs = new Map<string, i32[]>();
function emojiImages(n: Notif): i32[] {
  const key = n.id;
  if (emojiImgs.has(key)) return emojiImgs.get(key) as i32[];
  const out: i32[] = [];
  for (const b64 of n.emoji) {
    try { out.push(imageFromBytes(base64Decode(b64))); } catch (e) { out.push(-1); }
  }
  emojiImgs.set(key, out);
  return out;
}
/** Draws a string whose '\uFFFC' placeholders are replaced by the emoji images of `n`, on one line starting at x. */
/** Where an emoji of a line of font `f` starting at `y` goes: centred on the capitals (they are 3/4 of the ascent), a little taller than them. */
function emojiSize(f: i32): number { return Math.round(fontAscent(f) * 0.92); }
function emojiY(f: i32, y: number): number { return y + fontAscent(f) * 0.62 - emojiSize(f) / 2; }
function drawInline(x: number, y: number, s: string, n: Notif, f: i32, color: u32, h: number, alpha: i32 = 255, first: i32 = 0, maxW: number = 0): number {
  const imgs = emojiImages(n);
  let ei = first, px = x;
  const end = maxW > 0 && inlineWidth(f, s, h) > maxW ? x + maxW - textWidth(f, '…', 0) : 1e9;   // too long: past it the rest is cut with an ellipsis
  const parts = s.split('\uFFFC');
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] !== '') {
      if (px + textWidth(f, parts[i], 0) > end) {   // cut the words that fit, then '…'
        let k = parts[i].length;
        while (k > 0 && px + textWidth(f, parts[i].slice(0, k), 0) > end) k--;
        drawText(f, px, y, parts[i].slice(0, k).trimEnd() + '…', color, alpha, 0);
        return end;
      }
      drawText(f, px, y, parts[i], color, alpha, 0); px += textWidth(f, parts[i], 0);
    }
    if (i < parts.length - 1) {
      const img = ei < imgs.length ? imgs[ei++] : -1;
      const es = emojiSize(f);
      if (px + es > end) { drawText(f, px, y, '…', color, alpha, 0); return end; }
      if (img >= 0) { drawImage(img, px, emojiY(f, y), es, es, alpha, es * 0.15); px += es + 3; }
    }
  }
  return px;
}
/** Like wrap, but renders '\uFFFC' placeholders as the emoji images of `n` inline. */
function wrapInline(f: i32, x: number, y: number, s: string, n: Notif, color: u32, w: number, lines: i32, lh: number, first: i32 = 0, alpha: i32 = 255): number {
  const imgs = emojiImages(n);
  // tokenize: words and emoji
  const tokens: string[] = [];
  let word = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    if (ch === '\uFFFC') { if (word !== '') { tokens.push(word); word = ''; } tokens.push('\uFFFC'); }
    else if (ch === ' ') { if (word !== '') { tokens.push(word); word = ''; } tokens.push(' '); }
    else word += ch;
  }
  if (word !== '') tokens.push(word);
  const tokenW = (t: string) => t === '\uFFFC' ? emojiSize(f) + 3 : t === ' ' ? textWidth(f, ' ', 0) : textWidth(f, t, 0);
  // build lines
  const lineTokens: string[][] = [];
  let line: string[] = [], width = 0;
  for (const t of tokens) {
    const tw = tokenW(t);
    if (width + tw <= w || line.length === 0) { line.push(t); width += tw; continue; }
    if (lineTokens.length === lines - 1) { line = line.concat(tokens.slice(tokens.indexOf(t))); break; }
    lineTokens.push(line); line = t === ' ' ? [] : [t]; width = t === ' ' ? 0 : tw;   // a line never starts with the space it broke at
  }
  if (line.length > 0) lineTokens.push(line);
  let nLines = 0, ei = first;   // `first`: the images the title used before this text
  for (let li = 0; li < Math.min(lineTokens.length, lines); li++) {
    let px = x;
    const last = li === lines - 1, dots = textWidth(f, '…', 0);
    for (const t of lineTokens[li]) {
      const tw = t === '\uFFFC' ? emojiSize(f) + 3 : textWidth(f, t, 0);
      if (last && px + tw > x + w - (t === ' ' ? 0 : dots)) { drawText(f, px, y + li * lh, '…', color, alpha, 0); break; }   // the rest does not fit
      if (t === '\uFFFC') {
        const img = ei < imgs.length ? imgs[ei++] : -1;
        if (img >= 0) drawImage(img, px, emojiY(f, y + li * lh), emojiSize(f), emojiSize(f), alpha, emojiSize(f) * 0.15);
      } else drawText(f, px, y + li * lh, t, color, alpha, 0);
      px += tw;
    }
    nLines++;
  }
  return nLines * lh;
}
// ---------------------------------------------------------------- icons, cached by hash
function validHash(h: string): boolean {   // it names a file: hex only
  if (h.length < 8 || h.length > 128) return false;
  for (let i = 0; i < h.length; i++) { const c = h.charAt(i); if (!((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F'))) return false; }
  return true;
}
function iconOf(hash: string): i32 {
  if (!validHash(hash)) return -1;
  if (icons.has(hash)) return icons.get(hash) as i32;   // ponytail: has() first: get() of a missing key is null, not undefined, once a program uses any (later.md)
  const path = `${ICONS}/${hash}.png`;
  const img = exists(path) ? imageFromBytes(readBytes(path)) : -1;
  icons.set(hash, img);
  return img;
}
function haveIcon(hash: string): boolean { return iconOf(hash) >= 0; }
function storeIcon(hash: string, png: string): void {
  if (!validHash(hash) || png.length > 400000) return;
  try {
    const b = base64Decode(png);
    mkdir(ICONS, true);
    writeBytes(`${ICONS}/${hash}.png`, b);
    icons.delete(hash);
    ui.dirty = true;
  } catch (e) { console.error(`music: icon ${hash}: ${e.message}`); }
}
/** The app's icon in a square, else a bell on a tint. */
function appIcon(n: Notif, x: number, y: number, s: number): void {
  const img = iconOf(n.icon);
  if (img >= 0) { drawImage(img, x, y, s, s, 255, s * 0.22); return; }
  rrect(x, y, s, s, s * 0.22, FILL, 255);
  glyph('bell', x + s * 0.22, y + s * 0.22, s * 0.56, TEXT);
}

// ---------------------------------------------------------------- the relay's messages
let shown = true;
/** The settings' "Notifications" (owner 2026-10-18): off, they arrive silently, kept in the list but never shown over the views nor waking the screen. */
export function setNotificationsShown(on: boolean): void { shown = on; }
function received(m: any, ch: link.Channel | null): void {
  const t = str(m.t);
  if (t === 'hello') { relayName = str(m.host) !== '' ? str(m.host) : ch !== null ? ch.peer.name : 'Mac'; ui.dirty = true; return; }
  if (t === 'icon') { storeIcon(str(m.hash), str(m.png)); return; }
  if (t === 'clear') { clearNotifs(); return; }
  if (t !== 'notif') return;
  const n = fromJson(m);
  if (n.id === '') n.id = '' + Date.now() + '-' + list.length;
  list = list.filter((o: Notif) => o.id !== n.id);   // the same notification again (updated): replaced
  list.unshift(n);
  if (list.length > MAX) list = list.slice(0, MAX);
  save();
  if (ch !== null) ch.send({ t: 'ack', id: n.id });   // stored: the Mac's assistant proves the path end to end with it
  for (const h of [n.icon, n.avatar, n.attachment]) if (h !== '' && ch !== null && !haveIcon(h) && !asked.has(h)) { asked.set(h, true); ch.send({ t: 'need-icon', hash: h }); }
  if (shown) present(n);
  ui.dirty = true;
}

const FEED = env('ZINC_MUSIC_RELAY');
const feed: string[] = [];
let feedT = 0;
/** Opens a notification on the Mac, as a click on it there would (a touch on the overlay or on the list). */
export function openOnMac(id: string): void {
  if (FEED !== '') { console.log(`music: open ${id}`); return; }   // the tests' feed: said, for the test to check
  for (const ch of channels) ch.send({ t: 'open', id: id });
}
/** Announces the app for Zinc Relay and takes what paired Macs send; `shown` is called as each notification starts to show (wake the
 *  screen), `standby` says whether one goes to StandBy's overlay (the clock slide, a sleeping screen) rather than a grey card. */
export function startRelay(shown: (n: Notif) => void, standby: () => boolean): void {
  onShow = shown; standbyNow = standby;
  if (FEED !== '') {
    for (const l of readText(FEED).split('\n')) if (l.trim() !== '') feed.push(l);
    relayName = 'Mac de test';
    return;
  }
  try {
    link.init({ name: 'Musique' });
    port = link.advertise({ service: 'notify', name: 'Musique' });
  } catch (e) { console.error(`music: zinc:link: ${e.message}`); return; }
  link.onPairing((s: string) => {
    if (s.startsWith('try ')) wrongTries = parseInt(s.slice(4)) as i32;
    else if (s === 'closed') { code = ''; expired = true; }
    ui.dirty = true;
  });
  link.onPaired((p: link.Peer) => { relayName = p.name; paired = true; step = 3; code = ''; ui.dirty = true; });
  link.onConnection((ch: link.Channel) => {
    channels.push(ch); connected++;
    if (relayName === '') relayName = ch.peer.name;
    ch.onMessage((m: any) => received(m, ch));
    ch.onClose((why: string) => { connected = Math.max(0, connected - 1); const i = channels.indexOf(ch); if (i >= 0) channels.splice(i, 1); ui.dirty = true; });
    ui.dirty = true;
  });
  paired = link.peers().length > 0;
  if (paired && relayName === '') relayName = link.peers()[0].name;
}

// ---------------------------------------------------------------- the overlay: one notification at a time, in iOS StandBy's manner
// One zinc:gsap timeline a notification: phase 1, centred, the round image grows in (the sender's avatar with the app's icon as a badge for
// a message, else the app's icon) with the name and the app below; phase 2 at 2.2 s, the image shrinks and slides to the left while the
// time, who it is from and the excerpt come in to its right, staggered; it holds, then fades out at 9.4 s, and the next one of the queue
// starts at 10 s (owner 2026-10-17: successive ones 10 s apart, the overlay closes when the queue is empty). The view under it is dimmed by
// a dark veil (the owner chose this dark look; a light iOS card was tried and dropped). A touch opens the notification on the Mac
// ({t:"open"}) and goes on with the queue.
class Play {
  n: Notif = new Notif();
  p1: number = 0; p2: number = 0; a: number = 0; b: number = 0; c: number = 0; out: number = 0;
  tl: Timeline | null = null;
}
const ov = { dim: 0 };
let cur: Play | null = null, closing = false;
let queue: Notif[] = [];
let onShow: (n: Notif) => void = (n: Notif) => {};
let lastSum = -1, still = false;
const DK = { name: font('sans-bold', 34), app: font('sans', 22), time: font('sans', 22), from: font('sans-bold', 54), text: font('sans', 32) };

/** Plays a notification now, or after the ones already waiting. */
export function show(n: Notif): void {
  if (cur !== null && !closing) { queue.push(n); return; }
  closing = false;
  gsap.killTweensOf(ov);
  gsap.to(ov, { dim: 1, duration: 0.35, ease: 'power2.out' });
  start(n);
}
function start(n: Notif): void {
  if (cur !== null && cur.tl !== null) (cur.tl as Timeline).kill();
  const p = new Play();
  p.n = n;
  const tl = gsap.timeline();
  tl.to(p, { p1: 1, duration: 0.55, ease: 'back.out(1.4)' }, 0)
    .to(p, { p2: 1, duration: 0.7, ease: 'power3.inOut' }, 2.2)
    .to(p, { a: 1, duration: 0.4, ease: 'power2.out' }, 2.6)
    .to(p, { b: 1, duration: 0.4, ease: 'power2.out' }, 2.72)
    .to(p, { c: 1, duration: 0.4, ease: 'power2.out' }, 2.84)
    .to(p, { out: 1, duration: 0.45, ease: 'power2.in' }, 9.4)
    .call(next, 10);
  p.tl = tl;
  cur = p;
  onShow(n);
  ui.dirty = true;
}
function next(): void {
  if (queue.length > 0) { start(queue.shift() as Notif); return; }
  if (cur === null || closing) return;
  closing = true;
  if (cur.tl !== null) (cur.tl as Timeline).kill();
  cur.out = 1;
  gsap.to(ov, { dim: 0, duration: 0.4, ease: 'power2.in' }).onComplete(() => { if (closing) { cur = null; closing = false; } ui.dirty = true; });
}
/** A song of this app, shown as a notification of the Mac is (StandBy's overlay, the screen woken for it) but never kept in the list. */
export function showTrack(n: Notif): void { n.kind = 'track'; show(n); }
/** A touch on the overlay: the notification opens on the Mac, the queue goes on. */
function tapped(): void {
  if (cur === null || closing) return;
  if ((cur as Play).n.kind !== 'track') openOnMac((cur as Play).n.id);
  next();
}
/** While the overlay holds still, its timeline needs no frame (the view under it is still too: the touches are the overlay's). */
/** A notification plays or waits (StandBy's overlay). */
export function overlayActive(): boolean { return cur !== null; }
export function overlayStill(): boolean {
  if (cur === null) return false;
  const p = cur as Play, sum = p.p1 + p.p2 * 3 + p.a * 5 + p.b * 7 + p.c * 11 + p.out * 13 + ov.dim * 17;
  still = sum === lastSum;
  lastSum = sum;
  return still;
}

function A(x: number): i32 { return Math.round(255 * Math.max(0, Math.min(1, x))) as i32; }
function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function msg(n: Notif): boolean { return n.kind === 'message'; }
function who(n: Notif): string { return plain(msg(n) && n.sender !== '' ? n.sender : n.title !== '' ? n.title : n.appName); }
/** Who it is from and what it says as the relay sent them, emoji placeholders kept; the excerpt's emoji start after the title's (n.emoji
 *  holds the title's, the subtitle's and the body's, in that order). */
function whoRaw(n: Notif): string { return msg(n) && n.sender !== '' ? n.sender : n.title !== '' ? n.title : n.appName; }
function excerptRaw(n: Notif): string { return msg(n) ? n.body : (n.subtitle !== '' ? n.subtitle + ' · ' : '') + n.body; }
/** Where the name's emoji start in n.emoji: the sender's come after the title's, subtitle's and body's (the relay's order). */
function whoFirst(n: Notif): i32 { return msg(n) && n.sender !== '' ? placeholders(n.title) + placeholders(n.subtitle) + placeholders(n.body) : 0; }
function excerptFirst(n: Notif): i32 { return placeholders(n.title) + (msg(n) ? placeholders(n.subtitle) : 0); }
function excerpt(n: Notif): string { return plain(msg(n) ? n.body : (n.subtitle !== '' ? n.subtitle + ' · ' : '') + n.body); }
/** The app's icon (a rounded square), else a bell on a tint. */
function appIconA(n: Notif, x: number, y: number, s: number, alpha: i32): void {
  const img = iconOf(n.icon);
  if (img >= 0) { drawImage(img, x, y, s, s, alpha, s * 0.22); return; }
  rrect(x, y, s, s, s * 0.22, FILL, alpha);
  glyph('bell', x + s * 0.22, y + s * 0.22, s * 0.56, TEXT, alpha);
}
/** The round image of a notification, centred on cx, cy: an avatar with the app's badge, or the app's icon. */
function face(n: Notif, cx: number, cy: number, d: number, alpha: i32, ring: u32): void {
  if (n.kind === 'track') {   // a song: its cover, square with round corners like an album
    const img = picture(n.art);
    if (img >= 0) drawImage(img, cx - d / 2, cy - d / 2, d, d, alpha, d * 0.12);
    else { rrect(cx - d / 2, cy - d / 2, d, d, d * 0.12, FILL, alpha); glyph('music', cx - d * 0.25, cy - d * 0.25, d * 0.5, TEXT2, alpha); }
    return;
  }
  if (!msg(n)) { appIconA(n, cx - d / 2, cy - d / 2, d, alpha); return; }
  const av = iconOf(n.avatar);
  if (av >= 0) drawImage(av, cx - d / 2, cy - d / 2, d, d, alpha, d / 2);
  else {   // no picture: the initials on a tint picked from the name, as Contacts does
    const tints: u32[] = [0x8e8e93, 0x5e5ce6, 0x30b0c7, 0xff9f0a, 0x34c759, 0xff375f];
    const s = who(n);
    let h: i32 = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
    rrect(cx - d / 2, cy - d / 2, d, d, d / 2, tints[h % tints.length], alpha);
    const f = d >= 120 ? DK.from : d >= 70 ? DK.name : F.bodyB;
    centered(f, cx, cy - fontAscent(f) / 2 - 2, s.charAt(0).toUpperCase(), 0xffffff, alpha);
  }
  const bs = d * 0.36, bx = cx + d * 0.5 - bs * 0.75, by = cy + d * 0.5 - bs * 0.75;
  rrect(bx - 3, by - 3, bs + 6, bs + 6, (bs + 6) * 0.26, ring, alpha);
  appIconA(n, bx, by, bs, alpha);
}

/** What notifications show over everything, in screen coordinates (`top`: the status bar's height). */
export function overlay(W: number, H: number, top: number): void {
  if (cur === null) { bannerLayer(W, H, top); return; }
  const p = cur as Play, n = p.n, k = 1 - p.out;
  rrect(0, 0, W, H, 0, 0x000000, A(0.86 * ov.dim));
  onTap('overlay', 0, 0, W, H, tapped);
  const shown = Math.min(1, p.p1 * 1.6) * k, labels = p.p1 * Math.max(0, 1 - p.p2 * 2) * k;
  // a photo the message carries: large on the right, its shape kept, as the text comes in (owner 2026-10-18); the face and margins shrink for it
  const att = n.attachment !== '' ? iconOf(n.attachment) : -1;
  const D1 = 210, D2 = att >= 0 ? 100 : 128, c2x = (att >= 0 ? 56 : 90) + D2 / 2;
  const d = lerp(D1 * (0.5 + 0.5 * p.p1), D2, p.p2), cx = lerp(W / 2, c2x, p.p2), cy = lerp(H / 2 - 60, H / 2, p.p2);
  face(n, cx, cy, d, A(shown), 0x000000);
  if (labels > 0.01) {
    const wr = whoRaw(n), nh = fontAscent(DK.name), nw = Math.min(W - 80, inlineWidth(DK.name, wr, nh));
    drawInline(cx - nw / 2, cy + d / 2 + 28, wr, n, DK.name, TEXT, nh, A(labels), whoFirst(n), nw);
    centered(DK.app, cx, cy + d / 2 + 74, n.appName, TEXT2, A(labels));
  }
  let aw = 0, ah = 0;
  if (att >= 0) { const iw = imageWidth(att), ih = imageHeight(att), sc = Math.min(Math.min(460, W * 0.44) / iw, (H - 120) / ih); aw = iw * sc; ah = ih * sc; }
  const tx = c2x + D2 / 2 + (att >= 0 ? 32 : 44), tw = W - tx - (aw > 0 ? 48 + aw + 32 : 90), y0 = H / 2 - 92;
  if (p.a > 0) label(DK.time, tx, y0 + (1 - p.a) * 18, ago(n.date), TEXT2, tw, A(p.a * k));
  if (p.b > 0) {
    const wr = whoRaw(n), fh = fontAscent(DK.from), yb = y0 + 34 + (1 - p.b) * 18;
    const ff = inlineWidth(DK.from, wr, fh) <= tw ? DK.from : DK.name;   // a long name takes the smaller size before it is cut
    drawInline(tx, yb + (ff === DK.from ? 0 : (fh - fontAscent(ff)) / 2), wr, n, ff, TEXT, fontAscent(ff), A(p.b * k), whoFirst(n), tw);
  }
  if (p.c > 0) wrapInline(DK.text, tx, y0 + 108 + (1 - p.c) * 18, excerptRaw(n), n, TEXT2, tw, 2, 42, excerptFirst(n), A(p.c * k));
  if (att >= 0 && p.c > 0) drawImage(att, W - 48 - aw, H / 2 - ah / 2 + (1 - p.c) * 18, aw, ah, A(p.c * k), 20);
}

/** Time passes: the feed of the tests. */
export function notifyTick(dt: number): void {
  feedT += dt;
  while (feed.length > 0) {
    const l = feed[0], sp = l.indexOf(' ');
    if (parseFloat(l.slice(0, sp)) > feedT) break;
    feed.shift();
    try { received(JSON.parse(l.slice(sp + 1)), null); } catch (e) { console.error(`music: relay feed: ${e.message}`); }
  }
  for (const b of banners) { b.left -= dt; if (b.left <= 0) dismiss(b); }
}

function appLine(n: Notif): string { return n.domain !== '' ? `${n.appName} · ${n.domain}` : n.appName; }
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
function ago(date: number): string {
  const s = Date.now() / 1000 - date;
  if (s < 60) return 'maintenant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'hier';
  const d = new Date(date * 1000);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

// ---------------------------------------------------------------- the slide: the list, or the pairing assistant
let paired = false;
let step: i32 = 1;            // the assistant: 1 install, 2 the code, 3 done
let code = '', expired = false, wrongTries: i32 = 0, noDiscovery = false, adding = false;
const scroll = new Scroll();
let dragId = '', dragDx = 0, dragAxis = '', dragX0 = 0, dragY0 = 0, scroll0 = 0;

function newCode(): void {
  expired = false; wrongTries = 0;
  try { code = link.openPairing(); } catch (e) { code = ''; console.error(`music: ${e.message}`); }
}
/** The carousel's notification slide (full width, under the status bar). */
export function notifSlide(W: number, H: number): void {
  if ((!paired && FEED === '') || adding || step === 3) { assistant(W, H); return; }
  const x0 = 64, w = W - 128;
  centeredTitle('Notifications', x0);
  const live = FEED !== '' || connected > 0;
  rrect(x0 + 2, 74, 10, 10, 5, live ? GREEN : TEXT3, 255);
  label(F.small, x0 + 20, 70, relayName !== '' ? `${relayName} · ${live ? 'connecté' : 'hors ligne'}` : 'Mac relié', TEXT2, w / 2);
  let px = x0 + w;
  if (list.length > 0) { px -= textWidth(F.smallB, 'Tout effacer', 0) + 36 + 22; pill('notif/clear', px, 18, 'Tout effacer', TEXT, FILL, clearNotifs, 'x'); }
  if (FEED === '') { px -= textWidth(F.smallB, 'Ajouter un Mac', 0) + 36 + 22 + 12; pill('notif/add', px, 18, 'Ajouter un Mac', TEXT, FILL, () => { adding = true; step = 1; }, 'laptop'); }
  if (list.length === 0) {
    glyph('bell', W / 2 - 40, H / 2 - 110, 80, TEXT3);
    centered(F.head, W / 2, H / 2 - 10, 'Aucune notification', TEXT);
    centered(F.small, W / 2, H / 2 + 26, `Celles du Mac s'afficheront ici.`, TEXT2);
    return;
  }
  // groups by app, the newest group first
  const order: string[] = [];
  const groups = new Map<string, Notif[]>();
  for (const n of list) {
    const k = n.appId + '|' + n.domain;
    if (!groups.has(k)) { order.push(k); groups.set(k, [n]); } else (groups.get(k) as Notif[]).push(n);
  }
  const top = 104, rowH = 92, headH = 46;
  beginScroll(scroll, 0, top, W, H - top);
  let y = top - scroll.y;
  for (const k of order) {
    const g = groups.get(k) as Notif[];
    const h = headH + g.length * rowH;
    if (y < H && y + h > top) {
      rrect(x0, y, w, h, 18, CARD, 255);
      appIcon(g[0], x0 + 16, y + 12, 26);
      label(F.smallB, x0 + 52, y + 16, appLine(g[0]), TEXT, w - 200);
      const cnt = g.length > 1 ? `${g.length}` : '';
      if (cnt !== '') { const cw = textWidth(F.tinyB, cnt, 0) + 16; rrect(x0 + w - 16 - cw, y + 14, cw, 22, 11, FILL, 255); centered(F.tinyB, x0 + w - 16 - cw / 2, y + 18, cnt, TEXT); }
      for (let i = 0; i < g.length; i++) row(g[i], x0, y + headH + i * rowH, w, rowH, i > 0, top, H);
    }
    y += h + 16;
  }
  scroll.content = y + scroll.y - top + 8;
  endScroll();
}
function centeredTitle(s: string, x: number): void { label(F.hero, x, 18, s, TEXT); }
/** One notification; dragged to the left it shows the bin, let go past a third it is deleted. */
function row(n: Notif, x: number, y: number, w: number, h: number, sep: boolean, top: number, H: number): void {
  if (y > H || y + h < top) return;
  const id = 'nrow/' + n.id, dx = dragId === id && dragAxis === 'x' ? dragDx : 0;
  if (dx < 0) {
    rrect(x + 8, y + 2, w - 16, h - 4, 14, 0xff453a, Math.min(255, Math.round(-dx * 3)) as i32);
    glyph('trash', x + w - 56, y + h / 2 - 14, 28, TEXT);
  }
  const rx = x + dx;
  if (dx < 0 || ui.pressed === id) rrect(rx, y, w, h, 14, ui.pressed === id && dx === 0 ? 0x2c2c2e : CARD, 255);
  if (sep) separator(rx + 20, y, w - 40);
  const when = ago(n.date);
  label(F.bodyB, rx + 20, y + 12, n.title !== '' ? n.title : n.appName, TEXT, w - 60 - textWidth(F.tiny, when, 0));
  label(F.tiny, rx + w - 20 - textWidth(F.tiny, when, 0), y + 15, when, TEXT2);
  const text = ((n.subtitle !== '' ? n.subtitle + ' · ' : '') + n.body).replace(/\uFFFC/g, '');
  if (text !== '') wrap(F.small, rx + 20, y + 40, text, TEXT2, w - 40, 2, 20);
  onDrag(id, x, y, w, h, (px: number, py: number, phase: i32) => {
    if (phase === 0) { dragId = id; dragDx = 0; dragAxis = ''; dragX0 = px; dragY0 = py; scroll0 = scroll.y; return; }
    if (phase === 3) { dragId = ''; return; }   // main.ts took the gesture for the carousel
    const ddx = px - dragX0, ddy = py - dragY0;
    if (dragAxis === '' && (Math.abs(ddx) > 12 || Math.abs(ddy) > 12)) dragAxis = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
    if (dragAxis === 'x') dragDx = Math.min(0, ddx);
    else if (dragAxis === 'y') { scroll.y = scroll0 - ddy; scroll.clamp(); }
    if (phase === 2) {
      if (dragAxis === 'x' && dragDx < -w / 3) removeNotif(n.id);
      else if (dragAxis === '') openOnMac(n.id);   // a touch: open it on the Mac
      dragId = ''; dragDx = 0;
    }
    ui.dirty = true;
  });
}
/** A row being dragged sideways: main.ts gives a swipe to the right to the carousel instead. */
export function rowWantsCarousel(dx: number, dy: number): boolean { return dragAxis === '' && dx > 12 && Math.abs(dx) > Math.abs(dy); }

/** The pairing assistant: what to install, then the code and the address, then done. */
function assistant(W: number, H: number): void {
  const x0 = 64, w = W - 128;
  centeredTitle(adding ? 'Ajouter un Mac' : 'Notifications du Mac', x0);
  if (adding) pill('pair/cancel', x0 + w - 130, 18, 'Annuler', TEXT, FILL, () => { adding = false; link.closePairing(); code = ''; step = 1; }, '', 40);
  // the steps, as a line of three
  const names = ['Installer', 'Appairer', 'Terminé'];
  for (let i = 0; i < 3; i++) {
    const sx = x0 + i * 200, on = step === i + 1, done = step > i + 1;
    rrect(sx, 78, 28, 28, 14, on ? ACCENT : done ? GREEN : FILL, 255);
    if (done) glyph('check', sx + 6, 84, 16, TEXT, 255, 3); else centered(F.smallB, sx + 14, 92 - fontAscent(F.smallB) / 2 - 1, '' + (i + 1), TEXT);
    label(F.smallB, sx + 38, 84, names[i], on ? TEXT : TEXT2, 140);
  }
  const cy = 136, ch = H - cy - 30;
  rrect(x0, cy, w, ch, 20, CARD, 255);
  const ix = x0 + 40, iw = w - 80;
  if (step === 1) {
    glyph('laptop', ix, cy + 40, 56, ACCENT);
    label(F.title, ix + 80, cy + 48, 'Installe Zinc Relay sur ton Mac', TEXT, iw - 80);
    const lines = [
      'Zinc Relay vit dans la barre des menus du Mac. Il envoie à cette tablette',
      'les notifications que tu choisis, app par app et site par site.',
      'Sur le Mac : zinc run examples/notify-relay, puis ouvre ses réglages.',
      'La tablette et le Mac doivent être sur le même Wi-Fi.',
    ];
    for (let i = 0; i < lines.length; i++) label(F.body, ix, cy + 130 + i * 34, lines[i], i < 2 ? TEXT : TEXT2, iw);
    pill('pair/next', ix, cy + ch - 80, 'Zinc Relay est ouvert, continuer', 0x000000, 0xffffff, () => { step = 2; newCode(); }, 'chevron-right', 48);
    return;
  }
  if (step === 2) {
    if (code === '' && !expired) newCode();
    label(F.head, ix, cy + 34, 'Dans Zinc Relay, choisis « Musique » et tape ce code :', TEXT, iw);
    const shown = code === '' ? '––– –––' : code.slice(0, 3) + ' ' + code.slice(3);
    if (expired) {
      label(F.title, ix, cy + 110, 'Le code a expiré.', TEXT2, iw);
      pill('pair/again', ix, cy + 170, 'Nouveau code', TEXT, FILL, newCode, 'refresh-cw');
    } else {
      label(CODE, ix, cy + 84, shown, TEXT, iw);
      spinner(ix + 14, cy + 236, 12);
      label(F.body, ix + 40, cy + 224, wrongTries > 0 ? `Code erroné (${wrongTries} essai${wrongTries > 1 ? 's' : ''} sur 3). En attente du Mac…` : 'En attente du Mac…', wrongTries > 0 ? ACCENT : TEXT2, iw - 40);
      label(F.small, ix, cy + 262, 'Le code vaut cinq minutes.', TEXT3, iw);
    }
    const addr = link.addresses();
    const at = addr.length > 0 ? `${addr[0]}  port ${port}` : 'pas de réseau';
    separator(ix, cy + ch - 120, iw);
    if (!noDiscovery) {
      label(F.small, ix, cy + ch - 98, `Adresse de la tablette : ${at}`, TEXT2, iw);
      pill('pair/nodisc', ix, cy + ch - 66, 'Le Mac ne trouve pas la tablette ?', TEXT, FILL, () => { noDiscovery = true; }, 'wifi', 40);
    } else {
      label(F.small, ix, cy + ch - 104, 'Ton réseau bloque la découverte : dans Zinc Relay, choisis « Saisir une adresse » et tape', TEXT2, iw);
      label(F.title, ix, cy + ch - 72, at, TEXT, iw);
    }
    return;
  }
  glyph('check', ix, cy + 40, 56, GREEN, 255, 3);
  label(F.title, ix + 80, cy + 48, relayName !== '' ? `${relayName} est relié` : 'Le Mac est relié', TEXT, iw - 80);
  label(F.body, ix, cy + 130, 'Ses notifications apparaîtront sur la tablette, même écran éteint,', TEXT, iw);
  label(F.body, ix, cy + 164, 'et resteront dans cette page. Glisse une notification vers la gauche pour l\'effacer.', TEXT2, iw);
  pill('pair/done', ix, cy + ch - 80, 'Terminé', 0x000000, 0xffffff, () => { adding = false; step = 1; noDiscovery = false; }, 'check', 48);
}

// ---------------------------------------------------------------- the grey cards: the screen on, any view but the clock
// Owner 2026-10-17: StandBy's overlay on the clock slide and when the notification wakes the screen; elsewhere, with the screen on, iOS's grey
// cards slide in at the top over a strong dim, several stack, each leaves after BANNER_S; a touch on one opens it on the Mac, a touch
// beside them sends them away. (A white card was tried and dropped: "c'est moche en blanc".)
const BANNER_S = 6;
class Banner { n: Notif = new Notif(); left: number = 0; y: number = -1; gone: boolean = false; }
let banners: Banner[] = [];
const veil = { dim: 0 };
let standbyNow: () => boolean = () => true;
function banner(n: Notif): void {
  const b = new Banner(); b.n = n; b.left = BANNER_S;
  gsap.to(b, { y: 0, duration: 0.45, ease: 'power3.out' });
  if (banners.length === 0) { gsap.killTweensOf(veil); gsap.to(veil, { dim: 1, duration: 0.35, ease: 'power2.out' }); }
  banners.unshift(b);
  if (banners.length > 3) banners = banners.slice(0, 3);
  onShow(n);
}
function dismiss(b: Banner): void {
  if (b.gone) return;
  b.gone = true;
  if (banners.filter((o: Banner) => !o.gone).length === 0) { gsap.killTweensOf(veil); gsap.to(veil, { dim: 0, duration: 0.4, ease: 'power2.in' }); }
  gsap.to(b, { y: -1, duration: 0.35, ease: 'power2.in' }).onComplete(() => { banners = banners.filter((o: Banner) => o !== b); ui.dirty = true; });
}
/** A notification arrives: StandBy's overlay (the clock, a sleeping screen, or one already playing), else a grey card. */
function present(n: Notif): void {
  if (cur !== null || standbyNow()) show(n); else banner(n);
}
/** The grey cards over a strong dim, stacked at the top. */
function bannerLayer(W: number, H: number, top: number): void {
  if (banners.length === 0 && veil.dim <= 0.001) return;
  rrect(0, 0, W, H, 0, 0x000000, A(0.72 * veil.dim));
  onTap('banner/veil', 0, 0, W, H, () => { for (const o of banners) dismiss(o); });
  let y = top + 12;
  for (let i = 0; i < banners.length; i++) {
    const b = banners[i], n = b.n;
    const w = 560, s = 44, pad = 16;
    const fa = F.tinyB, ft = F.smallB, fb = F.small, lh = 20;
    const att = n.attachment !== '' ? iconOf(n.attachment) : -1;   // a photo the message carries: a thumbnail on the right, as iOS does
    const x = (W - w) / 2, tx = x + pad + s + 14, tw = w - (tx - x) - pad - (att >= 0 ? s + 12 : 0);
    // Emoji arrive as '\uFFFC' placeholders with their PNGs in n.emoji; the canvas text engine has no inline images, so strip them
    // here (no tofu) and keep n.emoji for a future inline pass. shortcut: no inline emoji rendering yet.
    const strip = (s: string) => s.replace(/\uFFFC/g, '');
    const text = strip((n.subtitle !== '' ? n.subtitle + ' · ' : '') + n.body), lines = text === '' ? 0 : textWidth(fb, text, 0) > tw ? 2 : 1;
    const h = Math.max(s + (att >= 0 ? fontAscent(fa) + 8 : 0), fontAscent(fa) + 8 + fontAscent(ft) + (lines > 0 ? 8 : 0) + lh * lines) + pad * 2;
    const by = y + b.y * (h + top + 20);
    cardShadow(x, by, w, h, 22);
    rrect(x, by, w, h, 22, 0x2c2c2e, 255);
    appIcon(n, x + pad, by + pad, s);
    const when = timeOf(n.date);
    label(fa, tx, by + pad, appLine(n).toUpperCase(), TEXT2, tw - textWidth(fa, when, 0) - 12);
    label(fa, x + w - pad - textWidth(fa, when, 0), by + pad, when, TEXT2);
    let ty = by + pad + fontAscent(fa) + 8;
    if (att >= 0) {   // fitted in the square, its shape kept
      const iw = imageWidth(att), ih = imageHeight(att), sc = Math.min(s / iw, s / ih);
      drawImage(att, x + w - pad - s + (s - iw * sc) / 2, ty + (s - ih * sc) / 2, iw * sc, ih * sc, 255, 8);
    }
    drawInline(tx, ty, (n.title !== '' ? n.title : n.appName), n, ft, TEXT, fontAscent(ft), 255, 0, tw);
    ty += fontAscent(ft) + 8;
    if (lines > 0) wrapInline(fb, tx, ty, (n.subtitle !== '' ? n.subtitle + ' · ' : '') + n.body, n, TEXT, tw, 2, lh, placeholders(n.title !== '' ? n.title : n.appName));
    const bb = b;
    onTap('banner/' + i, x, by, w, h, () => { openOnMac(bb.n.id); dismiss(bb); });
    y += (h + 10) * Math.max(0, 1 + b.y);   // the others make room as it slides in
  }
}
function timeOf(date: number): string {
  const s = Date.now() / 1000 - date;
  if (s < 60) return 'maintenant';
  const d = new Date(date * 1000), m = d.getMinutes();
  return `${d.getHours()}:${m < 10 ? '0' : ''}${m}`;
}
