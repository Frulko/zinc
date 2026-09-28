// Devices: apps announcing a remote display on the LAN (zinc:remote discovery), ssh devices added by hand for
// deploys (kept in zinc:storage), and the live preview session shown in the Robot view.
import { createSignal } from 'zinc:ui/solid';
import * as remote from 'zinc:remote';
import * as storage from 'zinc:storage';
import { PREVIEW_PORT } from './runner';

// ---------------------------------------------------------------- discovery
const [appsSig, setApps] = createSignal<remote.App[]>([]);
export function discovered(): remote.App[] { return appsSig(); }
export function startDiscovery(): void { remote.discover((list: remote.App[]) => { setApps(list); }); }

// ---------------------------------------------------------------- ssh devices (user@host)
const [sshSig, setSsh] = createSignal<string[]>(loadSsh());
function loadSsh(): string[] { const s = storage.get('studio.devices'); if (s === '') return []; return s.split('\n'); }
export function sshDevices(): string[] { return sshSig(); }
/** Adds user@host; returns why it was refused ('' when added). */
export function addSsh(user: string, host: string): string {
  const u = user.trim(), h = host.trim();
  if (u === '' || h === '') return 'User and host are required';
  if (u.indexOf(' ') >= 0 || h.indexOf(' ') >= 0 || u.indexOf('@') >= 0 || h.startsWith('-')) return 'Invalid user or host';
  const d = `${u}@${h}`;
  if (sshSig().indexOf(d) >= 0) return 'Already in the list';
  const list = sshSig().slice();
  list.push(d);
  setSsh(list);
  storage.set('studio.devices', list.join('\n'));
  return '';
}
export function removeSsh(d: string): void {
  const list = sshSig().filter((x: string) => x !== d);
  setSsh(list);
  storage.set('studio.devices', list.join('\n'));
}

// ---------------------------------------------------------------- preview session
let session: remote.Session | null = null;
let wanted = '';          // host:port we are trying to reach ('' = none)
let retry = -1;
const [previewSig, setPreview] = createSignal<string>('Not connected');
const [statsSig, setStats] = createSignal<string>('');
const [connectedSig, setConnected] = createSignal<boolean>(false);
export function previewStatus(): string { return previewSig(); }
export function previewStats(): string { return statsSig(); }
export function previewConnected(): boolean { return connectedSig(); }
export function previewTarget(): string { return wanted; }

/** Connects the Robot view to host:port, retrying every 500 ms while the app starts. */
export function connectPreview(host: string, port: i32): void {
  disconnectPreview();
  wanted = `${host}:${port}`;
  setPreview(`Connecting to ${wanted}...`);
  attempt(host, port, wanted);
}
// The callbacks are created in plain functions: a closure made inside an async function that captures its
// locals must not outlive it (Zinc async frames are freed when they complete).
async function attempt(host: string, port: i32, key: string): Promise<void> {
  try {
    const s = await remote.connect(host, port);
    opened(s, host, port, key);
  } catch (e) {
    failed(host, port, key);
  }
}
function opened(s: remote.Session, host: string, port: i32, key: string): void {
  if (wanted !== key) { s.close(); return; }
  session = s;
  setConnected(true);
  setPreview(`${s.name} · ${host}:${port}`);
  s.onClose(() => { if (session === s) { setConnected(false); setPreview(`${key}: connection lost, retrying...`); } });
  s.onOpen(() => { if (session === s) { setConnected(true); setPreview(`${s.name} · ${key}`); } });
}
function failed(host: string, port: i32, key: string): void {
  if (wanted !== key) return;
  retry = setTimeout(() => { retry = -1; if (wanted === key) attempt(host, port, key); }, 500);
}
/** The local preview app started by the runner (display remote on PREVIEW_PORT). */
export function connectLocalPreview(): void { connectPreview('127.0.0.1', PREVIEW_PORT); }
export function disconnectPreview(): void {
  wanted = '';
  if (retry >= 0) { clearTimeout(retry); retry = -1; }
  const s = session;
  session = null;
  if (s !== null) { s.reconnect = false; s.close(); }
  setConnected(false);
  setStats('');
  setPreview('Not connected');
}
/** Draws the remote screen in a canvas node and forwards the pointer / keys (zinc:remote Session.view). */
export function drawPreview(x: number, y: number, w: number, h: number): boolean {
  const s = session;
  if (s === null || !s.connected) return false;
  s.view(x, y, w, h);
  return true;
}
/** Once a second: frames/s, round trip and bandwidth for the Robot view toolbar. */
export function updateStats(): void {
  const s = session;
  if (s === null || !s.connected) { if (statsSig() !== '') setStats(''); return; }
  setStats(`${s.width}x${s.height} · ${s.fps.toFixed(0)} fps · ${s.latency.toFixed(0)} ms · ${s.kbps.toFixed(0)} KiB/s`);
}
