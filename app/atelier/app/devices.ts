// The devices panel's state (ZN-729.06): the devices `zinc device list` finds on the network and the paired ones, pairing
// with the code a device shows, and the figures of the device Run goes to (`zinc device <name> top --json`: a sample a second
// while the panel is open). Everything is asked to the zinc binary, as the rest of Atelier does: no protocol here.
import { createSignal, createEffect } from 'zinc:ui/solid';
import * as sys from 'zinc:sys';
import * as proc from 'zinc:process';
import { active, activate, Buffer } from './workspace';
import { zinc, device, setDevice } from './tools';
import { Device, Figures, DeviceApp, parseDevices, parseFigures, sizeText } from '../model';
import { t } from './text';

const echo: boolean = sys.env('ZINC_ATELIER_ECHO') !== '';   // tests read what the panel says on Atelier's own output
/** How long the list waits for the answers of the network, in ms (the CLI's own second when unset; tests: 0, the paired devices only). */
const BROWSE: string = sys.env('ZINC_ATELIER_BROWSE');

export const [devices, setDevices] = createSignal<Device[]>([]);
/** False until the first list has come back: the panel says it is looking, not that there is nothing. */
export const [listed, setListed] = createSignal<boolean>(false);
export const [devicesOpen, setDevicesOpen] = createSignal<boolean>(false);
/** The last sample of the device Run goes to; null while it has not answered (or no longer does). */
export const [figures, setFigures] = createSignal<Figures | null>(null);
/** One line under the pairing form: what just happened, or what went wrong (`noteBad`). */
export const [note, setNote] = createSignal<string>('');
export const [noteBad, setNoteBad] = createSignal<boolean>(false);
/** The pairing form: the device's name or its address, and the code it shows. */
export const [who, setWho] = createSignal<string>('');
export const [code, setCode] = createSignal<string>('');
export const [pairing, setPairing] = createSignal<boolean>(false);
export function none(): string { return t('atelier.device.none'); }

function tell(text: string, bad: boolean = false): void {
  setNote(text); setNoteBad(bad);
  if (echo && text !== '') console.log('[devices] ' + text);
}
export function isPaired(d: Device): boolean { return d.state.startsWith('paired'); }
/** A device's state in the panel's words (the CLI's: paired, "paired, not seen", "pairing open", "not paired"). */
export function stateText(d: Device): string {
  if (device() === d.name && figures() !== null) return t('atelier.device.connected');
  if (d.state === 'paired') return t('atelier.device.paired');
  if (isPaired(d)) return t('atelier.device.paired_unseen');
  return t(d.state === 'pairing open' ? 'atelier.device.shows_code' : 'atelier.device.needs_code');
}
/** The figures as one line (the echo of tests; the panel shows them as rows). */
export function figuresText(f: Figures): string {
  return `${f.name}: load ${f.load.toFixed(2)}, memory ${sizeText(f.memFree)} free of ${sizeText(f.memTotal)}, temperature ${f.temp < 0 ? 'not given' : f.temp.toFixed(1) + ' C'}, apps `
    + (f.apps.length === 0 ? 'none' : f.apps.map((a: DeviceApp) => `${a.name} ${a.running ? 'running' : 'stopped'}`).join(' '));
}
/** Everything the panel says now, as text: a scripted session waits for a part of it. */
export function panelText(): string {
  const f = figures();
  return note() + '\n' + (listed() && devices().length === 0 ? none() : '') + devices().map((d: Device) => `${d.name} ${stateText(d)}`).join('\n') + '\n' + (f === null ? '' : figuresText(f as Figures));
}

/** What a failed `zinc device` command said, in the panel's words: the usual mistakes of a first pairing, else the CLI's own sentence. */
function plain(out: string): string {
  const at = out.lastIndexOf('zinc device: ');
  const said = (at < 0 ? out : out.slice(at + 13)).trim().split('\n')[0];
  // the EC J-PAKE handshake of `zinc device pair` fails on a TLS alert when the codes differ; a timeout is a slow device, not a wrong code
  if (said.startsWith('wrong code') || (said.startsWith('pairing failed: SSL') && !said.includes('timed out'))) return t('atelier.device.wrong_code');
  if (said.startsWith('pairing is closed')) return t('atelier.device.pairing_closed');
  if (said.startsWith('nothing answers')) return t('atelier.device.no_answer');
  return said === '' ? t('atelier.device.failed') : said.charAt(0).toUpperCase() + said.slice(1);
}

/** Runs `zinc device <args>` to its end: `then` gets its exit status and what it printed. */
function ask(args: string[], then: (status: i32, out: string) => void): void {
  let out = '';
  try {
    const p = zinc(['device'].concat(args), '');
    p.onData((chunk: string, stderr: boolean) => { out += chunk; });
    p.onExit((status: i32) => then(status, out));
  } catch (e) { tell(t('atelier.run.no_zinc', ['path', 'zinc']), true); }
}

/** Lists the devices again; `then` names one to send Run to once it is in the list (the one just paired). `wait` is how long
 *  the network is listened to, in ms: '0' reads the paired devices and nothing else (the start of Atelier, for the run menu). */
export function refresh(then: string = '', wait: string = BROWSE): void {
  ask(['list', '--json'].concat(wait !== '' ? ['--wait', wait] : []), (status: i32, out: string) => {
    const list = parseDevices(out);
    setDevices(list); setListed(true);
    if (echo) console.log('[devices] list: ' + (list.length === 0 ? 'none' : list.map((d: Device) => `${d.name} (${d.state})`).join(', ')));
    if (status !== 0) tell(plain(out), true);
    else if (then !== '') setDevice(then);
  });
}

/** Pairs with the device of the form, with the code typed. */
export function pair(): void {
  const w = who().trim(), c = code().trim();
  if (pairing()) return;
  if (w === '') { tell(t('atelier.device.type_name'), true); return; }
  if (c === '') { tell(t('atelier.device.type_code'), true); return; }
  setPairing(true);
  tell(t('atelier.device.pairing', ['device', w]));
  ask(['pair', w, c], (status: i32, out: string) => {
    setPairing(false);
    if (status !== 0) { tell(plain(out), true); return; }
    const at = out.indexOf('paired with '), end = out.indexOf(' (', at);
    const name = at < 0 || end < 0 ? w : out.slice(at + 12, end);
    setWho(''); setCode('');
    tell(t('atelier.device.paired_with', ['device', name]));
    refresh(name);
  });
}

/** Run goes to this paired device; chosen again, back to this computer. */
export function choose(name: string): void {
  const off = device() === name;
  setDevice(off ? '' : name);
  tell(off ? t('atelier.device.back_here') : t('atelier.device.chosen', ['device', name]));
}

export function openDevices(): void { setListed(false); setDevicesOpen(true); refresh(); }
export function closeDevices(): void {
  setDevicesOpen(false);
  const b = active();
  if (b !== null) activate(b as Buffer);
}

// ---- the figures: `top --json` of the chosen device, for as long as the panel shows them
let top: proc.Process | null = null;
function watch(name: string): void {
  const old = top;
  top = null;
  if (old !== null) (old as proc.Process).kill();
  setFigures(null);
  if (name === '') return;
  try {
    const p = zinc(['device', name, 'top', '--json'], '');
    top = p;
    p.onStdout((line: string) => {
      const f = top === p ? parseFigures(line) : null;
      if (f === null) return;
      setFigures(f);
      if (echo) console.log('[devices] ' + figuresText(f as Figures));
    });
    p.onStderr((line: string) => { if (top === p) tell(`${name}: ${plain(line)}`, true); });
    p.onExit((status: i32) => { if (top === p) { top = null; setFigures(null); } });
  } catch (e) { top = null; }
}
createEffect(() => { watch(devicesOpen() ? device() : ''); });
