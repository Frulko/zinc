// Zinc Relay's state and actions, without the windows: the settings file, the capture loop, the filters (apps, sites, pause, Focus),
// the avatars, the relay to the tablet and what the tablet asks back (mute, open, ack), the test notifications and the permissions.
// main.tsx draws the tray menu and the window from it and calls these actions.
import * as fs from 'zinc:fs';
import { env, args, pid } from 'zinc:sys';
import { hostname } from 'zinc:os';
import * as link from 'zinc:link';
import * as mac from 'zinc:notifymac';
import * as autostart from 'zinc:system/autostart';
import { Settings, AppEntry, Notif, FocusState, settingsFromJson, domainOf } from './model';
import { Capture } from './capture';
import { Relay } from './relay';
import { Focus } from './focus';
import { Avatars } from './avatars';

/** Where the settings live: RELAY_DIR (scripts and tests), else ~/Library/Application Support/Zinc Relay. */
function settingsDir(): string {
  const d = env('RELAY_DIR');
  return d !== '' ? d : env('HOME') + '/Library/Application Support/Zinc Relay';
}
export const DIR: string = settingsDir();
const FILE: string = DIR + '/settings.json';
const DB: string = env('RELAY_DB') !== '' ? env('RELAY_DB') : mac.dbPath();
/** System Settings at Privacy & Security, on the pane of each permission. */
export const PANE_FDA: string = 'x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles';
export const PANE_CONTACTS: string = 'x-apple.systempreferences:com.apple.preference.security?Privacy_Contacts';
export const PANE_NETWORK: string = 'x-apple.systempreferences:com.apple.preference.security?Privacy_LocalNetwork';
export const PANE_NOTIFY: string = 'x-apple.systempreferences:com.apple.Notifications-Settings.extension';
/** A started program does not take the focus (tests, agents): opening an app on a tap is then only reported. */
const BACKGROUND: boolean = env('ZINC_BACKGROUND') === '1';

function computerName(): string {
  const h = hostname();
  return h.endsWith('.local') ? h.slice(0, h.length - 6) : h;
}

export const settings: Settings = fs.exists(FILE) ? settingsFromJson(fs.readText(FILE)) : new Settings();
export const capture: Capture = new Capture(DB);
export const focus: Focus = new Focus();
export const avatars: Avatars = new Avatars(DB);
export let focusNow: FocusState = new FocusState('', '');
let listeners: (() => void)[] = [];
/** Runs `cb` after every change of the state (a notification counted, the tablet's state, a setting). */
export function onChange(cb: () => void): void { listeners.push(cb); }
function changed(): void { for (const cb of listeners) cb(); }

let dirty = false;
export function save(): void {
  fs.mkdir(DIR, true);
  fs.writeText(FILE + '.tmp', settings.toJson());
  fs.rename(FILE + '.tmp', FILE);
  dirty = false;
}
function touch(): void { dirty = true; save(); changed(); }

/** The end-to-end test: '' none yet, then 'posted', 'caught' (the capture read it back), 'acked' (the tablet showed it), or why it failed. */
export class Test { state: string = ''; marker: string = ''; id: string = ''; direct: string = ''; }
export const test: Test = new Test();

export const relay: Relay = new Relay(env('LINK_SERVICE') !== '' ? env('LINK_SERVICE') : 'notify', computerName(), () => changed(), (what: string, a: string, b: string) => {
  if (what === 'mute') {
    if (a !== '') settings.setApp(a, appName(a), false);
    if (b !== '') settings.setDomain(b, false);
    console.log('muted from the tablet: ' + (a !== '' ? 'an app' : 'a site'));
    touch();
  } else if (what === 'ack') {
    if (a === test.id && test.id !== '') { test.state = 'acked'; console.log('test acknowledged by the tablet'); changed(); }
    if (a === test.direct && test.direct !== '') { test.direct = ''; console.log('direct test acknowledged by the tablet'); changed(); }
  } else if (what === 'open') openTapped(a, b);
});

/** The person tapped a relayed notification on the tablet: what clicking it on the Mac does. The record's default action URL (`durl`)
 *  with its app when there is one, else the app itself (NSWorkspace). Brought to the front, unless this run must not take the focus. */
function openTapped(app: string, url: string): void {
  if (app === '') { console.log('open: not one of the last notifications'); return; }
  console.log('open ' + app + (url !== '' ? ' with its url' : ''));
  if (!BACKGROUND) mac.open(app, url);
}

const names: Map<string, string> = new Map<string, string>();
/** The name the person knows an app by (its bundle's), the id when it is not installed. */
export function appName(id: string): string {
  const n = names.get(id);
  if (n !== undefined) return n;
  const i = mac.appInfo(id);
  const name = i === null || i.name === '' ? id : i.name;
  names.set(id, name);
  return name;
}

/** Counts of this run, the only trace of the notifications the relay keeps besides the settings' counts (their text is never logged). */
export class Counts { relayed: i32 = 0; blocked: i32 = 0; paused: i32 = 0; focus: i32 = 0; }
export const counts: Counts = new Counts();

function handle(n: Notif): void {
  const name = appName(n.app);
  const domain = domainOf(n, n.app, name);
  if (test.marker !== '' && n.body.indexOf(test.marker) >= 0) { test.state = 'caught'; test.id = n.id; console.log('test caught'); }   // the end-to-end test
  const why = settings.decide(n, name, domain, focusNow);
  if (why === '') {
    const avatar = n.kind === 'message' ? relay.keep(avatars.of(n)) : '';
    relay.relay(n, name, domain, avatar, relay.keep(avatars.attachment(n)));
    counts.relayed++;
  } else if (why === 'paused') counts.paused++;
  else if (why === 'focus') counts.focus++;
  else counts.blocked++;
  dirty = true;
}

let focusTicks = 0;
let watchMode = false;
function tick(): void {
  const wasProblem = capture.problem;
  if (focusTicks++ % 3 === 0) {
    const f = focus.now();
    if (f.id !== focusNow.id) { focusNow = f; console.log(f.id === '' ? 'focus off' : 'focus on'); dirty = true; }
  }
  // Always poll on a safety fallback (every 5th tick ≈ 500 ms) so a missed file event never drops a notification.
  const safety = (focusTicks % 5 === 0);
  // Research (wechat-priority-notifier, AgentMonitors): no push API exists for other apps' notifications, and file watching
  // on TCC-protected paths is fragile (WAL writes often do not fire VNODE events). Short polling is the field consensus.
  for (const n of capture.poll()) handle(n);
  if (dirty) { save(); changed(); }
  else if (wasProblem !== capture.problem) changed();
}

export function setPaused(on: boolean): void { settings.paused = on; console.log(on ? 'paused' : 'resumed'); touch(); }
export function setApp(a: AppEntry, allowed: boolean): void { a.allowed = allowed; touch(); }
export function setDomain(d: string, allowed: boolean): void { settings.setDomain(d, allowed); touch(); }
export function setFocusPolicy(p: string): void { settings.focus = p; touch(); }
export function setFocusMode(id: string, p: string): void { settings.focusModes.set(id, p); touch(); }
/** Blocks an app before it sends anything: the bundle the person chose in the picker. False when it is not an app. */
export function blockApp(path: string): boolean {
  const i = mac.appInfo(path);
  if (i === null || i.id === '') return false;
  names.set(i.id, i.name);
  settings.setApp(i.id, i.name, false);
  touch();
  return true;
}
export function welcomed(): void { settings.welcomed = true; touch(); }
export function skip(step: string): void { if (settings.skipped.indexOf(step) < 0) settings.skipped.push(step); touch(); }

/** Start at login: the login item of SMAppService (macOS 13+) when the system takes it, else a LaunchAgent (zinc:system/autostart). */
export async function setLogin(on: boolean): Promise<string> {
  const why = mac.setLogin(on);
  if (why !== '') { if (on) await autostart.enable(true); else await autostart.disable(); }
  changed();
  return why === '' ? 'login item' : 'LaunchAgent';
}
export async function loginOn(): Promise<boolean> { const s = mac.loginStatus(); return s === 'enabled' || s === 'requires approval' || await autostart.isEnabled(); }

/** Pairs with the tablet at `host:port` (typed, or found) with its code; the reason when it fails, '' when it worked. */
export async function pairWith(to: link.Address, code: string): Promise<string> {
  try {
    const name = await relay.pair(to, code);
    console.log('paired ' + name);
    return '';
  } catch (e) {
    const m = (e as Error).message;
    console.log('pairing failed: ' + m);
    return m.startsWith('zinc:link: ') ? m.slice(11) : m;
  }
}
/** "192.168.1.20:7744" or "nexus.local" (the default port) as an address; null when it is not one. */
export function parseAddress(s: string): link.Address | null {
  const t = s.trim();
  if (t === '') return null;
  const c = t.lastIndexOf(':');
  if (c < 0) return { host: t, port: link.DEFAULT_PORT };
  const port = parseInt(t.slice(c + 1));
  if (!(port > 0 && port < 65536)) return null;
  return { host: t.slice(0, c), port: port };
}

/** "Directement à la tablette": a made-up notification of Zinc Relay itself, straight over the channel (no filter). */
export function testDirect(): void {
  const n = new Notif('test-' + Date.now(), 'dev.zinc.notify-relay');
  n.title = 'Zinc Relay';
  n.subtitle = 'Notification de test';
  n.body = 'Envoyée directement à la tablette depuis ' + relay.host + '.';
  n.date = Math.floor(Date.now() / 1000);
  test.direct = n.id;
  relay.relay(n, 'Zinc Relay', '', '');
  console.log('direct test sent');
  changed();
}
/** "Via macOS (de bout en bout)": a real notification posted on this Mac, which the capture reads back from Notification Center's
 *  database and relays like any other; the tablet's ack closes the loop. */
export function testEndToEnd(): string {
  test.marker = 'zr-' + Math.floor(Math.random() * 1e9);
  test.id = '';
  const why = mac.postNotification('Zinc Relay : test de bout en bout', 'Si la tablette affiche ceci, tout fonctionne. (' + test.marker + ')');
  test.state = why === '' ? 'posted' : why;
  console.log(why === '' ? 'test posted' : 'test not posted: ' + why);
  changed();
  return why;
}

/** Scripts: RELAY_CODE pairs with the first tablet found with a pairing open (or the one at RELAY_ADDR) without the window. */
function scripted(): void {
  const code = env('RELAY_CODE');
  if (code === '') return;
  const at = parseAddress(env('RELAY_ADDR'));
  if (at !== null) { pairWith(at as link.Address, code); return; }
  let asked = false;
  onChange(() => {
    if (asked) return;
    for (const p of relay.found) if (p.pairing) { asked = true; pairWith(p, code); return; }
  });
}

export function start(): void {
  link.init({ name: 'Zinc Relay · ' + computerName(), store: env('LINK_STORE') });
  relay.start();
  scripted();
  const watch = args().indexOf('--watch') >= 0 || env('RELAY_WATCH') === '1';
  watchMode = watch;
  if (watch) mac.watchDb(DB);
  const pollMs = watch ? 100 : (parseInt(env('RELAY_POLL_MS')) > 0 ? parseInt(env('RELAY_POLL_MS')) : 1000);
  console.log('capture mode: ' + (watch ? 'watch (file events + ' + pollMs + 'ms fallback)' : 'poll ' + pollMs + 'ms'));
  tick();   // the first poll sets where the news start
  setInterval(() => tick(), pollMs);
  let lastState = '';
  onChange(() => { if (relay.state !== lastState) { lastState = relay.state; console.log('tablet ' + relay.state); } });
  console.log('ready pid ' + pid() + (capture.problem !== '' ? ' capture: ' + capture.problem : ''));
}
export const startedHidden: boolean = args().indexOf('--hidden') >= 0;
/** `--inspect [n]`: the shape of the newest n records (keys, types, sizes; never a value), then the program ends. */
export function inspectAsked(): i32 {
  const a = args();
  const i = a.indexOf('--inspect');
  if (i < 0) return 0;
  const n = i + 1 < a.length ? parseInt(a[i + 1]) : 20;
  return n > 0 ? n : 20;
}
