// zinc:webos — HP webOS 3 (HP TouchPad): the system's services from a Zinc program (docs/reports/hardware/hp-touchpad-webos.md).
// A program installed as a webOS application talks to the Luna bus with the rights of its id. Elsewhere isWebOS() is false and the calls
// answer false, so one program runs on a desktop and on the tablet.
import W from './native/webos.spec';
import { exists, readText, writeText, remove } from 'zinc:fs';
import { pid, device } from 'zinc:sys';

/** True when the program runs on webOS. */
export function isWebOS(): boolean { return W.available(); }
/** Sends a request to a service of the Luna bus ('palm://com.palm.applicationManager/launch') with its parameters, a JSON object as text.
 *  The answer is not waited for. False when it could not be sent. */
export function serviceCall(uri: string, params: string): boolean { return W.call(uri, params); }
/** Why the last serviceCall or launch answered false. */
export function lastError(): string { return W.error(); }
/** Starts (or brings to the front) an installed application by its id, with launch parameters as a JSON object. */
export function launch(appId: string, params: string = '{}'): boolean {
  return W.call('palm://com.palm.applicationManager/launch', `{"id":${JSON.stringify(appId)},"params":${params}}`);
}
/** Lets the system turn the screen off after its timeout (true, the default) or keeps it on while the program is in front (false).
 *  A program that blanks the screen itself (a wall remote) keeps the screen on for the system so touches keep coming. */
export function screenTimeout(enable: boolean): boolean { return W.screenTimeout(enable); }

// ---------------------------------------------------------------- what the root helper does for a program (plugins/webos/helper.sh)
// A program's jail may not change the CPU's governor, the backlight, the lights or the firewall; zinc-helper, a root job installed once
// with next/tools/webos-helper, does it on request. The requests are files in /tmp/zinc, which the jail shares; they hold the program's
// pid, so the helper drops them when the program is gone. Off webOS the call goes to `device()` of zinc:sys: a simulated device
// (zinc run --simulate hp-touchpad) shows it in its panel; elsewhere it answers false, as when the helper is not installed.

const Z = '/tmp/zinc';

/** True when zinc-helper runs on this device (next/tools/webos-helper installs it). */
export function helperRunning(): boolean {
  if (!isWebOS() || !exists(`${Z}/helper.pid`)) return false;
  try { return exists(`/proc/${readText(`${Z}/helper.pid`).trim()}`); } catch (e) { return false; }
}
/** A request: `kind` and `value` for a simulated device, `file` and its `text` (null: removed) for zinc-helper on the tablet. */
function ask(kind: string, value: string, file: string, text: string | null): boolean {
  if (!isWebOS()) return device(kind, value) === '1';
  if (!helperRunning()) return false;
  try { if (text === null) remove(file); else writeText(file, text); return true; } catch (e) { return false; }
}
/** Full speed while this program asks for it (and lives): both cores at the `performance` governor. webOS's own governor keeps the CPU at
 *  192 MHz with one core until a touch, so an animation the user does not touch runs at 30 to 40 frames a second and a first draw stalls.
 *  Ask for it while the program is on the screen; let it go when it hides or sleeps. */
export function setPerformance(on: boolean): boolean { return ask('performance', on ? '1' : '0', `${Z}/perf/${pid()}`, on ? '' : null); }
/** The screen's backlight: off keeps the display on for the system (touches still come; see screenTimeout) and dark; it comes back when
 *  this program asks or ends. */
export function setBacklight(on: boolean): boolean { return ask('backlight', on ? '1' : '0', `${Z}/backlight`, on ? 'on\n' : `off ${pid()}\n`); }
/** Opens a port of the firewall to incoming TCP and UDP while this program lives: a server, or the answers to an SSDP search sent from it. */
export function openPort(port: i32): boolean { return ask('port', `${port}`, `${Z}/ports/${port}`, `${pid()}\n`); }
/** The lights of the Center button (the TouchPad's notification light): 'on', 'off' or 'blink', until this program ends. */
export function setIndicator(mode: string): boolean { return ask('indicator', mode, `${Z}/indicator`, `${mode} ${pid()}\n`); }
/** The processor now (zinc-helper, or a simulated device): its clock and top clock in MHz, the cores online, the governor
 *  ('performance' at full speed, 'ondemandtcl' webOS's own); null when unknown. */
export class Cpu { mhz: number = 0; maxMhz: number = 0; cores: i32 = 0; governor: string = ''; }
export function cpu(): Cpu | null {
  const s = device('cpu');
  if (s === '') return null;
  const j = JSON.parse(s), c = new Cpu();
  c.mhz = (j.freq as number) / 1000; c.maxMhz = (j.max as number) / 1000; c.cores = j.cores as i32; c.governor = '' + j.governor;
  return c;
}
