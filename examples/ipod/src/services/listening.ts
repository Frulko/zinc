// What the app plays counts (services/scrobble.ts for the rule and the services): on the iPod (its play counts and last played),
// on Last.fm and on ListenBrainz. The player is followed, not changed: once a second the track it shows and whether it plays are
// read (from this computer, a Sonos group or a remote iPod alike), the time heard is added to the track's listen, and the listen
// that comes to count is queued for the services and for the iPod. A track the player takes up again where it was left (the app
// restarted on it) adds to the listen it left.
// The iPod's plays wait in <cache>/plays.json (services/cache.ts) until they can be written: a local iPod while Allow changes is on,
// a remote one through its daemon's POST /api/played (which keeps them itself while it is read only).
import * as ipod from 'zinc:ipod';
import * as fs from 'zinc:fs';
import { current, isPlaying, position } from './player';
import { openUrl } from 'zinc:system/opener';
import * as net from 'zinc:net';
import * as sys from 'zinc:sys';
import { Scrobbler, Scrobble, Accounts, lastfmToken, lastfmWebAuthUrl, lastfmSession, LastfmSessionInfo, lastfmCheck, listenbrainzCheck, appendHistory, isoLocal } from './scrobble';
import { output } from './sonos';
import { loadConfig, saveConfig, AppConfig } from './config';
import { log, backupPlace } from './log';
import * as cache from './cache';
import * as remote from './remote';
import { podIsRemote } from './ipod';
import { allowChanges } from '../state';

const TICK_MS: i32 = 1000;
const REPORT_MS: number = 15000;   // the time heard is handed to the scrobbler at least this often while a track plays
const RESUMED_S: number = 5;       // a track first seen past this position was taken up again: it continues its listen
const RETRY_MS: i32 = 300000;      // the queues are sent again this often

export const scrobbler = new Scrobbler(`${backupPlace()}/scrobble`);
scrobbler.log = log;

interface PlaysFile { plays: ipod.Play[]; }

let seen: ipod.Track | null = null;
let listenId = '';
let startedAt: number = 0;
let unreported: number = 0;
let podKey = '';            // the iPod the track belongs to (its cache folder)
let writing = false;
let waitingPlays: i32 = -1; // the iPod's plays waiting (-1: not read yet)
let source = 'mac';         // where the track plays: mac | sonos | remote

/** The accounts of the settings, given to the scrobbler (at start and after the settings change). */
export function useAccounts(c: AppConfig): void {
  const a = new Accounts();
  a.lastfmKey = c.lastfmKey; a.lastfmSecret = c.lastfmSecret; a.lastfmSession = c.lastfmSession; a.listenbrainzToken = c.listenbrainzToken;
  scrobbler.accounts = a;
}

function scrobbleOf(t: ipod.Track, at: number): Scrobble {
  return { artist: t.artist !== '' ? t.artist : t.albumArtist, track: t.title, album: t.album, albumArtist: t.albumArtist, durationS: Math.round(t.durationMs / 1000), at: at };
}

/** Hands the time heard since the last report to the scrobbler; `left`: the track was left (or the app quits), a line goes to the
 *  iPod's listen history (<cache>/history.jsonl). */
function report(left: boolean = false): void {
  if (seen === null || (unreported <= 0 && !left)) return;
  const t = seen as ipod.Track, ms = unreported;
  unreported = 0;
  if (t.title === '' || (t.artist === '' && t.albumArtist === '')) return;   // nothing a service could match
  if (scrobbler.heard(listenId, scrobbleOf(t, startedAt), ms)) countOnIpod(t.id, Math.floor(Date.now() / 1000));
  if (!left) return;
  appendHistory(`${podKey}/history.jsonl`, { listen: listenId.slice(podKey.length + 1), trackId: t.id, artist: t.artist !== '' ? t.artist : t.albumArtist,
    title: t.title, album: t.album, durationMs: t.durationMs, heardMs: scrobbler.heardMs, startedAt: isoLocal(startedAt * 1000), source: source,
    counted: scrobbler.wasCounted, skipped: !scrobbler.wasCounted });
}

function begin(t: ipod.Track): void {
  const now = Date.now();
  podKey = cache.cacheDir();
  const prefix = `${podKey}|${t.id}|`;
  const resumed = position() > RESUMED_S ? scrobbler.openListen(prefix) : '';
  listenId = resumed !== '' ? resumed : `${prefix}${now}`;
  startedAt = resumed !== '' ? Number(resumed.slice(prefix.length)) / 1000 : now / 1000 - position();
  seen = t;
  unreported = 0;
  source = output() !== '' ? 'sonos' : podIsRemote() ? 'remote' : 'mac';
  scrobbler.nowPlaying(scrobbleOf(t, startedAt));
}

function tick(): void {
  const t = current();
  if (t !== seen) {
    report(true);   // the track left: what was heard of it
    seen = null;
    if (t !== null && isPlaying()) begin(t as ipod.Track);
  }
  if (seen === null || !isPlaying()) { report(); return; }
  unreported += TICK_MS;
  if (unreported >= REPORT_MS) report();
  if (waitingPlays > 0 && !writing && !podIsRemote() && allowChanges()) writePlays();
}

// ---- the iPod's plays

function playsFile(): string { return `${cache.cacheDir()}/plays.json`; }
function readPlays(): ipod.Play[] {
  try { if (fs.exists(playsFile())) { const f: PlaysFile = JSON.parse(fs.readText(playsFile())); return f.plays; } } catch (e) { /* lost: none */ }
  return [];
}
function keepPlays(plays: ipod.Play[]): void {
  const f: PlaysFile = { plays: plays };
  try { fs.writeText(playsFile(), JSON.stringify(f)); } catch (e) { console.error(`ipod: ${playsFile()}: ${(e as Error).message}`); }
  waitingPlays = plays.length;
}

/** The plays waiting to be written to the open iPod. */
export function playsWaiting(): i32 { if (waitingPlays < 0) waitingPlays = readPlays().length; return waitingPlays; }

function countOnIpod(trackId: string, at: number): void {
  if (cache.cacheDir() !== podKey) return;   // another iPod was opened meanwhile: its ids are not this track's
  const plays = readPlays();
  plays.push({ id: trackId, count: 1, at: at });
  keepPlays(plays);
  writePlays();
}

/** Writes the waiting plays to the open iPod: a remote one through its daemon, a local one when Allow changes is on. Kept on a failure. */
export async function writePlays(): Promise<void> {
  if (writing) return;
  const plays = readPlays();
  waitingPlays = plays.length;
  if (plays.length === 0 || (!podIsRemote() && !allowChanges())) return;
  writing = true;
  try {
    let what = '';
    if (podIsRemote()) what = await remote.played(plays);
    else { const counted = await ipod.played(plays); what = `${counted.length} track${counted.length === 1 ? '' : 's'} counted on the iPod`; }
    keepPlays(readPlays().slice(plays.length));   // plays counted meanwhile stay
    log('Play counts', what, true);
  } catch (e) {
    log('Play counts', `${plays.length} waiting: ${(e as Error).message}`, false);
  }
  writing = false;
}

/** Starts following the player (main.tsx), and sends what the queues hold now and every few minutes. */
export function startListening(): void {
  useAccounts(loadConfig());
  setInterval(tick, TICK_MS);
  scrobbler.flush();
  setInterval(() => { scrobbler.flush(); if (podIsRemote()) writePlays(); }, RETRY_MS);
}

/** For a clean quit: the time heard of the track playing is handed over now (its listen and the queues are files already: nothing
 *  waits for the network). */
export async function flush(): Promise<void> { report(true); seen = null; }

// ---- the accounts (the Settings page)

// The sign-in is Last.fm's web flow: the browser's approval page is given a callback on this computer (a free port, a random path);
// Last.fm sends the browser back to it with an approved token, which this server trades for the session at once and says so in
// the browser. (The desktop flow, a token approved then asked for, broke when the API account has a callback URL of its own.)
const LASTFM_WAIT_MS: number = 300000;   // how long the approval is waited for
let cbPort: i32 = 0, cbPath = '', cbName = '', cbError = '';

function stopCallback(): void { if (cbPort !== 0) net.stop(cbPort); cbPort = 0; }

function page(title: string, text: string): net.Reply {
  const esc = (t: string): string => t.split('&').join('&amp;').split('<').join('&lt;');
  return { status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<body style="font:16px -apple-system,sans-serif;margin:15vh auto;max-width:460px;text-align:center"><h2>${esc(title)}</h2><p>${esc(text)}</p></body>` };
}

/** Saves the key and secret, starts the callback and opens Last.fm's approval page in the browser; awaitLastfm() waits for it. */
export async function startLastfm(key: string, secret: string): Promise<void> {
  const c = loadConfig();
  c.lastfmKey = key.trim(); c.lastfmSecret = secret.trim();   // a session already there stays until a new one comes
  if (c.lastfmKey === '' || c.lastfmSecret === '') throw new Error('Last.fm: paste the API key and the shared secret first');
  saveConfig(c);
  useAccounts(c);
  stopCallback();
  let path = '/lastfm-';
  for (const b of sys.randomBytes(12)) path += (b < 16 ? '0' : '') + (b as i32).toString(16);
  cbPath = path; cbName = ''; cbError = '';
  // a browser that asks twice (a reload, a preload) is answered from the first trade: a token trades for a session only once
  let tradeToken = '';
  let trade: Promise<LastfmSessionInfo> | null = null;
  let hits: i32 = 0;
  cbPort = net.serveAsync(0, async (req: net.Request): Promise<net.Reply> => {
    const q = req.path.indexOf('?');
    if ((q < 0 ? req.path : req.path.slice(0, q)) !== path) return { status: 404, body: 'not found', contentType: 'text/plain' };
    const params = new URLSearchParams(q < 0 ? '' : req.path.slice(q + 1));
    const token = params.get('token') ?? '';
    hits++;
    log('Last.fm', `the browser came back (${hits}): ${token === '' ? 'no token' : `a token of ${token.length} characters`}`, token !== '');
    if (token === '') return page('Last.fm did not approve', 'No token came back. Go back to the iPod app and press Sign in again.');
    if (token !== tradeToken || trade === null) { tradeToken = token; trade = lastfmSession(c.lastfmKey, c.lastfmSecret, token); }
    try {
      const s = await (trade as Promise<LastfmSessionInfo>);
      if (cbName === '') cbName = signedIn(s.key, s.name);
      return page(`Connected as ${s.name}`, 'Your listens now go to Last.fm. You can close this tab and go back to the iPod app.');
    } catch (e) {
      cbError = (e as Error).message;
      log('Last.fm', `the session was refused: ${cbError}`, false);
      return page('Last.fm sign-in failed', `${cbError}. Go back to the iPod app and press Sign in again.`);
    }
  });
  await openUrl(lastfmWebAuthUrl(c.lastfmKey, `http://127.0.0.1:${cbPort}${path}`));
}

/** Waits for the approval in the browser: resolves with the user's name, or '' when another sign-in started meanwhile; throws when
 *  the time is up or Last.fm refused the session. */
export async function awaitLastfm(): Promise<string> {
  const path = cbPath;
  const until = Date.now() + LASTFM_WAIT_MS;
  while (Date.now() < until) {
    await new Promise<void>((r: () => void) => { setTimeout(r, 300); });
    if (cbPath !== path) return '';
    if (cbName !== '' || cbError !== '') {
      setTimeout(stopCallback, 2000);   // the browser's page is sent first
      if (cbError !== '') throw new Error(cbError);
      return cbName;
    }
  }
  stopCallback();
  throw new Error('Last.fm: not approved within 5 minutes: press Sign in again');
}

function signedIn(key: string, name: string): string {
  const c = loadConfig();
  c.lastfmSession = key; c.lastfmUser = name;
  saveConfig(c);
  useAccounts(c);
  log('Last.fm', `signed in as ${name}`, true);
  scrobbler.flush();
  return name;
}

/** Keeps the Last.fm key and secret as they are typed (the next start shows them again). */
export function saveLastfmKeys(key: string, secret: string): void {
  const c = loadConfig();
  if (c.lastfmKey === key.trim() && c.lastfmSecret === secret.trim()) return;
  c.lastfmKey = key.trim(); c.lastfmSecret = secret.trim();
  saveConfig(c);
  useAccounts(c);
}

/** Asks Last.fm which account the saved session opens ("Connected: ann · 1234 scrobbles"); not signed in yet, whether the key and the
 *  secret work (a signed auth.getToken). */
export async function testLastfm(): Promise<string> {
  const c = loadConfig();
  if (c.lastfmKey === '' || c.lastfmSecret === '') throw new Error('Last.fm: paste the API key and the shared secret first');
  if (c.lastfmSession === '') { await lastfmToken(c.lastfmKey, c.lastfmSecret); return 'The API key and the secret work: press Sign in to send your listens'; }
  const a = new Accounts();
  a.lastfmKey = c.lastfmKey; a.lastfmSecret = c.lastfmSecret; a.lastfmSession = c.lastfmSession;
  return `Connected: ${await lastfmCheck(a)}`;
}

/** Asks ListenBrainz whose `token` is: the user name. */
export async function testListenbrainz(token: string): Promise<string> {
  if (token.trim() === '') throw new Error('ListenBrainz: paste the user token first');
  return await listenbrainzCheck(token.trim());
}

export function signOutLastfm(): void {
  const c = loadConfig();
  c.lastfmSession = ''; c.lastfmUser = '';
  saveConfig(c);
  useAccounts(c);
  log('Last.fm', 'signed out: listens are no longer sent', true);
}

/** The ListenBrainz token ('' turns it off). */
export function setListenbrainz(token: string): void {
  const c = loadConfig();
  c.listenbrainzToken = token.trim();
  saveConfig(c);
  useAccounts(c);
  log('ListenBrainz', c.listenbrainzToken !== '' ? 'token saved' : 'turned off', true);
  scrobbler.flush();
}

/** The most a remote iPod's songs take on this computer, in MB (0: no limit). */
export function setAudioCacheMb(mb: number): void {
  const c = loadConfig();
  if (mb >= 0) c.audioCacheMb = Math.floor(mb);
  saveConfig(c);
}
