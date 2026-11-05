// How an editor reaches the mapper without its QR code. The mapper announces itself on the network (zinc:link: its own DNS-SD service type, so it
// meets no other program's) and shows a code. A native client pairs with it once and finds it again wherever it moves; a page, which cannot browse,
// is opened at the mapper's address and sends the same code to /pair. Both come away with the editor's address and token.
import * as link from 'zinc:link';
import * as os from 'zinc:os';
import { startFleetMaster } from './fleetMaster';
import { listenForMaster } from './fleetPlayer';

const SERVICE = 'zinc-mapper';
const MAX_TRIES: i32 = 3;           // for a page, as zinc:link does for a program
const ASK_INTERVAL_MS = 10000;      // anyone on the network can ask for a code: it shows on the output, so not as often as they like

let webPort: i32 = -1;
let token = '';
let code = '';
let tries: i32 = 0;
let lastAsked = -1e12;
let linkPort: i32 = 0;

/** The TCP port others pair on, for the Devices view of a machine they cannot find. */
export function pairingPort(): i32 { return linkPort; }

function closeCode(): void {
  code = '';
  tries = 0;
}

/** The code to show now; '' when no pairing is open. */
export function pairingCode(): string { return code; }

export function openCode(): void {
  if (webPort < 0 || code !== '') return;
  code = link.openPairing();
  tries = 0;
  console.log(`mapper: pairing code ${code}`);
}

export function closeCodeNow(): void {
  if (code === '') return;
  link.closePairing();
  closeCode();
}

/** Someone with no code asks to see one. False when asked too soon. */
export function askForCode(): boolean {
  if (code !== '') return true;
  if (Date.now() - lastAsked < ASK_INTERVAL_MS) return false;
  lastAsked = Date.now();
  openCode();
  return true;
}

/** A code sent by a page: the token when it is the one on screen, '' when not. Three wrong ones close the pairing. */
export function pairPage(sent: string): string {
  if (code === '') return '';
  if (sent !== code) {
    tries++;
    if (tries >= MAX_TRIES) closeCodeNow();
    return '';
  }
  closeCodeNow();
  return token;
}

/** Starts announcing the editor at `port`. A network that refuses it leaves the address, the QR code and the code for a page. */
export function startPairing(port: i32, editorToken: string, name: string, keys: string): void {
  webPort = port;
  token = editorToken;
  try {
    const host = os.hostname();   // Android says localhost: the list shows the address beside the name
    const shown = name !== '' ? name : host === 'localhost' || host === '' ? 'Mapper' : `${host} mapper`;
    if (keys !== '') link.init({ name: shown, store: keys });
    else link.init({ name: shown });
    link.onPairing((state: string) => { if (state === 'closed' || state === 'paired') closeCode(); });
    link.onPaired((peer: link.Peer) => { closeCode(); });
    link.onConnection((channel: link.Channel) => {
      channel.send({ t: 'editor', port: webPort, token });
      listenForMaster(channel, shown);
    });
    linkPort = link.advertise({ service: SERVICE, info: `${port}` }) as i32;
    startFleetMaster(shown, port, token);
  } catch (e) {
    console.error(`mapper: not announced on the network: ${e}`);
    webPort = -1;
  }
}
