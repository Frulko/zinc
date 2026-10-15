// Musique: a wall remote for Sonos speakers, made for an HP TouchPad on its charger (README.md). What plays, Spotify (zinc:spotify), radios,
// rooms and groups, volumes; the screen goes off when nobody touches it and a touch wakes it. Drawn with zinc:gfx at 1024x768, a frame
// only when something changed.
import { onFrame, width, height, keep, clear, rect, rrect, gradient, setTransform, resetTransform, createImage, destroyImage, beginImage, endImage, drawText, textWidth, fontAscent, pointerX, pointerY, pointerDown, keyCount, keyKind, keyName, KeyKind } from 'zinc:gfx';
import { exists, readText, writeText, appendText, stat } from 'zinc:fs';
import { udp } from 'zinc:socket';
import { utf8Decode } from 'zinc:sys';
import { discover, System, Group, Speaker, serviceId, accountOf, playSpotify as sonosSpotify } from 'zinc:sonos';
import { Spotify, Item, Playback } from 'zinc:spotify';
import { spinner, tabular, tabularWidth, decodeStats, decodeOne, picturesTick, prefetch, ui, F, BG, CARD, CARD2, FILL, TEXT, TEXT2, TEXT3, ACCENT, GREEN, Scroll, Zone, zoneAt, resetZones, onTap, beginScroll, endScroll, label, centered, wrap, clock, glyph, transport, cover, backdrop, iconButton, pill, segmented, slider, card, separator, cardShadow, isPressed } from './ui';
import { Station, loadMine, saveMine, indexOf, directory } from './radios';
import { keyboard, KEYBOARD_H } from './keyboard';
import { Screen } from './screen';
import { arc, watchFace, lava, odometer, lampPalette, setLampPalette, LAMP_NAMES, HUGE, RINGS } from './faces';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setPlace, weatherTick, weatherSlide } from './weather';
import { openPort } from 'zinc:webos';

// ---------------------------------------------------------------- settings beside the program
class Config { sleep: number = 120; group: string = ''; seed: string = ''; spotifySn: i32 = 0; full: boolean = false; lat: number = 0; lon: number = 0; city: string = ''; }
function loadConfig(): Config {
  const c = new Config();
  if (!exists('config.json')) return c;
  try {
    const j = JSON.parse(readText('config.json'));
    if (j.sleep !== undefined) c.sleep = j.sleep as number;
    if (j.group !== undefined) c.group = '' + j.group;
    if (j.seed !== undefined) c.seed = '' + j.seed;
    if (j.spotifySn !== undefined) c.spotifySn = j.spotifySn as i32;
    if (j.full !== undefined) c.full = j.full === true;
    if (j.lat !== undefined && j.lon !== undefined) { c.lat = j.lat as number; c.lon = j.lon as number; c.city = j.city !== undefined ? '' + j.city : ''; }
  } catch (e) { console.error('music: config.json unreadable, defaults used'); }
  return c;
}
const cfg = loadConfig();
function saveConfig(): void {
  try { writeText('config.json', JSON.stringify({ sleep: cfg.sleep, group: cfg.group, seed: cfg.seed, spotifySn: cfg.spotifySn, full: cfg.full, lat: cfg.lat, lon: cfg.lon, city: cfg.city }) + '\n'); } catch (e) { console.error(`music: config.json: ${e.message}`); }
}

// ---------------------------------------------------------------- state
const SSDP_PORT: i32 = 37451, REMOTE_PORT: i32 = 7777;   // webOS drops what nothing asked for: opened by zinc-helper
openPort(SSDP_PORT); openPort(REMOTE_PORT);
const NOW = 0, RADIOS = 1, SPOTIFY = 2, ROOMS = 3, SETTINGS = 4;
let page: i32 = NOW;
// The home's carousel (owner, 2026-10-15): the player, a StandBy clock, the weather, the rooms' volumes as rings. `slide` is where it goes, `slideX`
// where it is (in slides, between two while it moves); a horizontal swipe on the home drags it.
const PLAYER = 0, CLOCK = 1, WEATHER = 2, RINGS_SLIDE = 3, SLIDES = 4;
let slide: i32 = PLAYER, slideX = 0;
let swipeOk = false, swiping = false, swipeFrom = 0, swipeVel = 0, lastX = 0;
// the clock's faces, one above the other: a vertical swipe on the clock changes it, as StandBy does
const FACES = 5;
let face: i32 = 0, faceY = 0, faceSwipe = false, faceFrom = 0, faceVel = 0;
/** The slide and the face, kept for the next start. */
function remember(): void {
  AsyncStorage.multiSet([['music.slide', '' + slide], ['music.face', '' + face], ['music.lamp', '' + lampPalette()]]);
}
async function recall(): Promise<void> {
  const v = await AsyncStorage.multiGet(['music.slide', 'music.face', 'music.lamp']);
  if (v[2][1] !== null) setLampPalette(parseInt(v[2][1] as string) as i32);
  if (v[0][1] !== null) { slide = Math.max(0, Math.min(SLIDES - 1, parseInt(v[0][1] as string))) as i32; slideX = slide; }
  if (v[1][1] !== null) { face = Math.max(0, Math.min(FACES - 1, parseInt(v[1][1] as string))) as i32; faceY = face; }
  ui.dirty = true;
}
let sys: System | null = null;
let group: Group | null = null;
let status = 'Recherche des enceintes…';
const screen = new Screen(cfg.sleep);
const spotify = new Spotify('spotify.json');
let spotifyUser = '';
let spPlayback = new Playback();
let liked = false, likedUri = '';

let mine: Station[] = loadMine();
let popular: Station[] = [], found: Station[] = [];
let popularState = '', foundState = '';
let radioTab: i32 = 0, editRadios = false;

let spTab: i32 = 0;
let spLists: Item[][] = [[], [], [], [], []];
let spState: string[] = ['', '', '', '', ''];   // '' not loaded, 'loading', 'ok' or an error
// Pages of SP_PAGE items (owner, 2026-10-15: 50 at once made the tablet lag and ran it out of memory): the next page is read when the list
// is scrolled near its end, while a spinner shows under it.
const SP_PAGE: i32 = 20;
let spMore: boolean[] = [false, false, false, false, false], spPaging: boolean[] = [false, false, false, false, false];

let query = '', typing = false;
let toastText = '', toastFor = 0;
let volumeOpen = false, volumeFor = 0, volumeHeld = 0;
let contextOpen = false;
let posBase = 0, posAt = 0;
let clockS = 0;

const scrolls: Scroll[] = [new Scroll(), new Scroll(), new Scroll(), new Scroll(), new Scroll()];

function plural(n: i32, word: string): string { return `${n} ${word}${n > 1 ? 's' : ''}`; }
function toast(s: string): void { toastText = s; toastFor = 3.5; ui.dirty = true; }
function now(): number { return clockS; }
function position(): number {
  if (group === null) return 0;
  const t = group.track;
  const p = posBase + (group.playing() ? now() - posAt : 0);
  return t.duration > 0 ? Math.min(t.duration, p) : p;
}

// ---------------------------------------------------------------- the network: one task of each kind at a time
async function attempt(what: string, f: () => Promise<void>): Promise<void> {
  try { await f(); } catch (e) { toast(`${what} : ${e.message}`); logError(`${what}: ${e.message}`); }
  ui.dirty = true;
}
/** Errors go to /tmp/music.log too (the tablet: read it over novacom), up to 200 kB. */
function logError(s: string): void {
  try {
    if (exists(LOG) && stat(LOG).size > 200000) return;
    const d = new Date();
    appendText(LOG, `${d.toISOString()} ${s}\n`);
  } catch (e) { /* no room */ }
}
const LOG = '/tmp/music.log';

/** The last value wins: a slider moved quickly sends only what is still current when the previous request is done. */
class Latest {
  busy: boolean = false;
  next: (() => Promise<void>) | null = null;
  push(f: () => Promise<void>): void { this.next = f; this.pump(); }
  async pump(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    while (this.next !== null) {
      const f = this.next as () => Promise<void>;
      this.next = null;
      try { await f(); } catch (e) { toast(`Volume : ${e.message}`); }
    }
    this.busy = false;
  }
}
const volumeSender = new Latest();

function pickGroup(): void {
  if (sys === null) return;
  const s = sys as System;
  let g: Group | null = null;
  for (const x of s.groups) if (x.coordinator.uuid === cfg.group) g = x;
  if (g === null && cfg.group !== '') { const sp = s.speaker(cfg.group); if (sp !== null) g = s.groupOf(sp); }
  if (g === null) for (const x of s.groups) if (x.playing()) g = x;
  if (g === null && s.groups.length > 0) g = s.groups[0];
  group = g;
}
function select(g: Group): void {
  group = g; cfg.group = g.coordinator.uuid; saveConfig();
  posBase = g.track.position; posAt = now();
  pollGroup();
}

let finding = false;
async function find(): Promise<void> {
  if (finding) return;
  finding = true;
  status = 'Recherche des enceintes…'; ui.dirty = true;
  try {
    const s = await discover(cfg.seed, 2500, SSDP_PORT);
    sys = s;
    if (cfg.seed !== s.seed) { cfg.seed = s.seed; saveConfig(); }
    pickGroup();
    for (const g of s.groups) { try { await s.update(g); } catch (e) { /* asleep speaker: the next poll */ } }
    if (group !== null) { posBase = (group as Group).track.position; posAt = now(); }
    status = '';
  } catch (e) { status = 'Aucune enceinte Sonos trouvée sur ce réseau'; logError(`find: ${e.message}`); }
  finding = false; ui.dirty = true;
}

let polling = false, failures: i32 = 0;
async function pollGroup(): Promise<void> {
  if (polling || sys === null || group === null) return;
  polling = true;
  const g = group as Group, before = g.track.uri + g.track.title;
  try {
    await (sys as System).update(g);
    failures = 0;
    if (Math.abs(g.track.position - position()) > 2 || before !== g.track.uri + g.track.title || !g.playing()) { posBase = g.track.position; posAt = now(); }
  } catch (e) {
    logError(`poll ${g.coordinator.name}: ${e.message}`);
    failures++;
    if (failures >= 3) { failures = 0; sys = null; find(); }
  }
  polling = false; ui.dirty = true;
}
let topoBusy = false;
async function pollTopology(): Promise<void> {
  if (topoBusy || sys === null) return;
  topoBusy = true;
  try {
    const s = sys as System;
    await s.refresh();
    const keepUuid = group !== null ? (group as Group).coordinator.uuid : '';
    group = null;
    for (const g of s.groups) if (g.coordinator.uuid === keepUuid) group = g;
    if (group === null) pickGroup();
  } catch (e) { /* the group poll notices a speaker that left */ }
  topoBusy = false; ui.dirty = true;
}
let volsBusy = false;
async function pollRooms(): Promise<void> {
  if (volsBusy || sys === null) return;
  volsBusy = true;
  const s = sys as System;
  for (let i = 0; i < s.groups.length; i++) {
    try { await s.readVolumes(s.groups[i]); if (s.groups[i] !== group) await s.update(s.groups[i]); } catch (e) { /* next time */ }
  }
  volsBusy = false; ui.dirty = true;
}
/** The rooms of the group under control (the popover's sliders): the Rooms page reads every group, this page only that one. */
async function pollMembers(): Promise<void> {
  if (volsBusy || sys === null || group === null) return;
  volsBusy = true;
  try { await (sys as System).readVolumes(group as Group); } catch (e) { /* next time */ }
  volsBusy = false; ui.dirty = true;
}
let spBusy = false;
async function pollSpotify(): Promise<void> {
  if (spBusy || !spotify.ready()) return;
  spBusy = true;
  try {
    spPlayback = await spotify.playback();
    const uri = spPlayback.item.uri;
    if (uri !== '' && uri !== likedUri) { likedUri = uri; liked = await spotify.isLiked(uri); }
  } catch (e) { /* shown when the owner acts */ }
  spBusy = false; ui.dirty = true;
}

// ---------------------------------------------------------------- actions
function g0(): Group | null { return group; }
function act(what: string, f: (s: System, g: Group) => Promise<void>): void {
  const g = g0();
  if (sys === null || g === null) { toast('Aucune enceinte'); return; }
  const s = sys as System, gg = g as Group;
  attempt(what, async (): Promise<void> => { await f(s, gg); await sleep(400); await pollGroup(); });
}
function sleep(ms: i32): Promise<boolean> { return new Promise<boolean>((done) => { setTimeout(() => done(true), ms); }); }

function togglePlay(): void {
  const g = g0();
  if (g === null) return;
  if ((g as Group).playing()) { (g as Group).state = 'PAUSED_PLAYBACK'; posBase = position(); posAt = now(); act('Pause', (s, x) => s.pause(x)); }
  else act('Lecture', (s, x) => s.play(x));
  ui.dirty = true;
}
function setGroupVolume(v: number): void {
  const g = g0();
  if (sys === null || g === null) return;
  const vol = Math.round(v * 100) as i32, s = sys as System, gg = g as Group;
  if (vol === gg.volume) return;
  gg.volume = vol; volumeHeld = 1.5;
  volumeSender.push(async (): Promise<void> => { await s.setGroupVolume(gg, vol); });
}
function setRoomVolume(sp: Speaker, v: number): void {
  if (sys === null) return;
  const vol = Math.round(v * 100) as i32, s = sys as System;
  if (vol === sp.volume) return;
  sp.volume = vol; volumeHeld = 1.5;
  volumeSender.push(async (): Promise<void> => { await s.setVolume(sp, vol); });
}
function nudgeVolume(d: i32): void {
  const g = g0();
  if (g !== null && (g as Group).volume >= 0) setGroupVolume(Math.max(0, Math.min(100, (g as Group).volume + d)) / 100);
}
function playStation(st: Station): void {
  act(st.name, async (s: System, g: Group): Promise<void> => {
    await s.playStream(g, st.url, st.name, st.art);
    toast(`${st.name} sur ${g.name()}`);
  });
  home();
}
/** Plays a Spotify item on the group: through Spotify Connect when Spotify may command the speaker, else through the Spotify service of
 *  the speakers (Spotify sees most Sonos as restricted devices). The account number of that service is found once and kept. */
function playSpotify(it: Item): void {
  const g = g0();
  if (sys === null || g === null) { toast('Aucune enceinte'); return; }
  const gg = g as Group, s = sys as System;
  toast(`${it.name}…`);
  attempt('Spotify', async (): Promise<void> => {
    if (spotifyUser === '') spotifyUser = await spotify.me();
    const dev = await spotify.device(gg.coordinator.name);
    if (dev !== null && !dev.restricted) await spotify.play(it, dev.id);
    else await playThroughSonos(s, gg, it);
    toast(`${it.name} sur ${gg.name()}`);
    home();
    await sleep(800); await pollGroup(); await pollSpotify();
  });
}
let spotifySid: i32 = -1;
async function playThroughSonos(s: System, g: Group, it: Item): Promise<void> {
  if (spotifySid < 0) spotifySid = await serviceId(s, 'Spotify');
  if (spotifySid < 0) throw new Error('le service Spotify n\'est pas disponible sur ces enceintes');
  const uri = it.kind === 'liked' ? `spotify:user:${spotify.userId}:collection` : it.uri;
  const tries: i32[] = [];
  if (cfg.spotifySn > 0) tries.push(cfg.spotifySn);
  const fav = await accountOf(s, spotifySid);
  if (fav > 0 && tries.indexOf(fav) < 0) tries.push(fav);
  for (let n: i32 = 1; n <= 4; n++) if (tries.indexOf(n) < 0) tries.push(n);   // ponytail: the first account numbers in turn; a Sonos favorite from Spotify names it
  let why = '';
  for (let i = 0; i < tries.length; i++) {
    try {
      await sonosSpotify(s, g, uri, it.name, spotifySid, tries[i]);
      await sleep(2500);
      await s.update(g);
      if (g.playing()) { if (cfg.spotifySn !== tries[i]) { cfg.spotifySn = tries[i]; saveConfig(); } return; }
    } catch (e) { why = e.message; }
  }
  throw new Error(`les Sonos n'ont pas pu lire « ${it.name} »${why !== '' ? ' (' + why + ')' : ''}. Ajoute une playlist Spotify aux favoris dans l'app Sonos, puis réessaie.`);
}
function addStation(st: Station): void {
  const i = indexOf(mine, st.url);
  if (i >= 0) { mine.splice(i, 1); toast(`${st.name} retirée de mes radios`); }
  else { mine.push(st); toast(`${st.name} ajoutée à mes radios`); }
  saveMine(mine);
}
function loadPopular(): void {
  if (popularState === 'loading' || popularState === 'ok') return;
  popularState = 'loading';
  attempt('Radios', async (): Promise<void> => {
    try { popular = await directory(''); popularState = 'ok'; } catch (e) { popularState = 'Annuaire injoignable : ' + e.message; }
  });
}
function searchRadios(): void {
  foundState = 'loading'; found = [];
  const q = query;
  attempt('Recherche', async (): Promise<void> => {
    try { found = await directory(q); foundState = found.length === 0 ? 'Aucune radio trouvée' : 'ok'; } catch (e) { foundState = 'Annuaire injoignable : ' + e.message; }
  });
}
function loadSpotify(tab: i32, force: boolean): void {
  if (!spotify.ready() || (!force && spState[tab] !== '')) return;
  spState[tab] = 'loading';
  const q = query;
  attempt('Spotify', async (): Promise<void> => {
    try {
      if (spotifyUser === '') spotifyUser = await spotify.me();
      const list = await spotifyPageOf(tab, 0, q);
      spLists[tab] = list; spMore[tab] = tab <= 2 && list.length === SP_PAGE;
      spState[tab] = list.length === 0 ? 'Rien ici pour le moment' : 'ok';
    } catch (e) { spState[tab] = e.message; }
  });
}
async function spotifyPageOf(tab: i32, offset: i32, q: string): Promise<Item[]> {
  if (tab === 0) return await spotify.playlists(offset, SP_PAGE);
  if (tab === 1) return await spotify.albums(offset, SP_PAGE);
  if (tab === 2) return await spotify.likedTracks(offset, SP_PAGE);
  if (tab === 3) return await spotify.recent();
  return await spotify.search(q);
}
/** The next page of a list, added at its end. */
function moreSpotify(tab: i32): void {
  if (!spMore[tab] || spPaging[tab] || spState[tab] !== 'ok') return;
  spPaging[tab] = true;
  const at = spLists[tab].length as i32;
  attempt('Spotify', async (): Promise<void> => {
    try {
      const page = await spotifyPageOf(tab, at, '');
      for (const it of page) spLists[tab].push(it);
      spMore[tab] = page.length === SP_PAGE;
    } catch (e) { spMore[tab] = false; toast(e.message); }
    spPaging[tab] = false; ui.dirty = true;
  });
}
/** Grey shapes where the list will be, and a spinner, while its first page loads. */
function skeleton(grid: boolean, top: number, bottom: number, W: number): void {
  const x0 = SIDE + P, w = W - SIDE - P * 2;
  if (grid) {
    const cols: i32 = 4, gap = 24, s = (w - gap * (cols - 1)) / cols;
    for (let i = 0; i < cols * 2; i++) {
      const x = x0 + (i % cols) * (s + gap), y = top + 8 + Math.floor(i / cols) * (s + 62);
      if (y > bottom) break;
      rrect(x, y, s, s, 14, CARD, 255); rrect(x, y + s + 12, s * 0.7, 14, 7, CARD, 255); rrect(x, y + s + 34, s * 0.4, 10, 5, CARD, 255);
    }
  } else {
    for (let i = 0; i < 8; i++) {
      const y = top + i * 68;
      if (y + 68 > bottom) break;
      rrect(x0, y + 10, 48, 48, 6, CARD, 255); rrect(x0 + 64, y + 16, 260 - (i % 3) * 40, 14, 7, CARD, 255); rrect(x0 + 64, y + 40, 160, 10, 5, CARD, 255);
    }
  }
  spinner(SIDE + (W - SIDE) / 2, top + 120, 18);
}
function typed(k: string): void {
  if (k === 'back') query = query.slice(0, Math.max(0, query.length - 1));
  else if (k === 'enter') {
    typing = false;
    if (query.trim() !== '') { if (page === RADIOS) searchRadios(); else loadSpotify(4, true); }
  } else query += k;
  ui.dirty = true;
}

// ---------------------------------------------------------------- buttons on the network (an ESP32, a phone): UDP text commands on 7777
async function listenRemote(): Promise<void> {
  try {
    const s = await udp(REMOTE_PORT);
    s.onMessage((m) => {
      const c = utf8Decode(m.bytes).trim().toLowerCase();
      if (c === 'toggle') togglePlay();
      else if (c === 'play') act('Lecture', (x, g) => x.play(g));
      else if (c === 'pause') act('Pause', (x, g) => x.pause(g));
      else if (c === 'next') act('Suivant', (x, g) => x.next(g));
      else if (c === 'prev') act('Précédent', (x, g) => x.previous(g));
      else if (c === 'vol+') nudgeVolume(3);
      else if (c === 'vol-') nudgeVolume(-3);
      else if (c.startsWith('radio ')) { const i = (parseInt(c.slice(6)) as i32) - 1; if (i >= 0 && i < mine.length) playStation(mine[i]); }
      else if (c === 'wake') { screen.touched(); }
      ui.dirty = true;
    });
  } catch (e) { console.error(`music: UDP 7777: ${e.message}`); }
}

// ---------------------------------------------------------------- touch
let wasDown = false, swallow = false, moved = false, idleFor = 0;
let downX = 0, downY = 0, lastY = 0, scrollStart = 0;
let dragZone: Zone | null = null, tapZone: Zone | null = null, scrolling: Scroll | null = null;

function input(dt: number): void {
  const down = pointerDown(), x = pointerX(), y = pointerY();
  if (down) idleFor = 0;
  if (down && !wasDown) {
    swallow = screen.touched();
    if (!swallow) {
      downX = x; downY = y; lastY = y; moved = false;
      const z = zoneAt(x, y, true);
      dragZone = z !== null && (z as Zone).drag !== null ? z : null;
      swipeOk = page === NOW && dragZone === null && !volumeOpen && !contextOpen; swiping = false; swipeFrom = slideX; swipeVel = 0; lastX = x;
      faceSwipe = false; faceFrom = faceY; faceVel = 0;
      tapZone = dragZone === null ? z : null;
      ui.pressed = z !== null ? (z as Zone).id : '';
      const sz = zoneAt(x, y, false);
      scrolling = sz !== null ? (sz as Zone).scroll : null;
      if (scrolling !== null) { (scrolling as Scroll).vel = 0; scrollStart = (scrolling as Scroll).y; }
      if (dragZone !== null) { const d = (dragZone as Zone).drag as (x: number, y: number, p: i32) => void; d(x, y, 0); }
    }
    ui.dirty = true;
  } else if (down && !swallow) {
    screen.idle = 0;
    if (dragZone !== null) { const d = (dragZone as Zone).drag as (x: number, y: number, p: i32) => void; d(x, y, 1); ui.dirty = true; }
    else {
      if (!moved && (Math.abs(y - downY) > 12 || Math.abs(x - downX) > 12)) { moved = true; ui.pressed = ''; ui.dirty = true; swiping = swipeOk && Math.abs(x - downX) > Math.abs(y - downY); faceSwipe = swipeOk && !swiping && slide === CLOCK && slideX === CLOCK; }
      if (faceSwipe) {
        const H = height() - TOP;
        faceY = Math.max(-0.12, Math.min(FACES - 1 + 0.12, faceFrom - (y - downY) / H));
        if (dt > 0) faceVel = faceVel * 0.3 + (-(y - lastY) / H / dt) * 0.7;
        ui.dirty = true;
      }
      if (swiping) {   // the carousel follows the finger, held back past its ends
        const W = width();
        slideX = Math.max(-0.12, Math.min(SLIDES - 1 + 0.12, swipeFrom - (x - downX) / W));
        if (dt > 0) swipeVel = swipeVel * 0.3 + (-(x - lastX) / W / dt) * 0.7;
        ui.dirty = true;
      }
      if (moved && scrolling !== null) {
        const s = scrolling as Scroll;
        s.y = scrollStart - (y - downY); s.clamp();
        if (dt > 0) s.vel = s.vel * 0.3 + (-(y - lastY) / dt) * 0.7;
        ui.dirty = true;
      }
    }
    lastY = y; lastX = x;
  } else if (!down && wasDown && !swallow) {
    if (swiping) {   // to the next slide past a fifth of the screen or after a fling, else back
      const from = Math.round(swipeFrom) as i32, d = slideX - swipeFrom;
      const step = Math.abs(swipeVel) > 0.8 ? (swipeVel > 0 ? 1 : -1) : Math.abs(d) > 0.2 ? (d > 0 ? 1 : -1) : 0;
      slide = Math.max(0, Math.min(SLIDES - 1, from + step)) as i32;
      if (slide === RINGS_SLIDE) tRooms = 99;   // the rooms' volumes at once
      swiping = false; remember();
    } else if (faceSwipe) {
      const from = Math.round(faceFrom) as i32, d = faceY - faceFrom;
      const step = Math.abs(faceVel) > 0.8 ? (faceVel > 0 ? 1 : -1) : Math.abs(d) > 0.2 ? (d > 0 ? 1 : -1) : 0;
      face = Math.max(0, Math.min(FACES - 1, from + step)) as i32;
      faceSwipe = false; remember();
    } else if (dragZone !== null) { const d = (dragZone as Zone).drag as (x: number, y: number, p: i32) => void; d(x, y, 2); }
    else if (!moved && tapZone !== null && (tapZone as Zone).inside(x, y) && (tapZone as Zone).tap !== null) { const t = (tapZone as Zone).tap as () => void; t(); }
    if (!moved && scrolling !== null) (scrolling as Scroll).vel = 0;
    dragZone = null; tapZone = null; ui.pressed = ''; ui.dirty = true;
  }
  wasDown = down;
  if (typing) {   // a desktop's keyboard types too
    for (let i = 0; i < keyCount(); i++) {
      const k = keyKind(i), n = keyName(i);
      if (k === KeyKind.Text) typed(n);
      else if (k === KeyKind.Down && n === 'Backspace') typed('back');
      else if (k === KeyKind.Down && n === 'Enter') typed('enter');
    }
  }
}

// ---------------------------------------------------------------- drawing
let SIDE = 240;   // 0: the player alone on the screen (cfg.full)
const P = 36, TOP = 30;   // TOP: the status bar

function sourceName(g: Group): string {
  const s = g.track.source;
  return s === 'spotify' ? 'SPOTIFY' : s === 'radio' ? 'RADIO' : s === 'tv' ? 'TÉLÉVISION' : s === 'line-in' ? 'ENTRÉE LIGNE' : s === 'queue' ? 'FILE D\'ATTENTE' : s === 'airplay' ? 'AIRPLAY' : s === 'none' ? '' : 'FLUX';
}
/** The art of what plays: the cover, else the logo of the station when it is one of mine. */
function artOf(g: Group): string {
  if (g.track.art !== '') return g.track.art;
  for (const st of mine) if (st.name === g.track.station) return st.art;
  return '';
}
function stationPlaying(st: Station): boolean {
  if (group === null) return false;
  const g = group as Group, u = st.url.slice(st.url.indexOf('://') + 3);
  return g.track.source === 'radio' && g.track.uri.indexOf(u) >= 0 && g.playing();
}

function sidebar(W: number, H: number): void {
  if (SIDE === 0) return;
  const over = page === NOW;   // over the player's backdrop: a translucent ground
  if (over) rrect(0, 0, SIDE, H, 0, 0x000000, 110); else rect(0, 0, SIDE, H, BG);
  rect(SIDE - 1, 0, 1, H, over ? 0x000000 : 0x1f1f21);
  drawText(F.title, 26, 34, 'Musique', TEXT, 255, 0);
  const items = ['À l\'écoute', 'Radios', 'Spotify', 'Enceintes', 'Réglages'];
  const icons = ['audio-lines', 'radio', 'library', 'speaker', 'settings'];
  for (let i = 0; i < items.length; i++) {
    const y = 96 + i * 54, id = 'nav/' + i, on = page === i;
    if (on) rrect(12, y, SIDE - 24, 46, 10, over ? 0xffffff : FILL, over ? 40 : 255);
    else if (isPressed(id)) rrect(12, y, SIDE - 24, 46, 10, over ? 0xffffff : CARD2, over ? 20 : 255);
    glyph(icons[i], 26, y + 12, 22, on ? ACCENT : TEXT2);
    drawText(F.label, 62, y + 13, items[i], TEXT, 255, 0);
    const k = i as i32;
    onTap(id, 12, y, SIDE - 24, 46, () => go(k));
  }
  if (group === null) return;
  const g = group as Group;
  // the group under control: the context of every command
  const gy = H - (over ? 92 : 214);
  if (over) rrect(12, gy, SIDE - 24, 64, 12, 0xffffff, isPressed('side/room') ? 50 : 25);
  else rrect(12, gy, SIDE - 24, 64, 12, isPressed('side/room') ? FILL : CARD, 255);
  glyph('speaker', 24, gy + 20, 24, g.playing() ? GREEN : TEXT2);
  label(F.smallB, 58, gy + 13, g.name(), TEXT, SIDE - 86);
  label(F.tiny, 58, gy + 36, g.playing() ? 'En lecture' : g.state === 'PAUSED_PLAYBACK' ? 'En pause' : 'Arrêté', TEXT2, SIDE - 86);
  onTap('side/room', 12, gy, SIDE - 24, 64, () => { contextOpen = true; ui.dirty = true; });
  if (over) return;
  // the mini player
  const my = H - 138;
  rrect(12, my, SIDE - 24, 122, 12, CARD, 255);
  cover(artOf(g), g.track.title !== '' ? g.track.title : g.track.station, 24, my + 12, 52, 8);
  label(F.smallB, 86, my + 16, g.track.title !== '' ? g.track.title : 'Rien en lecture', TEXT, SIDE - 112);
  label(F.tiny, 86, my + 40, g.track.artist !== '' ? g.track.artist : g.track.station, TEXT2, SIDE - 112);
  onTap('mini/open', 12, my, SIDE - 24, 70, () => go(NOW));
  const cy = my + 96;
  transport('prev', SIDE / 2 - 64, cy, 22, TEXT); onTap('mini/prev', SIDE / 2 - 90, cy - 22, 52, 44, () => act('Précédent', (s, x) => s.previous(x)));
  transport(g.playing() ? 'pause' : 'play', SIDE / 2, cy, 26, TEXT); onTap('mini/play', SIDE / 2 - 28, cy - 24, 56, 48, togglePlay);
  transport('next', SIDE / 2 + 64, cy, 22, TEXT); onTap('mini/next', SIDE / 2 + 38, cy - 22, 52, 44, () => act('Suivant', (s, x) => s.next(x)));
}
/** The player, at once. */
function home(): void { page = NOW; slide = PLAYER; slideX = 0; remember(); }
function go(k: i32): void {
  page = k; typing = false; volumeOpen = false; contextOpen = false;
  if (k === RADIOS && radioTab === 1) loadPopular();
  if (k === SPOTIFY) loadSpotify(spTab, false);
  if (k === ROOMS) pollRooms();
}

function nowPlaying(W: number, H: number): void {
  const full = SIDE === 0, x0 = full ? 64 : SIDE + P;
  iconButton('now/side', full ? 'panel-left-open' : 'panel-left-close', x0 + 14, 34, 22, TEXT, () => { cfg.full = !full; saveConfig(); }, 0xffffff, 30);
  if (group === null) { emptyState(W, H); return; }
  const g = group as Group, t = g.track;
  const art = artOf(g);
  // the room and the source
  const rw = pill('now/room', x0 + 50, 14, g.name(), TEXT, FILL, () => { contextOpen = true; }, 'speaker');
  const src = sourceName(g);
  if (src !== '') drawText(F.tinyB, x0 + 50 + rw + 16, 28, src, t.source === 'spotify' ? GREEN : ACCENT, 255, 0);
  // the cover
  const S = full ? 430 : 340, ay = full ? 86 : 96;
  cardShadow(x0, ay, S, S, 14);
  const nothing = t.title === '' && t.station === '';
  if (nothing) { rrect(x0, ay, S, S, 14, CARD2, 255); glyph('music', x0 + S / 2 - 48, ay + S / 2 - 48, 96, TEXT3); }
  else cover(art, t.title !== '' ? t.title : t.station, x0, ay, S, 14, t.source === 'radio' && t.art === '');
  // text and transport on the right
  const rx = x0 + S + (full ? 64 : 44), rw2 = W - rx - (full ? 64 : P);
  let ty = ay + 6;
  const title = nothing ? 'Rien en lecture' : t.title !== '' ? t.title : t.station;
  ty += wrap(full ? F.hero : F.title, rx, ty, title, TEXT, rw2, 3, full ? 42 : 36) + 6;
  const sub = t.artist !== '' ? t.artist : t.source === 'spotify' && t.title === '' ? (g.playing() ? 'Spotify Connect' : 'En pause dans Spotify') : '';
  if (sub !== '') { label(F.body, rx, ty, sub, ACCENT, rw2); ty += 30; }
  const sub2 = t.album !== '' ? t.album : t.source === 'radio' && t.station !== title ? t.station : '';
  if (sub2 !== '') label(F.label, rx, ty, sub2, TEXT2, rw2);
  // progress
  const py = ay + S * 0.58;
  if (t.duration > 0) {
    const p = position();
    slider('now/seek', rx, py, rw2, p / t.duration, 0xffffff, (v: number, done: boolean) => {
      posBase = v * t.duration; posAt = now();
      if (done) act('Avance', (s, x) => s.seek(x, v * t.duration));
    }, 5, false);
    drawText(F.tiny, rx, py + 14, clock(p), TEXT2, 255, 0);
    const rest = '-' + clock(t.duration - p);
    drawText(F.tiny, rx + rw2 - textWidth(F.tiny, rest, 0), py + 14, rest, TEXT2, 255, 0);
  } else if (t.source === 'radio' && !nothing) {
    rrect(rx, py - 12, 92, 26, 13, ACCENT, 255);
    rrect(rx + 12, py - 3, 8, 8, 4, 0xffffff, 255);
    drawText(F.tinyB, rx + 28, py - 6, 'EN DIRECT', TEXT, 255, 0);
  }
  // transport
  const cy = ay + S * 0.79, cx = rx + rw2 / 2;
  transport('prev', cx - 96, cy, 34, g.can('Previous') ? TEXT : TEXT3);
  onTap('now/prev', cx - 130, cy - 34, 68, 68, () => act('Précédent', (s, x) => s.previous(x)));
  rrect(cx - 40, cy - 40, 80, 80, 40, isPressed('now/play') ? 0xd1d1d6 : 0xffffff, 255);
  transport(g.playing() ? 'pause' : 'play', g.playing() ? cx : cx + 3, cy, 32, 0x000000);
  onTap('now/play', cx - 44, cy - 44, 88, 88, togglePlay);
  transport('next', cx + 96, cy, 34, g.can('Next') ? TEXT : TEXT3);
  onTap('now/next', cx + 62, cy - 34, 68, 68, () => act('Suivant', (s, x) => s.next(x)));
  // shuffle, repeat, like
  const my = ay + S - 4;
  if (t.source === 'spotify' && spotify.ready() && spPlayback.active) {
    const shuf = spPlayback.shuffle, rep = spPlayback.repeat;
    iconButton('now/shuffle', 'shuffle', cx - 96, my, 24, shuf ? ACCENT : TEXT2, () => attempt('Aléatoire', async (): Promise<void> => { await spotify.setShuffle(!shuf); spPlayback.shuffle = !shuf; }));
    iconButton('now/repeat', rep === 'track' ? 'repeat-1' : 'repeat', cx, my, 24, rep !== 'off' ? ACCENT : TEXT2, () => {
      const next = rep === 'off' ? 'context' : rep === 'context' ? 'track' : 'off';
      attempt('Répétition', async (): Promise<void> => { await spotify.setRepeat(next); spPlayback.repeat = next; });
    });
    const uri = spPlayback.item.uri;
    iconButton('now/like', 'heart', cx + 96, my, 24, liked ? ACCENT : TEXT2, () => attempt('J\'aime', async (): Promise<void> => { await spotify.setLiked(uri, !liked); liked = !liked; toast(liked ? 'Ajouté aux titres likés' : 'Retiré des titres likés'); }));
  } else if (t.source === 'queue') {
    const m = g.playMode, shuf = m.startsWith('SHUFFLE'), rep = m === 'REPEAT_ALL' || m === 'SHUFFLE' ? 'all' : m.endsWith('REPEAT_ONE') ? 'one' : 'off';
    const mode = (sh: boolean, r: string): string => sh ? (r === 'all' ? 'SHUFFLE' : r === 'one' ? 'SHUFFLE_REPEAT_ONE' : 'SHUFFLE_NOREPEAT') : (r === 'all' ? 'REPEAT_ALL' : r === 'one' ? 'REPEAT_ONE' : 'NORMAL');
    iconButton('now/shuffle', 'shuffle', cx - 48, my, 24, shuf ? ACCENT : TEXT2, () => act('Aléatoire', (s, x) => s.setPlayMode(x, mode(!shuf, rep))));
    iconButton('now/repeat', rep === 'one' ? 'repeat-1' : 'repeat', cx + 48, my, 24, rep !== 'off' ? ACCENT : TEXT2, () => act('Répétition', (s, x) => s.setPlayMode(x, mode(shuf, rep === 'off' ? 'all' : rep === 'all' ? 'one' : 'off'))));
  }
  // the group's volume: touching it opens the rooms' sliders
  const vy = ay + S + 50;
  volumeBar(x0, vy, W - x0 - P, g);
  // the other groups, one touch away
  if (sys !== null && (sys as System).groups.length > 1) {
    drawText(F.tinyB, x0, H - 108, 'ENCEINTES', TEXT2, 255, 0);
    let px = x0;
    for (const o of (sys as System).groups) {
      const on = o === group, gg = o;
      px += pill('now/g/' + o.id, px, H - 84, o.name(), on ? 0x000000 : TEXT, on ? 0xffffff : FILL, () => select(gg), o.playing() ? 'audio-lines' : 'speaker') + 10;
      if (px > W - 120) break;
    }
  }
}

const DAYS_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
/** StandBy: one clock a face, swiped vertically (the dots on the right edge), the chosen one remembered. */
function clockSlide(W: number, H: number): void {
  const ox = ui.ox;
  for (let j: i32 = 0; j < FACES; j++) {
    const o = Math.round((j - faceY) * H);
    if (Math.abs(o) >= H) continue;
    setTransform(1, 0, 0, 1, ox, TOP + o); ui.oy = TOP + o;
    if (j === 0) analogFace(W, H); else if (j === 1) digitalFace(W, H); else if (j === 2) ringsFace(W, H); else if (j === 3) lavaFace(W, H); else odometerFace(W, H);
  }
  setTransform(1, 0, 0, 1, ox, TOP); ui.oy = TOP;
  for (let j: i32 = 0; j < FACES; j++) {
    const on = Math.max(0, 1 - Math.abs(faceY - j));
    rrect(W - 24, H / 2 + (j - (FACES - 1) / 2) * 18 - 4, 8, 8, 4, TEXT, Math.round(70 + 185 * on) as i32);
  }
}
function dateLines(x: number, y: number, w: number): void {
  const d = new Date();
  label(F.hero, x, y, DAYS_LONG[d.getDay()].charAt(0).toUpperCase() + DAYS_LONG[d.getDay()].slice(1), ACCENT, w);
  label(F.title, x, y + 46, `${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`, TEXT2, w);
}
/** The watch face on the left, the date and what plays on the right. */
function analogFace(W: number, H: number): void {
  const d = new Date(), r = Math.min(250, H * 0.34), cx = 72 + r, cy = H / 2;
  watchFace(cx, cy, r, d.getHours(), d.getMinutes(), d.getSeconds());
  const rx = cx + r + 72, rw = W - rx - 56;
  dateLines(rx, cy - 120, rw);
  nowCard(rx, cy + 40, rw);
}
/** The time across the screen, the date above it, what plays under it. */
function digitalFace(W: number, H: number): void {
  const d = new Date(), m = d.getMinutes(), t = `${d.getHours()}:${m < 10 ? '0' : ''}${m}`;
  const dl = `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`.toUpperCase();
  centered(F.smallB, W / 2, H * 0.16, dl, ACCENT);
  tabular(HUGE, (W - tabularWidth(HUGE, t)) / 2, H * 0.2, t, TEXT);
  nowCard((W - 480) / 2, H - 150, 480);
}
/** Hours, minutes and seconds as rings (the Apple Watch's activity rings), the time in their middle. */
function ringsFace(W: number, H: number): void {
  const d = new Date(), h = d.getHours(), m = d.getMinutes(), sec = d.getSeconds();
  const R = Math.min(250, H * 0.34), cx = 72 + R, cy = H / 2, w = 46, gap = 8;
  const parts = [((h % 12) + m / 60) / 12, (m + sec / 60) / 60, sec / 60];
  for (let i = 0; i < 3; i++) {
    const rr = R - w / 2 - i * (w + gap);
    arc(cx, cy, rr, w, 1, RINGS[i], 60);
    arc(cx, cy, rr, w, Math.max(0.01, parts[i]), RINGS[i], 255);
  }
  const t = `${h}:${m < 10 ? '0' : ''}${m}`;
  centered(F.hero, cx, cy - fontAscent(F.hero) / 2 - 2, t, TEXT);
  const rx = cx + R + 72, rw = W - rx - 56;
  dateLines(rx, cy - 120, rw);
  nowCard(rx, cy + 40, rw);
}
let lampSeen = -10, lampHintAt = -10;
/** Lava lamp: blobs rising and melting behind the time, what plays under it. */
function lavaFace(W: number, H: number): void {
  const d = new Date(), m = d.getMinutes(), t = `${d.getHours()}:${m < 10 ? '0' : ''}${m}`;
  lava(W, H);
  onTap('lava/colour', 0, 0, W, H, () => { setLampPalette(lampPalette() + 1); remember(); ui.dirty = true; });   // a touch on the glass: the next colours
  centered(F.smallB, W / 2, H * 0.16, `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`.toUpperCase(), TEXT, 200);
  tabular(HUGE, (W - tabularWidth(HUGE, t)) / 2, H * 0.2, t, TEXT);
  nowCard((W - 480) / 2, H - 150, 480);
  // the hint: fades in and rises on arriving, gone after 10 s (then a touch on the glass still works)
  if (clockS - lampSeen > 0.5) lampHintAt = clockS;
  lampSeen = clockS;
  const he = clockS - lampHintAt;
  if (he < 10) {
    const k = Math.min(1, he / 0.6) * Math.min(1, (10 - he) / 0.6), rise = (1 - Math.min(1, he / 0.6)) * 14;
    centered(F.small, W / 2, H - 44 + rise, `${LAMP_NAMES[lampPalette()]} · touche le verre pour changer de couleur`, TEXT, Math.round(190 * k) as i32);
    ui.animating = true;
  }
}
/** Odometer: the digits roll when the minute changes. */
function odometerFace(W: number, H: number): void {
  const d = new Date();
  centered(F.smallB, W / 2, H * 0.12, `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`.toUpperCase(), ACCENT);
  odometer(W / 2, H * 0.42, d.getHours(), d.getMinutes());
  nowCard((W - 480) / 2, H - 150, 480);
}
/** What plays, as a card: a touch opens the player, the button plays or pauses. */
function nowCard(x: number, y: number, w: number): void {
  if (group === null) return;
  const g = group as Group, t = g.track;
  if (t.title === '' && t.station === '') return;
  rrect(x, y, w, 92, 18, 0xffffff, isPressed('clock/now') ? 40 : 22);
  cover(artOf(g), t.title !== '' ? t.title : t.station, x + 14, y + 14, 64, 10, t.source === 'radio' && t.art === '');
  label(F.smallB, x + 92, y + 22, t.title !== '' ? t.title : t.station, TEXT, w - 170);
  label(F.small, x + 92, y + 48, t.artist !== '' ? t.artist : g.name(), TEXT2, w - 170);
  onTap('clock/now', x, y, w - 70, 92, () => { slide = PLAYER; remember(); });
  const bx = x + w - 42, by = y + 46;
  rrect(bx - 24, by - 24, 48, 48, 24, isPressed('clock/play') ? 0xd1d1d6 : 0xffffff, 255);
  transport(g.playing() ? 'pause' : 'play', g.playing() ? bx : bx + 2, by, 18, 0x000000);
  onTap('clock/play', bx - 30, by - 30, 60, 60, togglePlay);
}

/** Every room's volume as a ring of the Apple Watch's activity rings, and beside each its number and slider. */
function ringsSlide(W: number, H: number): void {
  drawText(F.hero, 64, 18, 'Volumes', TEXT, 255, 0);
  const rooms: Speaker[] = [];
  if (sys !== null) for (const g of (sys as System).groups) for (const sp of g.members) if (rooms.length < RINGS.length) rooms.push(sp);
  const n = rooms.length;
  if (n === 0) { centered(F.head, W / 2, H / 2 - 20, status !== '' ? status : 'Aucune enceinte', TEXT2); return; }
  const R = Math.min(250, H * 0.36), cx = 72 + R, cy = H / 2 + 24, gap = 8;
  const w = Math.min(48, (R - 56) / n - gap);
  for (let i = 0; i < n; i++) {
    const sp = rooms[i], rr = R - w / 2 - i * (w + gap), c = RINGS[i];
    arc(cx, cy, rr, w, 1, c, 60);
    if (sp.volume > 0) arc(cx, cy, rr, w, sp.volume / 100, sp.muted ? TEXT3 : c, 255);   // muted: grey (translucent, the round ends would show over the arc)
  }
  const lx = cx + R + 64, lw = W - lx - 56, rowH = Math.min(118, (H - 130) / n);
  let y = cy - (rowH * n) / 2;
  for (let i = 0; i < n; i++) {
    const sp = rooms[i], c = RINGS[i], v = sp.volume;
    rrect(lx, y + 8, 14, 14, 7, c, 255);
    label(F.bodyB, lx + 26, y + 2, sp.name + (sp.muted ? ' (muet)' : ''), TEXT, lw - 110);
    const vs = v >= 0 ? '' + v : '–';
    drawText(F.hero, lx + lw - textWidth(F.hero, vs, 0), y - 6, vs, c, 255, 0);
    slider('ring/v/' + sp.uuid, lx + 2, y + 58, lw - 4, v >= 0 ? v / 100 : 0, c, (nv: number, done: boolean) => setRoomVolume(sp, nv), 6);
    y += rowH;
  }
}

let volBarX = 0, volBarY = 0;   // where the group's slider is: the rooms' popover opens above it
function volumeBar(x: number, y: number, w: number, g: Group): void {
  volBarX = x; volBarY = y;
  glyph('volume-1', x, y - 11, 22, TEXT2);
  slider('vol/group', x + 36, y, w - 72, g.volume >= 0 ? g.volume / 100 : 0, 0xffffff, (v: number, done: boolean) => {
    if (g.members.length > 1) { if (!volumeOpen) pollMembers(); volumeOpen = true; volumeFor = 4; }
    setGroupVolume(v);
  }, 6);
  glyph('volume-2', x + w - 24, y - 11, 22, TEXT2);
}

/** The popover of the rooms' volumes above the group's slider (as the Sonos app does). */
function volumePopover(W: number, H: number): void {
  if (!volumeOpen || group === null) return;
  const g = group as Group;
  onTap('vol/veil', 0, 0, W, H, () => { volumeOpen = false; });
  const pw = 460, rows = g.members.length + 1, ph = 26 + rows * 64;
  const px = volBarX, py = volBarY - 30 - ph;
  cardShadow(px, py, pw, ph, 18);
  rrect(px, py, pw, ph, 18, 0x2c2c2e, 250);
  onTap('vol/card', px, py, pw, ph, () => { volumeFor = 4; });
  for (let i = 0; i < rows; i++) {
    const ry = py + 18 + i * 64;
    const sp = i === 0 ? null : g.members[i - 1];
    const name = sp === null ? 'Tout le groupe' : (sp as Speaker).name;
    const v = sp === null ? g.volume : (sp as Speaker).volume;
    label(i === 0 ? F.smallB : F.small, px + 22, ry, name, TEXT, 200);
    const vs = v >= 0 ? '' + v : '–';
    drawText(F.smallB, px + pw - 22 - textWidth(F.smallB, vs, 0), ry, vs, TEXT2, 255, 0);
    if (sp === null) slider('vol/pg', px + 22, ry + 36, pw - 44, v / 100, ACCENT, (nv: number, done: boolean) => { volumeFor = 4; setGroupVolume(nv); }, 6);
    else {
      const s = sp as Speaker;
      slider('vol/p/' + s.uuid, px + 22, ry + 36, pw - 44, v / 100, 0xffffff, (nv: number, done: boolean) => { volumeFor = 4; setRoomVolume(s, nv); }, 6);
    }
  }
}

/** What to control: every group with what it plays, its rooms, a play button; a touch makes it the context of every command. */
function contextSheet(W: number, H: number): void {
  if (!contextOpen || sys === null) return;
  const s = sys as System;
  onTap('ctx/veil', 0, 0, W, H, () => { contextOpen = false; });
  rrect(0, 0, W, H, 0, 0x000000, 120);
  const pw = 600, rowH = 92, ph = 150 + s.groups.length * rowH;
  const px = SIDE + (W - SIDE - pw) / 2, py = Math.max(30, (H - ph) / 2);
  cardShadow(px, py, pw, ph, 20);
  rrect(px, py, pw, ph, 20, 0x1c1c1e, 255);
  onTap('ctx/card', px, py, pw, ph, () => {});
  drawText(F.head, px + 24, py + 24, 'Que contrôler ?', TEXT, 255, 0);
  iconButton('ctx/close', 'x', px + pw - 36, py + 36, 20, TEXT2, () => { contextOpen = false; }, CARD2, 255);
  for (let i = 0; i < s.groups.length; i++) {
    const g = s.groups[i], gg = g, y = py + 76 + i * rowH, on = g === group, id = 'ctx/g/' + g.id;
    if (on) rrect(px + 12, y, pw - 24, rowH - 8, 14, 0xffffff, 22);
    else if (isPressed(id)) rrect(px + 12, y, pw - 24, rowH - 8, 14, 0xffffff, 12);
    cover(artOf(g), g.track.title !== '' ? g.track.title : g.track.station, px + 24, y + 12, 60, 8);
    label(F.bodyB, px + 100, y + 14, g.name(), on ? ACCENT : TEXT, pw - 220);
    const line = g.track.title !== '' ? g.track.title + (g.track.artist !== '' ? ' · ' + g.track.artist : '') : g.track.station !== '' ? g.track.station : 'Rien en lecture';
    label(F.small, px + 100, y + 44, (g.playing() ? '' : g.state === 'PAUSED_PLAYBACK' ? 'En pause · ' : '') + line, TEXT2, pw - 220);
    onTap(id, px + 12, y, pw - 110, rowH - 8, () => { select(gg); contextOpen = false; page = NOW; });
    const bx = px + pw - 60, by = y + 42;
    rrect(bx - 26, by - 26, 52, 52, 26, isPressed('ctx/p/' + g.id) ? 0xd1d1d6 : 0xffffff, 255);
    transport(g.playing() ? 'pause' : 'play', g.playing() ? bx : bx + 2, by, 20, 0x000000);
    onTap('ctx/p/' + g.id, bx - 30, by - 30, 60, 60, () => {
      attempt(gg.name(), async (): Promise<void> => { if (gg.playing()) await s.pause(gg); else await s.play(gg); await sleep(400); await s.update(gg); });
    });
  }
  const by = py + ph - 62;
  pill('ctx/group', px + 24, by, 'Regrouper ou séparer les enceintes', TEXT, FILL, () => { contextOpen = false; go(ROOMS); }, 'link');
}

function emptyState(W: number, H: number): void {
  const cx = SIDE + (W - SIDE) / 2;
  glyph('speaker', cx - 40, H / 2 - 120, 80, TEXT3);
  centered(F.head, cx, H / 2 - 20, status !== '' ? status : 'Aucune enceinte', TEXT);
  if (!finding) {
    const w = textWidth(F.smallB, 'Réessayer', 0) + 36 + 22;
    pill('empty/retry', cx - w / 2, H / 2 + 30, 'Réessayer', TEXT, FILL, () => { find(); }, 'refresh-cw');
  }
}

function header(title: string): void { drawText(F.hero, SIDE + P, 30, title, TEXT, 255, 0); }

function tile(id: string, x: number, y: number, s: number, art: string, name: string, sub: string, logo: boolean, playing: boolean, tap: () => void): void {
  if (isPressed(id)) rrect(x - 6, y - 6, s + 12, s + 12, 18, 0xffffff, 30);
  cover(art, name, x, y, s, 14, logo);
  if (playing) {
    rrect(x + s - 44, y + s - 44, 34, 34, 17, ACCENT, 255);
    glyph('audio-lines', x + s - 37, y + s - 37, 20, TEXT);
  }
  label(F.smallB, x, y + s + 10, name, TEXT, s);
  if (sub !== '') label(F.tiny, x, y + s + 32, sub, TEXT2, s);
  onTap(id, x, y, s, s + 50, tap);
}

function stationGrid(list: Station[], id: string, top: number, bottom: number, W: number, scroll: Scroll, editable: boolean, empty: string): void {
  const x0 = SIDE + P, w = W - SIDE - P * 2, cols: i32 = 4, gap = 24;
  const s = (w - gap * (cols - 1)) / cols, rowH = s + 62;
  beginScroll(scroll, SIDE, top, W - SIDE, bottom - top);
  scroll.content = Math.ceil(list.length / cols) * rowH + 24;
  if (list.length === 0) centered(F.label, SIDE + (W - SIDE) / 2, top + 80, empty, TEXT2);
  for (let i = 0; i < list.length; i++) {
    const st = list[i];
    const x = x0 + (i % cols) * (s + gap), y = top + 8 + Math.floor(i / cols) * rowH - scroll.y;
    if (y > bottom || y + rowH < top) continue;
    tile(`${id}/${i}`, x, y, s, st.art, st.name, st.tags, true, stationPlaying(st), () => {
      if (editRadios && editable) { mine.splice(indexOf(mine, st.url), 1); saveMine(mine); ui.dirty = true; } else playStation(st);
    });
    const mineAt = indexOf(mine, st.url);
    if (editable && editRadios) {
      rrect(x - 8, y - 8, 32, 32, 16, 0xff453a, 255);
      rrect(x, y + 6, 16, 3, 1, 0xffffff, 255);
      onTap(`${id}/rm/${i}`, x - 14, y - 14, 44, 44, () => { mine.splice(indexOf(mine, st.url), 1); saveMine(mine); ui.dirty = true; });
    } else if (!editable) {
      const bx = x + s - 40, by = y + 8;
      rrect(bx, by, 32, 32, 16, mineAt >= 0 ? ACCENT : 0x000000, mineAt >= 0 ? 255 : 150);
      glyph(mineAt >= 0 ? 'check' : 'plus', bx + 6, by + 6, 20, TEXT);
      onTap(`${id}/add/${i}`, bx - 6, by - 6, 44, 44, () => addStation(st));
    }
  }
  endScroll();
}

function searchField(x: number, y: number, w: number, placeholder: string): void {
  rrect(x, y, w, 46, 12, CARD2, 255);
  glyph('search', x + 14, y + 13, 20, TEXT2);
  if (query === '') drawText(F.label, x + 46, y + 13, placeholder, TEXT3, 255, 0);
  else label(F.label, x + 46, y + 13, query, TEXT, w - 100);
  if (typing) rect(x + 47 + Math.min(w - 100, textWidth(F.label, query, 0)), y + 11, 2, 24, ACCENT);
  onTap('field', x, y, w - 50, 46, () => { typing = true; });
  if (query !== '') iconButton('field/clear', 'x', x + w - 26, y + 23, 18, TEXT2, () => { query = ''; typing = true; });
}

function radiosPage(W: number, H: number): void {
  header('Radios');
  const segX = W - P - 380;
  segmented('radio/tab', segX, 34, ['Mes radios', 'Populaires', 'Rechercher'], radioTab, (i: i32) => {
    radioTab = i; typing = i === 2 && query === ''; editRadios = false;
    if (i === 1) loadPopular();
  }, 126);
  const bottom = H - (typing ? KEYBOARD_H : 0);
  if (radioTab === 0) {
    pill('radio/edit', segX - 150, 34, editRadios ? 'Terminé' : 'Modifier', editRadios ? 0x000000 : TEXT, editRadios ? 0xffffff : FILL, () => { editRadios = !editRadios; }, '', 40);
    stationGrid(mine, 'mine', 100, bottom, W, scrolls[RADIOS], true, 'Ajoute des radios depuis Populaires ou Rechercher');
  } else if (radioTab === 1) {
    if (popularState === 'loading' || popularState === '') centered(F.label, SIDE + (W - SIDE) / 2, 200, 'Chargement…', TEXT2);
    else if (popularState !== 'ok') centered(F.label, SIDE + (W - SIDE) / 2, 200, popularState, TEXT2);
    else stationGrid(popular, 'pop', 100, bottom, W, scrolls[RADIOS], false, '');
  } else {
    searchField(SIDE + P, 100, W - SIDE - P * 2, 'Nom d\'une radio, d\'une ville, d\'un style');
    if (foundState === 'loading') centered(F.label, SIDE + (W - SIDE) / 2, 230, 'Recherche…', TEXT2);
    else if (foundState !== '' && foundState !== 'ok') centered(F.label, SIDE + (W - SIDE) / 2, 230, foundState, TEXT2);
    else stationGrid(found, 'found', 166, bottom, W, scrolls[RADIOS], false, '');
    if (typing) keyboard(SIDE, H - KEYBOARD_H, W - SIDE, typed);
  }
}

function itemRows(list: Item[], top: number, bottom: number, W: number, scroll: Scroll, head: string, more: boolean = false): void {
  const x0 = SIDE + P, w = W - SIDE - P * 2, rowH = 68;
  beginScroll(scroll, SIDE, top, W - SIDE, bottom - top);
  const extra = head !== '' ? 1 : 0;
  scroll.content = (list.length + extra) * rowH + 24 + (more ? 72 : 0);
  if (more) spinner(SIDE + (W - SIDE) / 2, top + (list.length + extra) * rowH + 36 - scroll.y, 14);
  if (head !== '') {
    const y = top - scroll.y, id = 'rows/head';
    if (isPressed(id)) rrect(x0 - 10, y, w + 20, rowH, 10, CARD2, 255);
    rrect(x0, y + 10, 48, 48, 8, ACCENT, 255);
    glyph('heart', x0 + 12, y + 22, 24, TEXT);
    drawText(F.bodyB, x0 + 64, y + 22, head, TEXT, 255, 0);
    const it = new Item(); it.kind = 'liked'; it.name = 'Titres likés';
    onTap(id, x0, y, w, rowH, () => playSpotify(it));
  }
  for (let i = 0; i < list.length; i++) {
    const it = list[i], y = top + (i + extra) * rowH - scroll.y;
    if (y > bottom || y + rowH < top) continue;
    const id = 'rows/' + i;
    if (isPressed(id)) rrect(x0 - 10, y, w + 20, rowH, 10, CARD2, 255);
    cover(it.thumb !== '' ? it.thumb : it.art, it.name, x0, y + 10, 48, it.kind === 'artist' ? 24 : 6);
    label(F.label, x0 + 64, y + 13, it.name, TEXT, w - 200);
    const kind = it.kind === 'track' ? 'Titre' : it.kind === 'playlist' ? 'Playlist' : it.kind === 'album' ? 'Album' : it.kind === 'artist' ? 'Artiste' : 'Épisode';
    label(F.small, x0 + 64, y + 38, kind + (it.subtitle !== '' ? ' · ' + it.subtitle : ''), TEXT2, w - 200);
    if (i < list.length - 1) separator(x0 + 64, y + rowH - 1, w - 64);
    onTap(id, x0, y, w, rowH, () => playSpotify(it));
  }
  endScroll();
}

function spotifyPage(W: number, H: number): void {
  header('Spotify');
  if (!spotify.ready()) {
    const x = SIDE + P, w = W - SIDE - P * 2;
    card(x, 110, w, 250);
    glyph('library', x + 24, 134, 32, GREEN);
    drawText(F.head, x + 72, 138, spotify.problem === 'login expired' ? 'La connexion Spotify a expiré' : 'Spotify n\'est pas connecté', TEXT, 255, 0);
    const lines = [
      spotify.problem === 'login expired' ? 'Spotify demande de se reconnecter tous les six mois.' : 'Une seule connexion, faite depuis un ordinateur :',
      '1. developer.spotify.com/dashboard : une app, redirect http://127.0.0.1:8765/callback',
      '2. python3 plugins/spotify/login.py <CLIENT_ID> spotify.json',
      '3. Copier spotify.json à côté de l\'app (examples/music/install.sh le fait).',
    ];
    for (let i = 0; i < lines.length; i++) label(F.small, x + 24, 196 + i * 34, lines[i], i === 0 ? TEXT : TEXT2, w - 48);
    return;
  }
  const tabs = ['Playlists', 'Albums', 'Titres likés', 'Récents', 'Rechercher'];
  segmented('sp/tab', W - P - 560, 34, tabs, spTab, (i: i32) => { spTab = i; typing = i === 4 && query === ''; scrolls[SPOTIFY].y = 0; if (i < 4) loadSpotify(i, false); }, 112);
  const bottom = H - (typing ? KEYBOARD_H : 0);
  let top = 100;
  if (spTab === 4) { searchField(SIDE + P, 100, W - SIDE - P * 2, 'Titres, artistes, albums, playlists'); top = 166; }
  const st = spState[spTab];
  if (st === 'loading') skeleton(spTab <= 1, top, bottom, W);
  else if (st !== '' && st !== 'ok') centered(F.label, SIDE + (W - SIDE) / 2, top + 100, st, TEXT2);
  else if (spTab <= 1) {
    const list = spLists[spTab], x0 = SIDE + P, w = W - SIDE - P * 2, cols: i32 = 4, gap = 24;
    const s = (w - gap * (cols - 1)) / cols, rowH = s + 62, sc = scrolls[SPOTIFY];
    beginScroll(sc, SIDE, top, W - SIDE, bottom - top);
    sc.content = Math.ceil(list.length / cols) * rowH + 24 + (spMore[spTab] ? 72 : 0);
    if (spMore[spTab]) spinner(SIDE + (W - SIDE) / 2, top + Math.ceil(list.length / cols) * rowH + 36 - sc.y, 14);
    for (let i = 0; i < list.length; i++) {
      const it = list[i], x = x0 + (i % cols) * (s + gap), y = top + 8 + Math.floor(i / cols) * rowH - sc.y;
      if (y > bottom || y + rowH < top) continue;
      tile('sp/' + i, x, y, s, it.art, it.name, it.subtitle, false, false, () => playSpotify(it));
    }
    endScroll();
  } else itemRows(spLists[spTab], top, bottom, W, scrolls[SPOTIFY], spTab === 2 ? 'Lire tous les titres likés' : '', spMore[spTab]);
  const sc = scrolls[SPOTIFY];
  if (st === 'ok' && sc.y + sc.view > sc.content - 600) moreSpotify(spTab);   // near the end: the next page
  if (typing) keyboard(SIDE, H - KEYBOARD_H, W - SIDE, typed);
}

function roomsPage(W: number, H: number): void {
  header('Enceintes');
  if (sys === null) { emptyState(W, H); return; }
  const s = sys as System, x0 = SIDE + P, w = W - SIDE - P * 2, sc = scrolls[ROOMS];
  pill('rooms/refresh', W - P - 140, 34, 'Actualiser', TEXT, FILL, () => { pollTopology(); pollRooms(); }, 'refresh-cw');
  beginScroll(sc, SIDE, 96, W - SIDE, H - 96);
  let y = 104 - sc.y;
  for (const g of s.groups) {
    const on = g === group, gg = g;
    const h = 76 + g.members.length * 60 + (g.members.length > 1 ? 60 : 0);
    rrect(x0, y, w, h, 16, CARD, 255);
    if (on) rrect(x0, y, 4, h, 2, ACCENT, 255);
    if (isPressed('room/g/' + g.id)) rrect(x0, y, w, 72, 16, 0xffffff, 15);
    cover(artOf(g), g.track.title !== '' ? g.track.title : g.track.station, x0 + 18, y + 14, 48, 8);
    label(F.bodyB, x0 + 80, y + 14, g.name(), TEXT, w - 260);
    const line = g.track.title !== '' ? g.track.title + (g.track.artist !== '' ? ' · ' + g.track.artist : '') : g.track.station;
    label(F.small, x0 + 80, y + 42, (g.playing() ? '' : g.state === 'PAUSED_PLAYBACK' ? 'En pause · ' : 'Arrêté · ') + line, TEXT2, w - 260);
    if (on) drawText(F.tinyB, x0 + w - 110, y + 30, 'CONTRÔLÉ', ACCENT, 255, 0);
    else { const bw = textWidth(F.smallB, 'Contrôler', 0) + 36; pill('room/sel/' + g.id, x0 + w - 18 - bw, y + 18, 'Contrôler', TEXT, FILL, () => select(gg)); }
    onTap('room/g/' + g.id, x0, y, w - 160, 72, () => { select(gg); home(); });
    let ry = y + 76;
    if (g.members.length > 1) {
      separator(x0 + 18, ry, w - 36);
      drawText(F.smallB, x0 + 18, ry + 20, 'Groupe', TEXT, 255, 0);
      slider('room/gv/' + g.id, x0 + 200, ry + 30, w - 290, g.volume >= 0 ? g.volume / 100 : 0, ACCENT, (v: number, done: boolean) => {
        const vol = Math.round(v * 100) as i32;
        if (vol !== gg.volume) { gg.volume = vol; volumeHeld = 1.5; volumeSender.push(async (): Promise<void> => { await s.setGroupVolume(gg, vol); }); }
      });
      drawText(F.smallB, x0 + w - 60, ry + 20, g.volume >= 0 ? '' + g.volume : '–', TEXT2, 255, 0);
      ry += 60;
    }
    for (const m of g.members) {
      const sp = m;
      separator(x0 + 18, ry, w - 36);
      label(F.label, x0 + 18, ry + 19, m.name, TEXT, 140);
      iconButton('room/mute/' + m.uuid, m.muted ? 'volume-x' : 'volume-2', x0 + 172, ry + 30, 20, m.muted ? ACCENT : TEXT2, () => attempt('Muet', async (): Promise<void> => { await s.setMute(sp, !sp.muted); }));
      slider('room/v/' + m.uuid, x0 + 200, ry + 30, w - 290, m.volume >= 0 ? m.volume / 100 : 0, 0xffffff, (v: number, done: boolean) => setRoomVolume(sp, v));
      drawText(F.smallB, x0 + w - 60, ry + 20, m.volume >= 0 ? '' + m.volume : '–', TEXT2, 255, 0);
      ry += 60;
    }
    y += h + 20;
  }
  // grouping: every room, checked when it plays with the group under control
  if (group !== null) {
    const g = group as Group;
    drawText(F.tinyB, x0 + 4, y + 10, ('Regrouper avec ' + g.coordinator.name).toUpperCase(), TEXT2, 255, 0);
    y += 36;
    const h = s.speakers.length * 56;
    rrect(x0, y, w, h, 16, CARD, 255);
    for (let i = 0; i < s.speakers.length; i++) {
      const sp = s.speakers[i], ry = y + i * 56, inside = sp.coordinator === g.coordinator.uuid, coord = sp.uuid === g.coordinator.uuid;
      if (i > 0) separator(x0 + 56, ry, w - 56);
      if (inside) { rrect(x0 + 16, ry + 16, 24, 24, 12, coord ? TEXT3 : ACCENT, 255); glyph('check', x0 + 20, ry + 20, 16, TEXT, 255, 3); }
      else { rrect(x0 + 16, ry + 16, 24, 24, 12, TEXT3, 255); rrect(x0 + 18, ry + 18, 20, 20, 10, CARD, 255); }
      label(F.label, x0 + 56, ry + 17, sp.name, coord ? TEXT2 : TEXT, w - 80);
      if (coord) continue;
      onTap('group/' + sp.uuid, x0, ry, w, 56, () => attempt('Regroupement', async (): Promise<void> => {
        if (inside) await s.leave(sp); else await s.join(sp, g);
        await sleep(800); await pollTopology(); await pollRooms();
      }));
    }
    y += h + 24;
  }
  sc.content = y + sc.y - 96;
  endScroll();
}

function settingsPage(W: number, H: number): void {
  header('Réglages');
  const x0 = SIDE + P, w = W - SIDE - P * 2;
  let y = 104;
  drawText(F.tinyB, x0 + 4, y, 'ÉCRAN', TEXT2, 255, 0); y += 24;
  card(x0, y, w, 120);
  drawText(F.label, x0 + 20, y + 18, 'Éteindre l\'écran sans contact après', TEXT, 255, 0);
  const delays: number[] = [30, 60, 120, 300, 600, 0];
  let sel: i32 = 2;
  for (let i = 0; i < delays.length; i++) if (delays[i] === cfg.sleep) sel = i as i32;
  segmented('set/sleep', x0 + 20, y + 58, ['30 s', '1 min', '2 min', '5 min', '10 min', 'Jamais'], sel, (i: i32) => {
    cfg.sleep = delays[i]; screen.delay = cfg.sleep; saveConfig();
  }, (w - 44) / 6);
  y += 144;
  drawText(F.tinyB, x0 + 4, y, 'SPOTIFY', TEXT2, 255, 0); y += 24;
  card(x0, y, w, 64);
  glyph('library', x0 + 20, y + 20, 24, spotify.ready() ? GREEN : TEXT3);
  label(F.label, x0 + 58, y + 21, spotify.ready() ? (spotifyUser !== '' ? `Connecté : ${spotifyUser}` : 'Connecté') : spotify.problem === 'login expired' ? 'Connexion expirée : refaire la connexion' : 'Non connecté (voir la page Spotify)', TEXT, w - 80);
  y += 88;
  drawText(F.tinyB, x0 + 4, y, 'SONOS', TEXT2, 255, 0); y += 24;
  card(x0, y, w, 64);
  glyph('speaker', x0 + 20, y + 20, 24, sys !== null ? GREEN : TEXT3);
  const n = sys !== null ? plural((sys as System).speakers.length, 'pièce') + ', ' + plural((sys as System).groups.length, 'groupe') : status;
  label(F.label, x0 + 58, y + 21, n, TEXT, w - 260);
  pill('set/find', x0 + w - 200, y + 12, 'Rechercher', TEXT, FILL, () => { sys = null; group = null; find(); }, 'refresh-cw');
  y += 88;
  drawText(F.tinyB, x0 + 4, y, 'BOUTONS PHYSIQUES', TEXT2, 255, 0); y += 24;
  card(x0, y, w, 64);
  label(F.small, x0 + 20, y + 12, 'Commandes UDP sur le port 7777 : toggle, play, pause, next, prev,', TEXT2, w - 40);
  label(F.small, x0 + 20, y + 34, 'vol+, vol-, radio <n>, wake (un ESP32 ou un téléphone sur le Wi-Fi).', TEXT2, w - 40);
}

function toastLayer(W: number, H: number): void {
  if (toastFor <= 0 || toastText === '') return;
  const tw = Math.min(W - SIDE - 80, textWidth(F.small, toastText, 0) + 44);
  const x = SIDE + (W - SIDE - tw) / 2, y = H - 74;
  cardShadow(x, y, tw, 46, 23);
  rrect(x, y, tw, 46, 23, 0x3a3a3c, 245);
  label(F.small, x + 22, y + 13, toastText, TEXT, tw - 44);
}

function draw(W: number, H0: number): void {
  clear(BG);
  SIDE = page === NOW && cfg.full ? 0 : 240;
  const H = H0 - TOP;
  if (page === NOW) {
    const art = group !== null ? artOf(group as Group) : '';
    if (art !== '' && backdrop(art, W, H0)) { rrect(0, 0, W, H0, 0, 0x000000, 110); }
    else gradient(0, 0, W, H0, 0, 0x2c2c2e, 0x000000, true, 255);
    const night = Math.max(0, Math.min(1, slideX));   // the other slides are on black, as StandBy
    if (night > 0) rrect(0, 0, W, H0, 0, 0x000000, Math.round(night * 255) as i32);
    for (let i: i32 = 0; i < SLIDES; i++) {   // the slides on the screen: one, two while it moves
      const o = Math.round((i - slideX) * W);
      if (Math.abs(o) >= W) continue;
      setTransform(1, 0, 0, 1, o, TOP); ui.ox = o; ui.oy = TOP;
      if (i === PLAYER) { nowPlaying(W, H); sidebar(W, H); }
      else if (i === CLOCK) clockSlide(W, H);
      else if (i === WEATHER) weatherSlide(W, H);
      else ringsSlide(W, H);
    }
    setTransform(1, 0, 0, 1, 0, TOP); ui.ox = 0;
  } else {
    setTransform(1, 0, 0, 1, 0, TOP); ui.oy = TOP;
    if (page === RADIOS) radiosPage(W, H);
    else if (page === SPOTIFY) spotifyPage(W, H);
    else if (page === ROOMS) roomsPage(W, H);
    else settingsPage(W, H);
    sidebar(W, H);
  }
  volumePopover(W, H);
  contextSheet(W, H);
  toastLayer(W, H);
  resetTransform(); ui.oy = 0;
  statusBar(W);
}

const DAYS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** The time and the date on the left, the group under control on the right (a touch opens the choice of the group). */
function statusBar(W: number): void {
  if (page !== NOW) rect(0, 0, W, TOP, BG);
  else if (Math.abs(slideX - CLOCK) < 1) rrect(0, 0, W, TOP, 0, BG, Math.round((1 - Math.abs(slideX - CLOCK)) * 255) as i32);   // over the clock's faces as they slide
  const c = clockParts(), m = c[1];
  const time = `${c[0]}:${m < 10 ? '0' : ''}${m}`;
  const ty = (TOP - fontAscent(F.smallB)) / 2;
  tabular(F.smallB, 20, ty, time, TEXT);
  drawText(F.small, 28 + tabularWidth(F.smallB, time), ty, `${DAYS[c[2]]} ${c[3]} ${MONTHS[c[4]]}`, TEXT2, 255, 0);
  if (page === NOW) for (let i: i32 = 0; i < SLIDES; i++) {   // where the carousel is
    const on = Math.max(0, 1 - Math.abs(slideX - i));
    rrect(W / 2 + (i - (SLIDES - 1) / 2) * 18 - 4, TOP / 2 - 4, 8, 8, 4, TEXT, Math.round(70 + 185 * on) as i32);
  }
  if (group === null) return;
  const g = group as Group, name = g.name(), nw = Math.min(360, textWidth(F.small, name, 0));
  const nx = W - 20 - nw;
  label(F.small, nx, ty, name, TEXT2, nw);
  glyph(g.playing() ? 'audio-lines' : 'speaker', nx - 24, (TOP - 16) / 2, 16, g.playing() ? GREEN : TEXT2);
  onTap('status/group', nx - 32, 0, nw + 52, TOP, () => { contextOpen = true; });
}
let minuteShown: i32 = -1, secondShown: i32 = -1;
/** Hours, minutes, weekday, day, month of the local time (on webOS the display sets TZ from zinc-helper). */
function clockParts(): i32[] {
  const d = new Date();
  return [d.getHours() as i32, d.getMinutes() as i32, d.getDay() as i32, d.getDate() as i32, d.getMonth() as i32];
}
// ---------------------------------------------------------------- preloading: nothing waits when a page opens
// The lists are fetched a few seconds after the start (they need no speaker); then each page is drawn once into a hidden picture, one a frame while nobody touches
// the screen, so the text, the icons and the covers of its first screen are ready (a cold page took 50 to 70 ms to draw on the tablet).
let preloaded = false;
async function preload(): Promise<void> {
  if (preloaded) return;
  preloaded = true;
  await sleep(2000);   // the first frames and the speakers first
  loadPopular();
  for (let t: i32 = 0; t < 4; t++) {
    loadSpotify(t, false);
    while (spState[t] === 'loading') await sleep(200);
    await sleep(300);
  }
  while (popularState === 'loading') await sleep(200);
  for (const k of [NOW * 10 + CLOCK, NOW * 10 + WEATHER, NOW * 10 + RINGS_SLIDE, RADIOS * 10, RADIOS * 10 + 1, SPOTIFY * 10, SPOTIFY * 10 + 1, SPOTIFY * 10 + 2, SPOTIFY * 10 + 3, ROOMS * 10, SETTINGS * 10]) warmQueue.push(k);
}
const warmQueue: i32[] = [];   // page * 10 + tab
let warmImg: i32 = -1;
function warmOne(W: number, H: number): void {
  const k = warmQueue.shift() as i32;
  if (warmImg < 0) warmImg = createImage(W as i32, H as i32);
  const p = page, rt = radioTab, st = spTab, ty = typing, vo = volumeOpen, co = contextOpen, sx = slideX;
  page = Math.floor(k / 10) as i32;
  if (page === NOW) slideX = k % 10;
  if (page === RADIOS) radioTab = k % 10;
  if (page === SPOTIFY) spTab = k % 10;
  typing = false; volumeOpen = false; contextOpen = false;
  beginImage(warmImg); draw(W, H); endImage();
  if (warmQueue.length === 0) { destroyImage(warmImg); warmImg = -1; }   // a screen of pixels and its texture, kept for nothing after
  page = p; radioTab = rt; spTab = st; typing = ty; volumeOpen = vo; contextOpen = co; slideX = sx;
  ui.dirty = true;   // the zones of the page on the screen are made again
}
/** Covers and logos of the pages not shown, fetched one at a time while the screen is idle. */
function prefetchSome(): void {
  const lists: Station[][] = [mine, popular];
  for (const l of lists) for (const st of l) if (!prefetch(st.art)) return;
  for (let t = 0; t < 4; t++) for (const it of spLists[t]) if (!prefetch(t < 2 ? it.art : it.thumb)) return;
}

// ---------------------------------------------------------------- the loop
let tGroup = 0, tTopo = 0, tRooms = 0, tSpotify = 0, tSecond = 0;

onFrame((dt: number) => {
  const W = width(), H = height();
  clockS += dt;
  picturesTick();
  const wasAsleep = screen.asleep;
  input(dt);
  if (wasAsleep && !screen.asleep) { tGroup = 99; tTopo = 99; ui.dirty = true; }   // woken: fresh state at once
  if (page === NOW && slide === CLOCK) screen.idle = 0;   // StandBy: the clock stays on
  if (screen.tick(dt)) { volumeOpen = false; typing = false; page = NOW; ui.dirty = true; }
  // polling: often while someone looks, rarely while the screen is off
  const slow = screen.asleep ? 10 : 1;
  tGroup += dt; tTopo += dt; tRooms += dt; tSpotify += dt; tSecond += dt;
  if (tGroup >= 2 * slow) { tGroup = 0; if (volumeHeld <= 0) pollGroup(); }
  if (tTopo >= 15 * slow) { tTopo = 0; pollTopology(); }
  if (sys === null && !finding && tTopo === 0) find();   // no speaker yet (Wi-Fi coming back after a sleep...): search again every 15 s
  if ((page === ROOMS || (page === NOW && slide === RINGS_SLIDE)) && tRooms >= 4 && !screen.asleep) { tRooms = 0; if (volumeHeld <= 0) pollRooms(); }
  // the popover: the rooms follow a change of the group's volume (Sonos scales each room), read once the sliders are let go
  if (volumeOpen && tRooms >= 1) { tRooms = 0; if (volumeHeld <= 0) pollMembers(); }
  if (page === NOW && group !== null && (group as Group).track.source === 'spotify' && tSpotify >= 5 && !screen.asleep) { tSpotify = 0; pollSpotify(); }
  if (volumeHeld > 0) volumeHeld -= dt;
  weatherTick(dt, !screen.asleep);
  // animations
  if (toastFor > 0) { toastFor -= dt; if (toastFor <= 0) ui.dirty = true; }
  if (volumeOpen && dragZone === null) { volumeFor -= dt; if (volumeFor <= 0) { volumeOpen = false; ui.dirty = true; } }
  let moving = false;
  for (const s of scrolls) if (s.step(dt)) { ui.dirty = true; moving = true; }
  if (!swiping && slideX !== slide) {   // the carousel settles on its slide
    slideX += (slide - slideX) * (1 - Math.exp(-dt * 14));
    if (Math.abs(slide - slideX) < 0.002) slideX = slide;
    ui.dirty = true; moving = true;
  }
  if (!faceSwipe && faceY !== face) {   // and the clock on its face
    faceY += (face - faceY) * (1 - Math.exp(-dt * 14));
    if (Math.abs(face - faceY) < 0.002) faceY = face;
    ui.dirty = true; moving = true;
  }
  if (page === NOW && slideX > 0 && slideX < 2 && !screen.asleep) {   // the clock on the screen: a frame when the second turns, not a second of frames later
    const sec = new Date().getSeconds() as i32;
    if (sec !== secondShown) { secondShown = sec; ui.dirty = true; }
  }
  if (tSecond >= 1) {
    tSecond = 0;
    if (page === NOW && group !== null && (group as Group).playing()) ui.dirty = true;
    const m = clockParts()[1];
    if (m !== minuteShown) { minuteShown = m; ui.dirty = true; }
  }
  // pictures and preloading, never while a finger is down or a list moves
  idleFor += dt;
  if (!pointerDown() && !moving && !screen.asleep) {
    if (decodeOne()) ui.dirty = true;
    else if (idleFor > 1 && warmQueue.length > 0) warmOne(W, H);
    else if (idleFor > 1.5) prefetchSome();
  }

  if (ui.animating && !screen.asleep) ui.dirty = true;   // a spinner or a picture fading in was drawn last frame
  if (!ui.dirty) { keep(); return; }
  ui.dirty = false; ui.animating = false;
  resetZones();
  if (screen.asleep) { clear(0x000000); return; }
  const t0 = performance.now();
  draw(W, H);
  perf(dt, performance.now() - t0);
});

// ponytail: frame times to /tmp/music-perf.log while /tmp/music-perf exists (measuring on the tablet); remove once the pages are smooth
const perfOn = exists('/tmp/music-perf');
let lastDecodes = 0, lastDecodeMs = 0;
function perf(dt: number, drawMs: number): void {
  if (!perfOn) return;
  const d = decodeStats(), n = d[0] - lastDecodes, ms = d[1] - lastDecodeMs;
  lastDecodes = d[0]; lastDecodeMs = d[1];
  if (dt < 0.03 && drawMs < 12 && n === 0) return;
  try { appendText('/tmp/music-perf.log', `${Math.round(clockS * 1000)} page ${page} dt ${Math.round(dt * 1000)} draw ${Math.round(drawMs)} decodes ${n} ${Math.round(ms)}ms\n`); } catch (e) { /* tmp full */ }
}

if (cfg.lat !== 0 || cfg.lon !== 0) setPlace(cfg.lat, cfg.lon, cfg.city);
recall();
find();
listenRemote();
preload();
