// zinc:ble against the simulated radio (ZINC_NATIVE=sim): scan finds "Zinc sim" once, connect opens a link, 'ping' comes back, a message
// longer than a 20-byte chunk with multi-byte characters cut across chunks comes back whole, a text holding '\n' comes back as two
// messages, close ends the link with one onClose; a peripheral's advertise() gets the simulated central; stop() ends it; then the program
// ends by itself (nothing left going on). tests/t1/ble.sh compares the output with echo.out.
import * as ble from 'zinc:ble';

console.log(`state '${ble.state()}' service ${ble.UART_SERVICE}`);
const long = 'héllo wörld, ça va très bien — 12345 ✓';
const sent: string[] = ['ping', long, 'one\ntwo'];
let got = 0;

function peripheral(): void {
  ble.advertise('Zinc test',
    (l: ble.Link) => { console.log(`advertise: open ${l.name}`); l.send('hello'); },
    (l: ble.Link, text: string) => { console.log(`advertise: message '${text}'`); ble.stop(); },
    (l: ble.Link) => console.log(`advertise: close ${l.name}`));
}

let seen = 0;
ble.scan((d: ble.Device) => {
  seen++;
  console.log(`device ${d.name} ${d.id} ${d.rssi}`);
  setTimeout(() => {   // a few looks later: the device was reported once
    console.log(`seen ${seen}`);
    ble.stopScan();
    ble.connect(d.id,
      (l: ble.Link) => { console.log(`open ${l.name} ${l.id}`); for (const s of sent) l.send(s); },
      (l: ble.Link, text: string) => {
        console.log(`message '${text}'`);
        if (++got === 4) l.close();
      },
      (l: ble.Link) => {
        console.log(`close ${l.name}`);
        try { l.send('late'); } catch (e) { console.log((e as Error).message); }
        ble.connect('nobody', (k: ble.Link) => console.log('open nobody?'), (k: ble.Link, t: string) => {}, (k: ble.Link) => { console.log(`close '${k.id}' without open`); peripheral(); });
      });
  }, 100);
}, 0);
