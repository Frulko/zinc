// ============================================================================
// services/system.ts — The system, through zinc-admin
// ============================================================================
// zinc-admin (image/files/usr/lib/zinc/zinc-admin) reads the machine (`status`) and changes it (SSH, the agent, the name,
// the Wi-Fi country, power). On a computer it is not there: the status then comes from zinc:os and the changes fail with
// a sentence that says so. The network is zinc:network's (plugins/network).

import * as proc from 'zinc:process';
import * as os from 'zinc:os';
import * as fs from 'zinc:fs';
import { BYTES_PER_MIB } from '../constants';

/** What `zinc-admin status` says about the machine. */
export class SystemStatus {
  /** False on a computer without zinc-admin: only the name, the system and the memory are known. */
  fromHelper: boolean = false;
  hostname: string = '';
  model: string = '';
  osName: string = '';
  kernel: string = '';
  uptimeMinutes: i32 = 0;
  /** Degrees Celsius; -1 when unknown. */
  temperature: i32 = -1;
  memoryAvailableMiB: i32 = 0;
  memoryTotalMiB: i32 = 0;
  diskFreeMiB: i32 = 0;
  diskTotalMiB: i32 = 0;
  sshOn: boolean = false;
  agentOn: boolean = false;
  wifiCountry: string = '';
  /** systemd's state of the boot: 'starting' until every unit of the boot has started, then 'running' (or 'degraded'). */
  bootState: string = '';
  /** While the boot is starting: what systemd is doing (the description of the job it runs). */
  activity: string = '';

  /** True while the boot has units left to start (NetworkManager may not answer yet). */
  isStarting(): boolean {
    return this.bootState === 'starting' || this.bootState === 'initializing';
  }

  /** What the home page and the top bar show; they are redrawn only when it changes (not for the uptime or the temperature). */
  pageSignature(): string {
    return this.hostname + '|' + (this.agentOn ? 'agent' : '') + '|' + this.bootState + '|' + this.activity;
  }
}

function splitPair(text: string): string[] {
  const space = text.indexOf(' ');
  return space < 0 ? [text, ''] : [text.slice(0, space), text.slice(space + 1)];
}

function toInt(text: string): i32 {
  const value = parseInt(text);
  return isNaN(value) ? 0 : (value as i32);
}

export function parseStatus(text: string): SystemStatus {
  const status = new SystemStatus();
  status.fromHelper = true;
  for (const line of text.split('\n')) {
    const equals = line.indexOf('=');
    if (equals < 0) continue;
    const key = line.slice(0, equals);
    const value = line.slice(equals + 1);
    if (key === 'hostname') status.hostname = value;
    else if (key === 'model') status.model = value;
    else if (key === 'os') status.osName = value;
    else if (key === 'kernel') status.kernel = value;
    else if (key === 'uptime') status.uptimeMinutes = toInt(value);
    else if (key === 'temperature') status.temperature = toInt(value);
    else if (key === 'memory') {
      const parts = splitPair(value);
      status.memoryAvailableMiB = toInt(parts[0]);
      status.memoryTotalMiB = toInt(parts[1]);
    } else if (key === 'disk') {
      const parts = splitPair(value);
      status.diskFreeMiB = toInt(parts[0]);
      status.diskTotalMiB = toInt(parts[1]);
    } else if (key === 'ssh') status.sshOn = value === 'on';
    else if (key === 'agent') status.agentOn = value === 'on';
    else if (key === 'country') status.wifiCountry = value;
    else if (key === 'boot') status.bootState = value;
    else if (key === 'activity') status.activity = value;
  }
  return status;
}

/** The status of a computer without zinc-admin (a development machine): zinc:os. */
export function statusFromOs(): SystemStatus {
  const status = new SystemStatus();
  status.hostname = os.hostname();
  status.osName = os.type() + ' ' + os.release();
  status.uptimeMinutes = Math.floor(os.uptime() / 60) as i32;
  status.memoryAvailableMiB = Math.round(os.freemem() / BYTES_PER_MIB) as i32;
  status.memoryTotalMiB = Math.round(os.totalmem() / BYTES_PER_MIB) as i32;
  return status;
}

/** The answer of a zinc-admin call: its exit status and its output; `code` -1 when it could not start. */
export class AdminResult {
  code: i32;
  output: string;
  error: string;
  constructor(code: i32, output: string, error: string) {
    this.code = code;
    this.output = output;
    this.error = error;
  }
  /** The sentence to show for a failure: zinc-admin's last line of errors. */
  message(): string {
    const lines = this.error.trim().split('\n');
    const last = lines[lines.length - 1].trim();
    return last !== '' ? last : 'It failed (exit ' + this.code + ').';
  }
}

/** Runs `zinc-admin <args>` with `input` on its standard input. */
export function runAdmin(adminPath: string, args: string[], input: string): Promise<AdminResult> {
  return new Promise<AdminResult>((resolve) => {
    if (!fs.exists(adminPath)) {
      resolve(new AdminResult(-1, '', 'This works on the Raspberry Pi (no ' + adminPath + ' here).'));
      return;
    }
    let output = '';
    let error = '';
    let child: proc.Process;
    try {
      child = proc.spawn(adminPath, args, {});
    } catch (e) {
      resolve(new AdminResult(-1, '', 'zinc-admin did not start.'));
      return;
    }
    child.onData((chunk: string, isError: boolean) => {
      if (isError) error += chunk;
      else output += chunk;
    });
    child.onExit((code: i32) => resolve(new AdminResult(code, output, error)));
    if (input !== '') child.write(input + '\n');
    child.closeStdin();
  });
}
