// zinc:network — the machine's network connections (docs/plugins/network.md): its interfaces with their state and
// addresses, the Wi-Fi networks around, joining and forgetting one. On Linux it drives NetworkManager through nmcli
// (Raspberry Pi OS, Debian, Ubuntu, Fedora); where nmcli is missing (macOS, Windows, a Linux without NetworkManager) the
// status lists the addresses from zinc:os and Wi-Fi calls answer with a sentence saying it is not managed here.
// Every call is asynchronous: nmcli runs as a child process (zinc:process), the program's frames go on meanwhile.
import * as proc from 'zinc:process';
import * as os from 'zinc:os';

/** The sentence a Wi-Fi call answers where NetworkManager is not there. */
export const NOT_MANAGED = 'Wi-Fi is not managed by Zinc on this system (it needs NetworkManager).';

export class NetworkInterface {
  name: string = '';
  /** 'wifi', 'ethernet' or another of NetworkManager's types ('other' without it). */
  kind: string = 'other';
  /** 'connected', 'connecting', 'disconnected', 'unavailable', 'unmanaged'; 'connected' when it has an address without NetworkManager. */
  state: string = '';
  /** Its IPv4 address, '' when none. */
  address: string = '';
}

export class NetworkStatus {
  /** True when NetworkManager answers: Wi-Fi can be listed and joined. */
  managed: boolean = false;
  interfaces: NetworkInterface[] = [];
  /** The name (SSID) of the Wi-Fi network joined, '' when none. */
  wifiNetwork: string = '';

  /** True when an interface has an address. */
  isConnected(): boolean {
    for (const nic of this.interfaces) if (nic.address !== '') return true;
    return false;
  }
  /** True when an interface of `kind` is connected. */
  hasConnected(kind: string): boolean {
    for (const nic of this.interfaces) if (nic.kind === kind && nic.state === 'connected') return true;
    return false;
  }
  /** One string that changes when what a screen shows of the status changes. */
  signature(): string {
    const parts: string[] = [this.managed ? 'managed' : '', this.wifiNetwork];
    for (const nic of this.interfaces) parts.push(nic.name + ' ' + nic.kind + ' ' + nic.state + ' ' + nic.address);
    return parts.join('|');
  }
}

export class WifiNetwork {
  /** Its name; hidden networks (no name) are left out. */
  ssid: string = '';
  /** 0 to 100. */
  signal: i32 = 0;
  secured: boolean = false;
  /** The network joined now. */
  inUse: boolean = false;
}

export class WifiScan {
  networks: WifiNetwork[] = [];
  /** '' when the scan worked, else why it did not. */
  error: string = '';
}

class Answer {
  code: i32 = -1;
  output: string = '';
  error: string = '';
}

/** Runs nmcli; code -1 when it is not there. */
function nmcli(args: string[]): Promise<Answer> {
  return new Promise<Answer>((resolve) => {
    const answer = new Answer();
    let child: proc.Process;
    try {
      child = proc.spawn('nmcli', args, {});
    } catch (e) {
      resolve(answer);
      return;
    }
    child.closeStdin();
    child.onData((chunk: string, isError: boolean) => {
      if (isError) answer.error += chunk;
      else answer.output += chunk;
    });
    child.onExit((code: i32) => {
      answer.code = code;
      resolve(answer);
    });
  });
}

/** nmcli's last line of errors without its "Error: " prefix, or a sentence with the exit code. */
function failure(answer: Answer): string {
  if (answer.code === -1) return NOT_MANAGED;
  const lines = answer.error.trim().split('\n');
  let last = lines[lines.length - 1].trim();
  if (last.startsWith('Error: ')) last = last.slice(7);
  return last !== '' ? last : 'nmcli failed (exit ' + answer.code + ').';
}

function toInt(text: string): i32 {
  const value = parseInt(text);
  return isNaN(value) ? 0 : (value as i32);
}

/**
 * The interfaces of `nmcli -t -e no -f GENERAL.DEVICE,GENERAL.TYPE,GENERAL.STATE,IP4.ADDRESS device show`: blocks of
 * KEY:value lines, one per device ("GENERAL.STATE:100 (connected)", "IP4.ADDRESS[1]:192.168.2.40/24"); loopback is left out.
 */
export function parseDeviceShow(text: string): NetworkInterface[] {
  const interfaces: NetworkInterface[] = [];
  let current: NetworkInterface | null = null;
  for (const line of text.split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon);
    const value = line.slice(colon + 1).trim();
    if (key === 'GENERAL.DEVICE') {
      current = new NetworkInterface();
      current.name = value;
      interfaces.push(current);
    } else if (current !== null) {
      const nic = current as NetworkInterface;
      if (key === 'GENERAL.TYPE') nic.kind = value;
      else if (key === 'GENERAL.STATE') {
        const open = value.indexOf('(');
        const close = value.indexOf(')');
        nic.state = open >= 0 && close > open ? value.slice(open + 1, close).split(' ')[0] : value;
      } else if (key.startsWith('IP4.ADDRESS') && nic.address === '' && value !== '') {
        const slash = value.indexOf('/');
        nic.address = slash < 0 ? value : value.slice(0, slash);
      }
    }
  }
  return interfaces.filter((nic: NetworkInterface) => nic.kind !== 'loopback');
}

/** The SSID of the line "yes:<ssid>" of `nmcli -t -e no -f ACTIVE,SSID device wifi list`, '' when none is active. */
export function parseActiveWifi(text: string): string {
  for (const line of text.split('\n')) if (line.startsWith('yes:')) return line.slice(4);
  return '';
}

/**
 * The lines "in-use:signal:security:ssid" of `nmcli -t -e no -f IN-USE,SIGNAL,SECURITY,SSID device wifi list` (the
 * SSID last, so a colon in it is kept): one entry per name, the strongest access point's signal, joined first, then the
 * strongest.
 */
export function parseWifiList(text: string): WifiNetwork[] {
  const networks: WifiNetwork[] = [];
  for (const line of text.split('\n')) {
    const first = line.indexOf(':');
    const second = first < 0 ? -1 : line.indexOf(':', first + 1);
    const third = second < 0 ? -1 : line.indexOf(':', second + 1);
    if (third < 0) continue;
    const ssid = line.slice(third + 1);
    if (ssid === '') continue;
    const inUse = line.slice(0, first).trim() === '*';
    const signal = toInt(line.slice(first + 1, second));
    const security = line.slice(second + 1, third).trim();
    let known: WifiNetwork | null = null;
    for (const other of networks) if (other.ssid === ssid) known = other;
    if (known === null) {
      const network = new WifiNetwork();
      network.ssid = ssid;
      network.signal = signal;
      network.secured = security !== '' && security !== '--';
      network.inUse = inUse;
      networks.push(network);
    } else {
      const existing = known as WifiNetwork;
      existing.inUse = existing.inUse || inUse;
      if (signal > existing.signal) existing.signal = signal;
    }
  }
  networks.sort((a: WifiNetwork, b: WifiNetwork) => (a.inUse !== b.inUse ? (a.inUse ? -1 : 1) : b.signal - a.signal));
  return networks;
}

/** The status without NetworkManager: the interfaces of zinc:os that have an IPv4 address. */
function statusFromOs(): NetworkStatus {
  const status = new NetworkStatus();
  for (const entry of os.networkInterfaces()) {
    if (entry.internal || entry.family !== 'IPv4') continue;
    const nic = new NetworkInterface();
    nic.name = entry.name;
    nic.state = 'connected';
    nic.address = entry.address;
    status.interfaces.push(nic);
  }
  return status;
}

/** The interfaces and the Wi-Fi network joined. */
export async function readStatus(): Promise<NetworkStatus> {
  const devices = await nmcli(['-t', '-e', 'no', '-f', 'GENERAL.DEVICE,GENERAL.TYPE,GENERAL.STATE,IP4.ADDRESS', 'device', 'show']);
  if (devices.code !== 0) return statusFromOs();
  const status = new NetworkStatus();
  status.managed = true;
  status.interfaces = parseDeviceShow(devices.output);
  if (status.hasConnected('wifi')) {
    const active = await nmcli(['-t', '-e', 'no', '-f', 'ACTIVE,SSID', 'device', 'wifi', 'list', '--rescan', 'no']);
    if (active.code === 0) status.wifiNetwork = parseActiveWifi(active.output);
  }
  return status;
}

/** The networks around; `rescan` asks the Wi-Fi chip for a fresh scan (a few seconds) instead of the last one. */
export async function listWifiNetworks(rescan: boolean): Promise<WifiScan> {
  const answer = await nmcli(['-t', '-e', 'no', '-f', 'IN-USE,SIGNAL,SECURITY,SSID', 'device', 'wifi', 'list', '--rescan', rescan ? 'yes' : 'auto']);
  const scan = new WifiScan();
  if (answer.code === 0) scan.networks = parseWifiList(answer.output);
  else scan.error = failure(answer);
  return scan;
}

/**
 * Joins `ssid` with `password` ('' for an open network), turning the Wi-Fi radio on first. Resolves with '' once
 * connected, else with why not ("Connection activation failed: Secrets were required, but not provided." for a wrong
 * password).
 */
export async function joinWifi(ssid: string, password: string): Promise<string> {
  const radio = await nmcli(['radio', 'wifi', 'on']);
  if (radio.code !== 0) return failure(radio);
  const args: string[] = ['--wait', '45', 'device', 'wifi', 'connect', ssid];
  // ponytail: the password reaches nmcli as an argument (other local users can read it while nmcli runs); --ask on stdin if that matters
  if (password !== '') {
    args.push('password');
    args.push(password);
  }
  const answer = await nmcli(args);
  return answer.code === 0 ? '' : failure(answer);
}

/** Deletes the saved connections of `ssid`; resolves with '' or why not. */
export async function forgetWifi(ssid: string): Promise<string> {
  const list = await nmcli(['-t', '-f', 'UUID,TYPE', 'connection', 'show']);
  if (list.code !== 0) return failure(list);
  let deletedOne = false;
  for (const line of list.output.split('\n')) {
    if (!line.endsWith(':802-11-wireless')) continue;
    const uuid = line.slice(0, line.length - ':802-11-wireless'.length);
    const shown = await nmcli(['-g', '802-11-wireless.ssid', 'connection', 'show', uuid]);
    if (shown.code !== 0 || shown.output.trim() !== ssid) continue;
    const deleted = await nmcli(['connection', 'delete', uuid]);
    if (deleted.code !== 0) return failure(deleted);
    deletedOne = true;
  }
  return deletedOne ? '' : 'No saved connection to "' + ssid + '".';
}
