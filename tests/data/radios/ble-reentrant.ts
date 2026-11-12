import * as ble from './ble';
import { step } from './ble-fake';
function check(value: boolean, message: string): void { if (!value) throw new Error(message); }
const FS = '\u001f', RS = '\u001e';
let original = 0, replacement = 0;
ble.scan((d: ble.Device): void => {
  original++;
  ble.stopScan();
  ble.scan((next: ble.Device): void => { replacement++; }, 0);
}, 0);
step(`device${FS}-1${FS}first${FS}one${FS}-42${RS}device${FS}-1${FS}second${FS}two${FS}-50${RS}`);
check(original === 1 && replacement === 0, 'old public poll delivered to replacement scan');
step(`device${FS}-1${FS}third${FS}three${FS}-60${RS}`);
check(replacement === 1, 'replacement scan did not run');
let raw = 0;
ble.scanAll((d: ble.Advertisement): void => {
  raw++;
  check(d.name === 'name\u001f\u001e' && d.rssi === -42, 'raw name or RSSI changed');
  check(d.manufacturerData.length === 1 && d.manufacturerData[0].company === 65535 && d.manufacturerData[0].data.join(',') === '0,255,31,30', 'manufacturer bytes changed');
  check(d.serviceData[0].uuid === 'uuid' && d.serviceData[0].data.join(',') === '255,0,10', 'service bytes changed');
  check(d.advertisingData[0].type === 48 && d.advertisingData[0].data.join(',') === '30,255', 'advertising data changed');
  ble.stop();
}, 0);
const row = 'raw1\t6e616d651f1e\t-42\t\t65535=00ff1f1e,\t75756964=ff000a,\t48=1eff,\n';
step('', row + row);
check(raw === 1, 'raw callback after stop');
let opened = 0, closed = 0;
ble.connect('peer', (l: ble.Link): void => { opened++; l.close(); }, (l: ble.Link, s: string): void => {}, (l: ble.Link): void => { closed++; });
step(`open${FS}1${FS}peer${FS}name${RS}open${FS}1${FS}peer${FS}name${RS}close${FS}1${RS}`);
check(opened === 1 && closed === 1, 'link did not close once under reentrant open');
ble.stop();
console.log('ble public discovery and reentrancy ok');
