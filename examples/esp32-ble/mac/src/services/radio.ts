// The Bluetooth side: scan for devices that speak the UART service, connect to the first "Zinc" one, send and receive messages.
// zinc:ble calls back on the program's thread; every callback only updates the state. ZINC_NATIVE=sim (or ZINC_BLE_SIM=1) puts a
// simulated "Zinc sim" peripheral that echoes what it gets in place of the radio.
import * as ble from 'zinc:ble';
import { DEVICE_PREFIX, GREETING, FROM_ME, FROM_DEVICE } from '../constants';
import { setPhase, setProblem, setDevices, addDevice, setPeer, addLine, note } from '../state';

let link: ble.Link | null = null;

function opened(l: ble.Link): void {
  link = l;
  setPeer(l.name); setPhase('connected');
  console.log(`esp32-ble: connected to ${l.name}`);
  note(`connected to ${l.name}`);
  send(GREETING);
}
function received(l: ble.Link, text: string): void {
  console.log(`esp32-ble: received '${text}'`);
  addLine(FROM_DEVICE, text);
}
function closed(l: ble.Link): void {
  const was = link !== null;
  link = null;
  setPeer(''); setPhase('idle');
  note(was ? `${l.name} disconnected` : `could not connect to ${l.name !== '' ? l.name : l.id}`);
}

/** Scans until a "Zinc" device shows, then connects to it. The reason goes to the screen when Bluetooth cannot be used. */
export function startScan(): void {
  setDevices([]); setProblem('');
  try {
    ble.scan((d: ble.Device) => {
      addDevice(d);
      if (link !== null || !d.name.startsWith(DEVICE_PREFIX)) return;
      ble.stopScan();
      setPhase('connecting');
      ble.connect(d.id, opened, received, closed);
    }, 0);
    setPhase('scanning');
  } catch (e) {
    setProblem((e as Error).message); setPhase('error');
  }
}

export function send(text: string): void {
  if (link === null || text === '') return;
  try {
    (link as ble.Link).send(text);
    addLine(FROM_ME, text);
  } catch (e) {
    note((e as Error).message);
  }
}

export function disconnect(): void { if (link !== null) (link as ble.Link).close(); }
